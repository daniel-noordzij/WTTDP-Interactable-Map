/*
// The map of Normal Home / Abandoned Home
//
// +X is North, -X is South
// +Y is East, -Y is West
//

	Template for new areas:

	{
		X: 0,
		Y: 0,
		Name: "",
		AlternativeNames: ["None"],
		DisplayedText: "",
		DirectionsAccessible: ["North", "West", "East", "South"],
		Options: ["None"],
		Endings: ["None"],
		AccessibleOnFoot: true,
		HasCollectible: false,
		RequiresItemToAccess: false,
		IsDoorToOtherMap: false,
		tileBackgroundColor: "#000000"
	},

*/

var tiles = [
	{
		X: 0,
		Y: 0,
		Name: "Normal House - Entrance",
		AlternativeNames: ["None"],
		DisplayedText: "I step in through the hallway. There are stairs to my left. Ahead I see a dining table and kitchen.|-----|I go down the steep, hardwood stairs to the first floor.|To my left are the stairs. Ahead I see a dining table.",
		DirectionsAccessible: ["None", /*"West", "East", "South"*/],
		Options: ["Go forward", "Go upstairs", "Leave the house"],
		Endings: ["None"],
		AccessibleOnFoot: true,
		HasCollectible: false,
		RequiresItemToAccess: false,
		IsDoorToOtherMap: true,
		tileBackgroundColor: "#000000"
	},
	{
		X: 1,
		Y: 0,
		Name: "Normal House - Dining Room",
		AlternativeNames: ["None"],
		DisplayedText: "I walk around the dining table. The house has an open layout, and the kitchen and living room are visible from here.|Besides the round dining table and a small fireplace, the house seems to be devoid of anything personal.",
		DirectionsAccessible: ["None", /*"West", "East", "South"*/],
		Options: ["Go upstairs", "Leave the house"],
		Endings: ["None"],
		AccessibleOnFoot: true,
		HasCollectible: false,
		RequiresItemToAccess: false,
		IsDoorToOtherMap: true,
		tileBackgroundColor: "#000000"
	},
	{
		X: 0,
		Y: 5,
		Name: "Normal House - Narrow hall",
		AlternativeNames: ["None"],
		DisplayedText: "I walk up the steep, hardwood stairs into a narrow hall. There is a door across from the stairs.|-----|I walk back up the steep, hardwood stairs to the hallway again.",
		DirectionsAccessible: ["None", /*"West", "East", "South"*/],
		Options: ["Explore the second floor", "Go back downstairs", "Go back in the bedroom"],
		Endings: ["None"],
		AccessibleOnFoot: true,
		HasCollectible: false,
		RequiresItemToAccess: false,
		IsDoorToOtherMap: false,
		tileBackgroundColor: "#000000"
	},
	{
		X: 1,
		Y: 5,
		Name: "Normal House - Bedroom",
		AlternativeNames: ["None"],
		DisplayedText: "The door leads to an empty bedroom with some boxes lying around. It looks like someone's moving in. There's a closet.|-----|It's a normal closet.|-----|I open the closet and see nothing. But I hear someone struggling.|-----|On the floor is a man with a ripped-up, bright red shirt and small, brown shorts, wiggling on the ground. He's tangled up in his own arms and legs, contorted into a ball.|-----|He looks up. \"Hey, that's what they say! To me!\" he says with an attempted cheer to his voice.|-----|\"Me! says the man. One of his arms is stretched under his leg and wrapped around his neck, so he's just barely able to point a thumb towards his head.|-----|\"That's what I like to ask myself, to pass the time.\"|-----|\"Oh, no, I don't think I need any help. Is there something wrong?\"|-----|\"No. Weird question.\"|-----|\"Oh,\" says the man.|-----|I shut the closet door and turn around.|\"Have a nice day,\" says a voice from the closet.|-----|It's the empty bedroom, with a faded purple carpet and a closet in the corner.|-----|\"No, no,\" says a muffled voice from inside the closet. \"I don't need any help. It's okay, I like it dark in here. At least for now.\"",
		DirectionsAccessible: ["None", /*"West", "East", "South"*/],
		Options: ["Go to the closet", "Go downstairs", "Open the closet", "Listen", "Look down", "\"What?\"", "\"Who did that?\"", "\"Can I help you?\"", "Close the closet door", "\"Uh, why?\"", "\"Well, bye then.\"", "\"Would you happen to have a key?\"", "\"Oh, okay. Bye.\"", "Leave the room", "Go back downstairs"],
		Endings: ["None"],
		AccessibleOnFoot: true,
		HasCollectible: false,
		RequiresItemToAccess: false,
		IsDoorToOtherMap: false,
		tileBackgroundColor: "#000000"
	},
];