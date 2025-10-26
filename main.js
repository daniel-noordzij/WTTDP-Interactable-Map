
// =====================
// Core config
// =====================
const TILE = 100; // px
const MIN_SCALE = 0.4;
const MAX_SCALE = 4;

const VIRT_BUFFER_TILES = 2;
const SHOW_LABELS_MIN_SCALE = 1; // hide labels when zoomed far out

// DOM refs
const viewport = document.getElementById('viewport');
const world = document.getElementById('world');
const panel = document.getElementById('panel');
const detailsEl = document.getElementById('details');

const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const resetBtn = document.getElementById('resetView');

// World transform state
let scale = 1;
let translateX = 0;
let translateY = 0;

let isPanning = false;
let startPan = { x: 0, y: 0 };
let startTranslate = { x: 0, y: 0 };

// Data + virtualization state
let currentTiles = [];
let tileMap = new Map();      // "X,Y" -> tile
let domByKey = new Map();     // "X,Y" -> element
const pool = [];              // recycled tile nodes
let rafId = null;

// Pan/click gating
let didPan = false;
const PAN_THRESHOLD = 6; // pixels
const PAN_HYDRATE_BUDGET = 60;
let hydrateQueue = [];
let lastDragDist = 0;
let suppressNextClick = false;

function applyTransform() {
  world.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
  scheduleRefreshVisibleTiles();
}

function scheduleRefreshVisibleTiles() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    refreshVisibleTiles();
  });
}

function worldToLocal(clientX, clientY) {
  // Convert screen coords to world-local coords (pre-transform)
  const rect = viewport.getBoundingClientRect();
  const x = (clientX - rect.left - translateX) / scale;
  const y = (clientY - rect.top - translateY) / scale;
  return { x, y };
}

function setScaleAt(newScale, clientX, clientY) {
  newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
  const before = worldToLocal(clientX, clientY);
  scale = newScale;
  const after = worldToLocal(clientX, clientY);
  // adjust translate so the point under the cursor stays in place
  translateX += (after.x - before.x) * scale;
  translateY += (after.y - before.y) * scale;
  applyTransform();
}

function zoomBy(factor, clientX, clientY) {
  setScaleAt(scale * factor, clientX, clientY);
}

function resetView() {
  const vp = viewport.getBoundingClientRect();
  scale = 1;

  // Center X=0, Y=0 tile in the middle of the screen
  translateX = vp.width / 2 - TILE / 2;
  translateY = vp.height / 2 - TILE / 2;

  applyTransform();
}

function computeBounds(items) {
  if (!items || !items.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of items) {
    const left = t.Y * TILE;
    const top  = -t.X * TILE;
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, left + TILE);
    maxY = Math.max(maxY, top + TILE);
  }
  return { minX, minY, maxX, maxY };
}

function fitToBounds(b, padding = 0) {
  const vp = viewport.getBoundingClientRect();
  const w = b.maxX - b.minX + padding * 2;
  const h = b.maxY - b.minY + padding * 2;
  const sx = vp.width / w;
  const sy = vp.height / h;
  const target = Math.min(sx, sy, MAX_SCALE);
  scale = Math.max(MIN_SCALE, target);
  translateX = (vp.width - (b.maxX - b.minX) * scale) / 2 - b.minX * scale;
  translateY = (vp.height - (b.maxY - b.minY) * scale) / 2 - b.minY * scale;
  applyTransform();
}

// Fillers over a fixed range (user set to 30 for perf)
function fillMissingTiles(data) {
  const filled = [];
  const map = new Map(data.map(t => [`${t.X},${t.Y}`, t]));

  const minX = -50, maxX = 50;
  const minY = -50, maxY = 50;

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const key = `${x},${y}`;
      if (map.has(key)) {
        filled.push(map.get(key));
      } else {
        filled.push({
          X: x,
          Y: y,
          Name: `${x},${y}`,
          DisplayedText: '',
          DirectionsAccessible: [],
          Options: [],
          Endings: [],
          AccessibleOnFoot: false,
          HasCollectible: false,
          RequiresItemToAccess: false,
          IsDoorToOtherMap: false,
          tileBackgroundColor: '#ffffff33',
          isPlaceholder: true
        });
      }
    }
  }

  return filled;
}

