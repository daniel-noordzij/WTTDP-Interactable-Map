// =====================
// Core config
// =====================
const TILE = 100; // px
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

// You can set the viewport size via CSS variables at runtime if desired
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

let currentTiles = [];

function applyTransform() {
  world.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
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
  const s0 = scale;
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
  // Center the content roughly around occupied tiles if available
  const bounds = computeBounds(tiles);
  scale = 1;
  translateX = translateY = 0;
  applyTransform();
  if (bounds) {
    // Fit bounds into viewport with some padding
    fitToBounds(bounds, 24);
  }
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

function fillMissingTiles(data) {
  if (!data.length) return data;
  const map = new Map(data.map(t => [`${t.X},${t.Y}`, t]));
  const xs = data.map(t => t.X);
  const ys = data.map(t => t.Y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const filled = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const key = `${x},${y}`;
      if (map.has(key)) {
        filled.push(map.get(key));
      } else {
        filled.push({
          X: x, Y: y,
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
// Render tiles
// =====================
function renderTiles(data) {
  currentTiles = data;
  world.innerHTML = '';
  const frag = document.createDocumentFragment();
  data.forEach((t, idx) => {
    const el = document.createElement('div');
    el.className = 'tile';
    el.style.left = `${t.Y * TILE}px`;
    el.style.top  = `${-t.X * TILE}px`;
    el.style.backgroundColor = t.tileBackgroundColor || '#f3f4f6';

    if (!t.isPlaceholder && t.Name?.includes('-')) {
      const [before, after] = t.Name.split('-', 2);
      el.innerHTML = `
        <div class="label two-line">
          <strong>${escapeHTML(before.trim())}</strong>
          <span>${escapeHTML(after.trim())}</span>
        </div>`;
    } else {
      el.innerHTML = `
        <div class="label">
          <strong>${escapeHTML(t.Name || `${t.X},${t.Y}`)}</strong>
        </div>`;
    }

    el.dataset.index = idx;
    el.title = `${t.Name ?? 'Tile'} @ (${t.X}, ${t.Y})`;
    el.addEventListener('click', () => selectTile(idx));

    if (t.isPlaceholder) {
      el.style.opacity = 0.6;
      el.style.fontStyle = 'italic';
    }

    frag.appendChild(el);
  });
  world.appendChild(frag);
}

let selectedIndex = null;
function selectTile(idx) {
  selectedIndex = idx;
  // highlight
  document.querySelectorAll('.tile').forEach(el => el.classList.remove('selected'));
  const el = document.querySelector(`.tile[data-index="${idx}"]`);
  if (el) el.classList.add('selected');
  // details
  const t = currentTiles[idx];
  detailsEl.innerHTML = renderDetailsHTML(t);
}

function renderDetailsHTML(t) {
  const kv = (k, v) => `<div class="kv"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const list = (arr) =>
    arr && arr.length
      ? arr.map(a => `<span class="badge">${escapeHTML(String(a))}</span>`).join('')
      : '<span class="badge">None</span>';

  return `
    ${kv('Name', escapeHTML(t.Name ?? ''))}
    ${kv('Coordinates', `X: <strong>${t.X}</strong>, Y: <strong>${t.Y}</strong>`)}
    <div class="kv">
      <div class="k">DirectionsAccessible</div>
      <div class="badges">${list(t.DirectionsAccessible ?? [])}</div>
    </div>
    <div class="kv">
      <div class="k">Endings</div>
      <div class="badges">${list(t.Endings ?? [])}</div>
    </div>
    ${kv('AccessibleOnFoot', t.AccessibleOnFoot ? 'Yes' : 'No')}
    ${kv('HasCollectible', t.HasCollectible ? 'Yes' : 'No')}
    ${kv('RequiresItemToAccess', t.RequiresItemToAccess ? 'Yes' : 'No')}
    ${kv('IsDoorToOtherMap', t.IsDoorToOtherMap ? 'Yes' : 'No')}
    <div class="kv">
      <div class="k">Options</div>
      <div class="badges">${list(t.Options ?? [])}</div>
    </div>
    ${kv('DisplayedText', escapeHTML(t.DisplayedText ?? '').replaceAll('|', '<br>'))}
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

// =====================
// Pan interactions (mouse & touch)
// =====================
viewport.addEventListener('mousedown', (e) => {
  // Left button only, and ignore if a tile click started (we'll still allow drag on whitespace)
  if (e.button !== 0) return;
  isPanning = true;
  startPan = { x: e.clientX, y: e.clientY };
  startTranslate = { x: translateX, y: translateY };
  viewport.style.cursor = 'grabbing';
});
window.addEventListener('mousemove', (e) => {
  if (!isPanning) return;
  const dx = e.clientX - startPan.x;
  const dy = e.clientY - startPan.y;
  translateX = startTranslate.x + dx;
  translateY = startTranslate.y + dy;
  applyTransform();
});
window.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    viewport.style.cursor = 'default';
  }
});

// Touch support: one-finger pan; two-finger pinch-zoom
let lastTouchDist = null;
let lastTouchCenter = null;

viewport.addEventListener('touchstart', (e) => {
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
    const dx = e.touches[0].clientX - startPan.x;
    const dy = e.touches[0].clientY - startPan.y;
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

function touchDistance(a, b) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}
function touchCenter(a, b) {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

// Wheel zoom (Ctrl+wheel for high-precision, but we always zoom here)
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
    const idx = currentTiles.findIndex(t => t.X === x && t.Y === y);
    if (idx !== -1) selectTile(idx);
  }
};