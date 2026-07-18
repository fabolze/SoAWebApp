export type LocationId = "village" | "forest" | "swamp" | "ruins";
export type EquipmentSlot = "weapon" | "armor" | "charm";

export type ItemDefinition = {
  id: string;
  name: string;
  description: string;
  type: "weapon" | "armor" | "charm" | "consumable" | "quest";
  slot?: EquipmentSlot;
  price: number;
  icon: string;
  damage?: number;
  armor?: number;
  health?: number;
  heal?: number;
};

export type LocationDefinition = {
  id: LocationId;
  name: string;
  kicker: string;
  description: string;
  x: number;
  y: number;
  danger: string;
  travelMinutes: number;
  accent: string;
};

export const ITEMS: Record<string, ItemDefinition> = {
  wornBlade: { id: "wornBlade", name: "Worn Wayfarer Blade", description: "A familiar edge. Still honest steel.", type: "weapon", slot: "weapon", price: 0, icon: "⚔", damage: 7 },
  forgeBlade: { id: "forgeBlade", name: "Orrin's Leafblade", description: "Light, balanced, and marked with a smith's copper leaf.", type: "weapon", slot: "weapon", price: 34, icon: "†", damage: 13 },
  travelCoat: { id: "travelCoat", name: "Waxed Travel Coat", description: "Layered linen that turns thorns and light blows.", type: "armor", slot: "armor", price: 24, icon: "♦", armor: 4, health: 12 },
  emberCharm: { id: "emberCharm", name: "Emberglass Charm", description: "A warm shard found where the old roads broke.", type: "charm", slot: "charm", price: 0, icon: "◈", damage: 3, health: 8 },
  tonic: { id: "tonic", name: "Rowan Tonic", description: "Restores 35 health. Bitter enough to work.", type: "consumable", price: 12, icon: "+", heal: 35 },
  bellClapper: { id: "bellClapper", name: "Ashen Bell Clapper", description: "Blackened bronze, humming with a memory of fire.", type: "quest", price: 0, icon: "◎" },
  mireBloom: { id: "mireBloom", name: "Mirebloom", description: "A moon-pale flower used in village remedies.", type: "quest", price: 0, icon: "✿" },
};

export const LOCATIONS: Record<LocationId, LocationDefinition> = {
  village: { id: "village", name: "Brackenmere", kicker: "Starting Village", description: "A pocket of lamplight beneath the old bell tower.", x: 72, y: 67, danger: "Safe haven", travelMinutes: 0, accent: "#d7a95b" },
  forest: { id: "forest", name: "Elderwood Verge", kicker: "Forest", description: "Fern-dark trails where the trees keep older names.", x: 49, y: 48, danger: "Low danger", travelMinutes: 4, accent: "#78a66b" },
  swamp: { id: "swamp", name: "Blackwater Fen", kicker: "Forest Swamp", description: "Still water, pale flowers, and patient things below.", x: 27, y: 65, danger: "High danger", travelMinutes: 7, accent: "#68a69a" },
  ruins: { id: "ruins", name: "Shanoir Gate", kicker: "Portal Ruins", description: "A ring of stone cut open by amber fire.", x: 35, y: 24, danger: "Boss encounter", travelMinutes: 9, accent: "#d87845" },
};

export const LORE = [
  { id: "bell", title: "The Ashen Bell", category: "Brackenmere", text: "The village bell was cast from metal recovered after the Shanoir Gate fell. It has not rung since its clapper vanished seventeen years ago." },
  { id: "oldRoad", title: "The Road Beneath Roots", category: "Elderwood", text: "Before the forest, a road joined Brackenmere to cities no living map remembers. In rain, its stones show through the soil like old bones." },
  { id: "mire", title: "Mirebloom Almanac", category: "Blackwater", text: "Mirebloom opens only when disturbed water becomes perfectly still. Fen keepers once called it the flower that waits for an apology." },
  { id: "gate", title: "The Shanoir Accord", category: "Ruins", text: "The ring was never a doorway. It was a promise between distant places. Someone broke the promise from both sides at once." },
];

export const TALENTS = [
  { id: "resolve", name: "Wayfarer's Resolve", description: "+18 maximum health", cost: 1, icon: "♥" },
  { id: "ember", name: "Ember Edge", description: "+5 damage to all attacks", cost: 1, icon: "✦" },
  { id: "quickstep", name: "Quickstep", description: "+18% movement speed", cost: 1, icon: "»" },
];

export const SHOP_STOCK = ["forgeBlade", "travelCoat", "tonic"];

export const DIALOGUES = {
  maraIntro: {
    speaker: "Mara Vey",
    role: "Keeper of the Bell",
    portrait: "M",
    nodes: {
      start: { text: "You heard it too, didn't you? A bell with no clapper, ringing beneath the earth.", choices: [
        { label: "I heard it in my dream.", next: "dream" },
        { label: "I heard something. Tell me what it means.", next: "plain" },
        { label: "Sounds like old stone settling.", next: "skeptic" },
      ] },
      dream: { text: "Then the Gate has learned your name. I had hoped it would forget us all.", choices: [{ label: "What gate?", next: "quest" }] },
      plain: { text: "It means the old road is waking. And that something at Shanoir wants its voice returned.", choices: [{ label: "What do you need from me?", next: "quest" }] },
      skeptic: { text: "Keep that doubt. It will serve you better than fear—but take a blade when you test it.", choices: [{ label: "All right. Show me where.", next: "quest" }] },
      quest: { text: "Find the bell's clapper at the Shanoir Gate. The way passes through Elderwood and Blackwater Fen. Bring it home before the next dusk.", choices: [
        { label: "I'll bring it back.", next: "accept", action: "acceptQuest" },
        { label: "What happened at Shanoir?", next: "history" },
      ] },
      history: { text: "Seventeen years ago the ring burned without flame. We sealed the road, hid the clapper, and agreed never to speak of who carried it there.", choices: [{ label: "You can tell me the rest when I return.", next: "accept", action: "acceptQuest" }] },
      accept: { text: "Orrin has kept your old sword sharp. Take it—and listen when the forest goes quiet.", choices: [{ label: "Open the road.", next: null, action: "close" }] },
    },
  },
  maraReturn: {
    speaker: "Mara Vey",
    role: "Keeper of the Bell",
    portrait: "M",
    nodes: {
      start: { text: "You carry a sound I haven't heard in seventeen years.", choices: [{ label: "The Gate had a guardian.", next: "truth" }] },
      truth: { text: "And now it has none. The clapper belongs in the tower—but the Emberglass belongs with you. This was only the first ring.", choices: [{ label: "Then let it ring.", next: null, action: "completeQuest" }] },
    },
  },
} as const;

export const INTRO_SLIDES = [
  { eyebrow: "Altrail · Year 312 After Sundering", title: "Some roads disappear. Others wait.", text: "For seventeen years, Brackenmere's bell tower has stood silent at the edge of Elderwood." },
  { eyebrow: "The night before first frost", title: "Then the earth remembered its voice.", text: "A bell rang beneath the roots, and every flame in the village bent toward the abandoned road." },
  { eyebrow: "At first light", title: "Mara Vey sent for you.", text: "Whatever woke beyond Blackwater Fen knows your name. Before dusk, you will learn why." },
];