// =====================
// Render / Virtualize
// =====================
function renderTiles(data) {
  // Seed state only; actual DOM is handled by virtualization
  currentTiles = data;
  tileMap = new Map(currentTiles.map(t => [`${t.X},${t.Y}`, t]));
  scheduleRefreshVisibleTiles();
}

function refreshVisibleTiles() {
  if (!currentTiles.length) return;

  // Fixed grid extents for virtualization (match fillMissingTiles)
  const GRID_MIN_X = -50, GRID_MAX_X = 50;
  const GRID_MIN_Y = -50, GRID_MAX_Y = 50;

  // Visible world-rect (in *world* pixels)
  const rect = viewport.getBoundingClientRect();
  const topLeft  = worldToLocal(rect.left,  rect.top);
  const botRight = worldToLocal(rect.right, rect.bottom);

  // Convert world pixels to grid coords.
  // Mapping: left = Y*TILE, top = -X*TILE
  // => Y = floor(x / TILE), X = -floor(y / TILE)
  const minY = Math.floor(topLeft.x  / TILE) - VIRT_BUFFER_TILES;
  const maxY = Math.floor(botRight.x / TILE) + VIRT_BUFFER_TILES;
  const minX = -Math.floor(botRight.y / TILE) - VIRT_BUFFER_TILES;
  const maxX = -Math.floor(topLeft.y  / TILE) + VIRT_BUFFER_TILES;

  // Clamp to data extents
  const fromX = Math.max(minX, GRID_MIN_X);
  const toX   = Math.min(maxX, GRID_MAX_X);
  const fromY = Math.max(minY, GRID_MIN_Y);
  const toY   = Math.min(maxY, GRID_MAX_Y);

  const needed = new Set();
  const noLabels = scale < SHOW_LABELS_MIN_SCALE;

  for (let X = fromX; X <= toX; X++) {
    for (let Y = fromY; Y <= toY; Y++) {
      const key = `${X},${Y}`;
      needed.add(key);

      let el = domByKey.get(key);
      if (!el) {
        el = acquireTileEl();
        world.appendChild(el);
        domByKey.set(key, el);
      }

      // Always keep dataset.key in sync
      el.dataset.key = key;

      // Toggle label visibility
      if (noLabels) el.classList.add('no-label');
      else el.classList.remove('no-label');

      // Position first (cheap)
      positionTileEl(el, X, Y);

      const tileData = tileMap.get(key);

      // Always apply cheap style updates immediately (so “new stuff” shows up)
      hydrateTileEl(el, tileData, { styleOnly: isPanning });

      // While panning, queue labels for progressive fill-in
      if (isPanning) {
        hydrateQueue.push(key);
      } else {
        // Not panning: render labels immediately
        hydrateTileEl(el, tileData, { styleOnly: false });
      }
    }
  }

  // Remove DOM nodes that are no longer needed
  for (const [key, el] of domByKey) {
    if (!needed.has(key)) {
      domByKey.delete(key);
      releaseTileEl(el);
    }
  }

  // Remove any queued entries for tiles that got recycled/offscreen
  if (hydrateQueue.length) {
    // lightweight prune
    hydrateQueue = hydrateQueue.filter((key) => domByKey.has(key));
  }

  // Process a small batch of label hydrations per frame
  processHydrateQueue(isPanning ? PAN_HYDRATE_BUDGET : Infinity);
}

// Position a tile DOM element from grid coords (GPU transforms)
function positionTileEl(el, X, Y) {
  const px = Y * TILE;
  const py = -X * TILE;
  el.style.transform = `translate3d(${px}px, ${py}px, 0)`;
  el.style.width = `${TILE}px`;
  el.style.height = `${TILE}px`;
}

