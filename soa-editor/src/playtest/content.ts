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
  wornBlade: { id: "wornBlade", name: "Grandfather's Old Sword", description: "The blade your adoptive grandfather carried as an adventurer. Worn, balanced, and carefully kept.", type: "weapon", slot: "weapon", price: 0, icon: "⚔", damage: 7 },
  forgeBlade: { id: "forgeBlade", name: "Balanced Hunting Blade", description: "A practical village-forged blade made for the roads beyond the fields.", type: "weapon", slot: "weapon", price: 34, icon: "†", damage: 13 },
  travelCoat: { id: "travelCoat", name: "Waxed Travel Coat", description: "Layered linen that turns thorns and light blows.", type: "armor", slot: "armor", price: 24, icon: "♦", armor: 4, health: 12 },
  resonanceCharm: { id: "resonanceCharm", name: "Resonant Portal Shard", description: "A fragment from the forbidden portal. It answers faintly to the memory of your childhood encounter.", type: "charm", slot: "charm", price: 0, icon: "◈", damage: 3, health: 8 },
  tonic: { id: "tonic", name: "Village Tonic", description: "Restores 35 health. Bitter enough to work.", type: "consumable", price: 12, icon: "+", heal: 35 },
  portalFragment: { id: "portalFragment", name: "Unstable Portal Fragment", description: "Stone and crystal marked by Shadow influence. Evidence that the old portal is active again.", type: "quest", price: 0, icon: "◎" },
  missingScarf: { id: "missingScarf", name: "The Missing Villager's Scarf", description: "Torn on a low branch. Mud and dark residue show the trail continues toward the forbidden ruins.", type: "quest", price: 0, icon: "≈" },
};

export const LOCATIONS: Record<LocationId, LocationDefinition> = {
  village: { id: "village", name: "The Start Village", kicker: "Altrail · Name open", description: "A quiet human village where the old portal and your grandfather's death are still taboo.", x: 72, y: 67, danger: "Safe haven", travelMinutes: 0, accent: "#d7a95b" },
  forest: { id: "forest", name: "The Old Forest Path", kicker: "Near the village", description: "Animals flee unseen pressure, and shadows move against the morning light.", x: 49, y: 48, danger: "Unnatural unrest", travelMinutes: 4, accent: "#78a66b" },
  swamp: { id: "swamp", name: "The Southern Marsh", kicker: "Beyond the forest", description: "The missing villager's trail crosses still water where whispers gather between the reeds.", x: 27, y: 65, danger: "Shadow influence", travelMinutes: 7, accent: "#68a69a" },
  ruins: { id: "ruins", name: "The Forbidden Portal", kicker: "Ruin near the Shanoir border", description: "The place you remember from childhood is awake, and something from Shadow stands before it.", x: 35, y: 24, danger: "Major encounter", travelMinutes: 9, accent: "#d87845" },
};

export const LORE = [
  { id: "portalTaboo", title: "The Forbidden Portal", category: "Start Village", text: "The village says your adoptive grandfather died protecting its people during an earlier Shadow incursion. The portal was declared taboo afterward. Who else was there—and why they came—was never explained." },
  { id: "wrongShadows", title: "Shadows Against the Light", category: "Forest", text: "Shadow is not simply evil. It is change, dissolution, uncertainty, and necessary transformation. Here, however, it moves under pressure: against the light, against the wind, and toward the old portal." },
  { id: "missingTrail", title: "A Trail Through the Marsh", category: "Southern Marsh", text: "The tracks belong to the missing villager. They are joined by marks that are neither animal nor human, as though something briefly learned how weight works." },
  { id: "shanoirRift", title: "Resonance at the Border", category: "Portal Ruins", text: "The portal reacts to your presence just as it did fifteen years ago, when Raznah helped a lost child here. Whether this is a mark, a fragment, or another kind of resonance remains unknown." },
];

export const TALENTS = [
  { id: "resolve", name: "Wayfarer's Resolve", description: "+18 maximum health", cost: 1, icon: "♥" },
  { id: "ember", name: "Stand Against Fear", description: "+5 damage to all attacks", cost: 1, icon: "✦" },
  { id: "quickstep", name: "Quickstep", description: "+18% movement speed", cost: 1, icon: "»" },
];

export const SHOP_STOCK = ["forgeBlade", "travelCoat", "tonic"];

export const DIALOGUES = {
  questIntro: {
    speaker: "Village Elder",
    role: "Start Village · Name open",
    portrait: "V",
    nodes: {
      start: { text: "Someone went missing before dawn. The animals have been restless for days, and now people swear the shadows are moving the wrong way.", choices: [
        { label: "Where were they last seen?", next: "trail" },
        { label: "This is about the old portal, isn't it?", next: "portal" },
        { label: "Let the village search party handle it.", next: "personal" },
      ] },
      trail: { text: "At the forest edge, heading south. We found no sign that they turned back.", choices: [{ label: "I'll follow the trail.", next: "quest" }] },
      portal: { text: "That road has been forbidden since your grandfather died protecting this village. I will not turn fear into certainty without proof.", choices: [{ label: "Then I'll bring back proof—and our missing neighbor.", next: "quest" }] },
      personal: { text: "We already did. They returned when the forest began whispering their own names. You know those paths, and you have more reason than most to learn what happened there.", choices: [{ label: "My grandfather.", next: "grandfather" }] },
      grandfather: { text: "He died keeping the same darkness from reaching these homes. I promised I would never ask this of you. Today I am asking.", choices: [{ label: "Tell me where to begin.", next: "quest" }] },
      quest: { text: "Follow the tracks through the forest and marsh. Find our missing neighbor. If the trail reaches the old portal, do not touch it.", choices: [
        { label: "I'll bring them home.", next: "accept", action: "acceptQuest" },
        { label: "What aren't you telling me?", next: "history" },
      ] },
      history: { text: "Only what was told to me: a Shadow creature crossed over, your grandfather stood against it, and the portal was sealed. The rest was buried with him—or hidden by those who came through before it.", choices: [{ label: "Then it is time someone found the truth.", next: "accept", action: "acceptQuest" }] },
      accept: { text: "Take your grandfather's sword. Find the villager first. Answers can wait until everyone is alive to hear them.", choices: [{ label: "Open the road.", next: null, action: "close" }] },
    },
  },
  questReturn: {
    speaker: "Village Elder",
    role: "Start Village · Name open",
    portrait: "V",
    nodes: {
      start: { text: "They're alive because you went after them. But you look as though you found more than a frightened villager.", choices: [{ label: "The portal is active. A Shadow creature guarded it.", next: "truth" }] },
      truth: { text: "Then the old story was never finished. Keep that fragment. If it reacts to you, it may lead beyond this village—and to whoever chose to hide the truth of that night.", choices: [{ label: "I will find out why.", next: null, action: "completeQuest" }] },
    },
  },
} as const;

export const INTRO_SLIDES = [
  { eyebrow: "Prologue · Near the border to Shanoir", title: "Brothers chose different roads.", text: "Roznoh let Raznah leave, though both understood what a return might demand of them. Far beyond their farewell, Vakariel's influence remained subtle—and patient." },
  { eyebrow: "Fifteen years ago", title: "A lost child met Raznah.", text: "Near a dormant portal, the feared exile stopped to help an ordinary human child find the way home. For one moment the old stones answered them both." },
  { eyebrow: "The Start Village · Today", title: "Now the shadows move incorrectly.", text: "Plants rot, animals panic, and a villager vanishes along the forbidden path. You take up your grandfather's old sword to bring them home." },
];