// Fill content/styling into a tile element (cached to avoid redundant writes)
function hydrateTileEl(el, t, { styleOnly = false } = {}) {
  if (!t) return;

  // Background color (cache)
  const bg = t.tileBackgroundColor || '#f3f4f6';
  if (el._bg !== bg) {
    el.style.backgroundColor = bg;
    el._bg = bg;
  }

  // Placeholder styling (cache)
  const placeholder = !!t.isPlaceholder;
  if (el._ph !== placeholder) {
    el.style.opacity = placeholder ? 0.6 : '';
    el.style.fontStyle = placeholder ? 'italic' : '';
    el._ph = placeholder;
  }

  if (styleOnly) return; // ← during pan we can skip label to stay smooth

  // Label content (cache) — exclude placeholders from dash split
  let html;
  if (!t.isPlaceholder && t.Name?.includes('-')) {
    const [before, after] = t.Name.split('-', 2);
    html = `<div class="label two-line"><strong>${escapeHTML(before.trim())}</strong><span>${escapeHTML(after.trim())}</span></div>`;
  } else {
    html = `<div class="label"><strong>${escapeHTML(t.Name || `${t.X},${t.Y}`)}</strong></div>`;
  }
  if (el._label !== html) {
    el.innerHTML = html;
    el._label = html;
  }
}

function processHydrateQueue(budget) {
  let count = 0;
  while (count < budget && hydrateQueue.length) {
    const key = hydrateQueue.shift();
    const el = domByKey.get(key);
    const t = tileMap.get(key);
    if (el && t) {
      // full label hydrate now
      hydrateTileEl(el, t, { styleOnly: false });
      count++;
    }
  }
}

// Node pooling helpers
function acquireTileEl() {
  const el = pool.pop() || document.createElement('div');
  el.className = 'tile';
  el.style.transform = '';
  el.innerHTML = '';
  el.removeAttribute('data-key');
  el.classList.remove('selected', 'no-label');
  el._label = el._bg = el._ph = undefined;
  return el;
}

function releaseTileEl(el) {
  el.remove();
  el.removeAttribute('data-key');
  el.className = 'tile';
  el.style.transform = '';
  el.innerHTML = '';
  el.classList.remove('selected', 'no-label');
  el._label = el._bg = el._ph = undefined;
  pool.push(el);
}

// =====================
// Selection / Details
// =====================
function renderDetailsHTML(t) {
  const kv = (k, v) => `<div class="kv"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const list = (arr) =>
    arr && arr.length
      ? arr.map(a => `<span class="badge">${escapeHTML(String(a))}</span>`).join('')
      : '<span class="badge">None</span>';

  const boolBadge = (label, state) => `
    <div class="bool-item ${state ? 'true' : 'false'}">
      <span class="icon">${state ? '✓' : '✕'}</span>
      <span>${label}</span>
    </div>
  `;

  return `
    ${kv('Name', escapeHTML(t.Name ?? ''))}

    <div class="kv">
      <div class="k">Alternative Names</div>
      <div class="badges">${list(t.AlternativeNames ?? [])}</div>
    </div>

    ${kv('Coordinates', `X: <strong>${t.X}</strong>, Y: <strong>${t.Y}</strong>`)}
    <div class="kv">
      <div class="k">Directions Accessible</div>
      <div class="badges">${list(t.DirectionsAccessible ?? [])}</div>
    </div>
    <div class="kv">
      <div class="k">Endings</div>
      <div class="badges">${list(t.Endings ?? [])}</div>
    </div>
    <div class="kv">
      <div class="k">Attributes</div>
      <div class="bool-list">
        ${boolBadge('Accessible', t.AccessibleOnFoot)}
        ${boolBadge('Has collectible', t.HasCollectible)}
        ${boolBadge('Requires item to access', t.RequiresItemToAccess)}
        ${boolBadge('Door to other map', t.IsDoorToOtherMap)}
      </div>
    </div>
    <div class="kv">
      <div class="k">Options</div>
      <div class="badges">${list(t.Options ?? [])}</div>
    </div>
    ${kv('Displayed text', escapeHTML(t.DisplayedText ?? '').replaceAll('|', '<br>'))}
  `;
}

function escapeHTML(str = "") {
  return String(str)
    .replace(/[&<>\"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
}

// Delegated click (respects pan gating)
world.addEventListener('click', (e) => {
  if (suppressNextClick) {            // ignore the click that immediately follows a drag
    e.preventDefault();
    suppressNextClick = false;        // consume just this one
    return;
  }
  const el = e.target.closest('.tile');
  if (!el) return;
  const key = el.dataset.key;
  const t = tileMap.get(key);
  if (!t) return;

  document.querySelectorAll('.tile').forEach(n => n.classList.remove('selected'));
  el.classList.add('selected');
  detailsEl.innerHTML = renderDetailsHTML(t);
});

// =====================
// Pan interactions (mouse & touch)
// =====================
viewport.addEventListener('mousedown', (e) => {
  // Left button only
  if (e.button !== 0) return;
  didPan = false;
  isPanning = true;
  startPan = { x: e.clientX, y: e.clientY };
  startTranslate = { x: translateX, y: translateY };
  viewport.style.cursor = 'grabbing';
  viewport.classList.add('panning');
});
window.addEventListener('mousemove', (e) => {
  if (!isPanning) return;
  const dx = e.clientX - startPan.x;
  const dy = e.clientY - startPan.y;
  lastDragDist = Math.hypot(dx, dy);
  if (!didPan && lastDragDist > PAN_THRESHOLD) didPan = true;
  translateX = startTranslate.x + dx;
  translateY = startTranslate.y + dy;
  applyTransform();
});
window.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    viewport.style.cursor = 'default';
    viewport.classList.remove('panning');
  }
  suppressNextClick = lastDragDist > PAN_THRESHOLD;
  lastDragDist = 0;
  didPan = false;
});

// Touch support: one-finger pan; two-finger pinch-zoom
let lastTouchDist = null;
let lastTouchCenter = null;

viewport.addEventListener('touchstart', (e) => {
  didPan = false;
  if (e.touches.length === 1) {
    isPanning = true;
    startPan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    startTranslate = { x: translateX, y: translateY };
  } else if (e.touches.length === 2) {
    isPanning = false;
    lastTouchDist = touchDistance(e.touches[0], e.touches[1]);
    lastTouchCenter = touchCenter(e.touches[0], e.touches[1]);
  }
}, { passive: false });

viewport.addEventListener('touchmove', (e) => {
  if (e.touches.length === 1 && isPanning) {
    didPan = true;
    const dx = e.touches[0].clientX - startPan.x;
    const dy = e.touches[0].clientY - startPan.y;
    lastDragDist = Math.hypot(dx, dy);
    translateX = startTranslate.x + dx;
    translateY = startTranslate.y + dy;
    applyTransform();
  } else if (e.touches.length === 2) {
    e.preventDefault();
    const dist = touchDistance(e.touches[0], e.touches[1]);
    const center = touchCenter(e.touches[0], e.touches[1]);
    const factor = dist / (lastTouchDist || dist);
    setScaleAt(scale * factor, center.x, center.y);
    lastTouchDist = dist;
    lastTouchCenter = center;
  }
}, { passive: false });

window.addEventListener('touchend', () => {
  suppressNextClick = lastDragDist > PAN_THRESHOLD;
  lastDragDist = 0;
  didPan = false;
});

function touchDistance(a, b) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}
function touchCenter(a, b) {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

// Wheel zoom (always zoom here)
viewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = Math.sign(e.deltaY);
  const factor = delta > 0 ? 0.9 : 1.1;
  zoomBy(factor, e.clientX, e.clientY);
}, { passive: false });

// Buttons
zoomInBtn.addEventListener('click', () => {
  const rect = viewport.getBoundingClientRect();
  zoomBy(1.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
});
zoomOutBtn.addEventListener('click', () => {
  const rect = viewport.getBoundingClientRect();
  zoomBy(1/1.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
});
resetBtn.addEventListener('click', resetView);

// =====================
// Init
// =====================
const filledTiles = fillMissingTiles(tiles);
renderTiles(filledTiles);
resetView();

// Expose minimal API for replacing data at runtime
window.MapAPI = {
  setTiles(newTiles) {
    if (!Array.isArray(newTiles)) return;
    const filled = fillMissingTiles(newTiles);
    renderTiles(filled);
    resetView();
  },
  selectByCoord(x, y) {
    const key = `${x},${y}`;
    const t = tileMap.get(key);
    const el = domByKey.get(key);
    if (t && el) {
      document.querySelectorAll('.tile').forEach(n => n.classList.remove('selected'));
      el.classList.add('selected');
      detailsEl.innerHTML = renderDetailsHTML(t);
    }
  }
};
