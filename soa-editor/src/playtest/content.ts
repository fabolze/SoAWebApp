export type LocationId = "village" | "forest" | "swamp" | "ruins";
export type EquipmentSlot = "weapon" | "armor" | "charm";
export type TalentBranch = "survival" | "combat" | "exploration";

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

export type TalentDefinition = {
  id: string;
  name: string;
  description: string;
  cost: number;
  icon: string;
  branch: TalentBranch;
  tier: number;
  requires?: string;
};

export const ITEMS: Record<string, ItemDefinition> = {
  wornBlade: { id: "wornBlade", name: "Grandfather's Old Sword", description: "The blade your adoptive grandfather carried as an adventurer. Worn, balanced, and carefully kept.", type: "weapon", slot: "weapon", price: 0, icon: "⚔", damage: 7 },
  forgeBlade: { id: "forgeBlade", name: "Vale Hunting Blade", description: "A practical Hearthmere blade, weighted by Torren for the roads beyond the fields.", type: "weapon", slot: "weapon", price: 34, icon: "†", damage: 13 },
  travelCoat: { id: "travelCoat", name: "Waxed Trail Coat", description: "Layered linen that turns thorns, marsh water, and light blows.", type: "armor", slot: "armor", price: 24, icon: "♦", armor: 4, health: 12 },
  marshWard: { id: "marshWard", name: "Reed-Knot Ward", description: "A small knot of ashwood and river reed. Nessa swears it keeps bad roads from following you home.", type: "charm", slot: "charm", price: 28, icon: "⌘", armor: 1, health: 6 },
  resonanceCharm: { id: "resonanceCharm", name: "Resonant Portal Shard", description: "A fragment from the forbidden portal. It answers faintly to the memory of your childhood encounter.", type: "charm", slot: "charm", price: 0, icon: "◈", damage: 3, health: 8 },
  tonic: { id: "tonic", name: "Hearthmere Tonic", description: "Restores vigor. Bitter enough to work and bottled at Torren's forge.", type: "consumable", price: 12, icon: "+", heal: 35 },
  portalFragment: { id: "portalFragment", name: "Unstable Portal Fragment", description: "Stone and crystal marked by Shadow influence. Evidence that the old portal is active again.", type: "quest", price: 0, icon: "◉" },
  missingScarf: { id: "missingScarf", name: "Iven's Torn Scarf", description: "Found on a marsh thorn. Mud and dark residue show Iven's trail continues toward Riftwatch.", type: "quest", price: 0, icon: "≈" },
};

export const LOCATIONS: Record<LocationId, LocationDefinition> = {
  village: { id: "village", name: "Hearthmere", kicker: "Western Altrail", description: "A sheltered human village where the old portal and your grandfather's death remain carefully avoided subjects.", x: 72, y: 67, danger: "Safe haven", travelMinutes: 0, accent: "#d7a95b" },
  forest: { id: "forest", name: "Gloamwood Path", kicker: "South of Hearthmere", description: "Animals flee an unseen pressure, and shadows move against the morning light beneath old pines.", x: 49, y: 48, danger: "Unnatural unrest", travelMinutes: 4, accent: "#78a66b" },
  swamp: { id: "swamp", name: "Morrowfen", kicker: "Beyond Gloamwood", description: "Iven's trail crosses still water where whispers gather between the reeds and forget who spoke them.", x: 27, y: 65, danger: "Shadow influence", travelMinutes: 7, accent: "#68a69a" },
  ruins: { id: "ruins", name: "Riftwatch Ruins", kicker: "Near the Shanoir border", description: "The forbidden portal from your childhood is awake, and something from Shadow waits before it.", x: 35, y: 24, danger: "Major encounter", travelMinutes: 9, accent: "#d87845" },
};

export const LORE = [
  { id: "portalTaboo", title: "The Riftwatch Taboo", category: "Hearthmere", text: "Hearthmere says your adoptive grandfather died protecting its people during an earlier Shadow incursion. Riftwatch was forbidden afterward. Who else was there—and why they came—was never explained." },
  { id: "hearthmere", title: "Hearthmere's Quiet Oath", category: "People", text: "Elder Maelin was newly appointed when Riftwatch closed. Every elder since has sworn to keep villagers from the ruins, but the oath says nothing about what truly crossed the portal." },
  { id: "nessa", title: "Nessa Reed", category: "Companions", text: "Hearthmere's best trail scout speaks plainly and never leaves anyone on a bad road alone. Nessa remembers Iven as the child who followed her everywhere, and refuses to lose him now." },
  { id: "wrongShadows", title: "Shadows Against the Light", category: "Gloamwood", text: "Shadow is not simply evil. It is change, dissolution, uncertainty, and necessary transformation. Here, however, it moves under pressure: against light, against wind, and toward Riftwatch." },
  { id: "missingTrail", title: "A Trail Through Morrowfen", category: "Morrowfen", text: "The tracks belong to Iven Marr. They are joined by marks that are neither animal nor human, as though something briefly learned how weight works." },
  { id: "shanoirRift", title: "Resonance at the Border", category: "Riftwatch", text: "The portal reacts to your presence just as it did fifteen years ago, when Raznah helped a lost child here. Whether this is a mark, a fragment, or another kind of resonance remains unknown." },
  { id: "raznah", title: "The Exile Named Raznah", category: "Shanoir", text: "The village records call Raznah a feared exile, yet your oldest memory is of someone patient enough to guide a frightened child home. Both accounts may be true. Neither is complete." },
] as const;

export const TALENTS: TalentDefinition[] = [
  { id: "resolve", name: "Wayfarer's Resolve", description: "+18 maximum vigor", cost: 1, icon: "♥", branch: "survival", tier: 1 },
  { id: "bastion", name: "Hold the Line", description: "+3 armor and +8 maximum vigor", cost: 1, icon: "⬟", branch: "survival", tier: 2, requires: "resolve" },
  { id: "ember", name: "Stand Against Fear", description: "+5 damage to every attack", cost: 1, icon: "✦", branch: "combat", tier: 1 },
  { id: "resonance", name: "Resonant Edge", description: "+6 additional weapon damage", cost: 1, icon: "◈", branch: "combat", tier: 2, requires: "ember" },
  { id: "quickstep", name: "Quickstep", description: "+18% movement speed in combat", cost: 1, icon: "»", branch: "exploration", tier: 1 },
  { id: "fieldcraft", name: "Fieldcraft", description: "Tonics restore 15 additional vigor", cost: 1, icon: "✣", branch: "exploration", tier: 2, requires: "quickstep" },
];

export const SHOP_STOCK = ["forgeBlade", "travelCoat", "marshWard", "tonic"];
export const INITIAL_SHOP_STOCK: Record<string, number> = { forgeBlade: 1, travelCoat: 1, marshWard: 1, tonic: 4 };

export const DIALOGUES = {
  questIntro: {
    speaker: "Elder Maelin",
    role: "Elder of Hearthmere",
    portrait: "maelin",
    nodes: {
      start: { text: "Iven Marr went missing before dawn. The animals have been restless for days, and now people swear the shadows are moving the wrong way.", choices: [
        { label: "Where was Iven last seen?", next: "trail" },
        { label: "This is about Riftwatch, isn't it?", next: "portal" },
        { label: "Send the search party again.", next: "personal" },
      ] },
      trail: { text: "At the Gloamwood edge, heading south. Nessa Reed found his tracks, but the forest drove our searchers back.", choices: [{ label: "Then Nessa and I will follow them.", next: "quest" }] },
      portal: { text: "That road has been forbidden since your grandfather died protecting Hearthmere. I will not turn fear into certainty without proof.", choices: [{ label: "Then I'll bring back proof—and Iven.", next: "quest" }] },
      personal: { text: "We did. They returned when the forest began whispering their own names. You know those paths, and you have more reason than most to learn what happened there.", choices: [{ label: "My grandfather.", next: "grandfather" }] },
      grandfather: { text: "He died keeping the same darkness from these homes. I promised I would never ask this of you. Today I am asking.", choices: [{ label: "Tell me where to begin.", next: "quest" }] },
      quest: { text: "Follow the tracks through Gloamwood and Morrowfen. Find Iven. If the trail reaches Riftwatch, do not touch the portal.", choices: [
        { label: "I'll bring him home.", next: "accept", action: "acceptQuest" },
        { label: "What aren't you telling me?", next: "history" },
      ] },
      history: { text: "Only what was told to me: a Shadow creature crossed over, your grandfather stood against it, and Riftwatch was sealed. The rest was buried with him—or hidden by those who came through before it.", choices: [{ label: "Then it is time someone found the truth.", next: "accept", action: "acceptQuest" }] },
      accept: { text: "Nessa is waiting by the south gate. Take your grandfather's sword. Find Iven first; answers can wait until everyone is alive to hear them.", choices: [{ label: "Open the road.", next: null, action: "close" }] },
    },
  },
  questActive: {
    speaker: "Elder Maelin",
    role: "Elder of Hearthmere",
    portrait: "maelin",
    nodes: {
      start: { text: "Nessa has already taken the south gate. Follow Iven's tracks, keep each other standing, and do not mistake the portal's attention for an invitation.", choices: [
        { label: "What do you remember about Raznah?", next: "raznah" },
        { label: "We're leaving now.", next: null, action: "close" },
      ] },
      raznah: { text: "A name spoken in warnings. An exile from Shanoir. Yet you insist that exile once led you safely home. I have wondered for fifteen years which story frightened us more.", choices: [{ label: "I'll find the missing part.", next: null, action: "discoverRaznah" }] },
    },
  },
  companion: {
    speaker: "Nessa Reed",
    role: "Hearthmere trail scout",
    portrait: "nessa",
    nodes: {
      start: { text: "The tracks are Iven's. Whatever follows them only leaves a print when the light changes. I can hold its attention; you strike when it shows itself.", choices: [
        { label: "You make that sound simple.", next: "trust" },
        { label: "Tell me what you saw.", next: "tracks" },
      ] },
      trust: { text: "Simple isn't safe. It just gives fear fewer decisions to make for us.", choices: [{ label: "Then we move together.", next: null, action: "meetNessa" }] },
      tracks: { text: "Bent grass without weight. A shadow arriving before the thing that casts it. And Iven's scarf caught farther south. He was still moving when he lost it.", choices: [{ label: "We'll catch up.", next: null, action: "meetNessa" }] },
    },
  },
  rescue: {
    speaker: "Iven Marr",
    role: "Rescued villager",
    portrait: "iven",
    nodes: {
      start: { text: "It kept asking what I remembered. Not with words—with my own thoughts, repeated back wrong. Then the stones lit when you arrived, and it forgot me.", choices: [
        { label: "Can you walk?", next: "walk" },
        { label: "What did the portal show you?", next: "vision" },
      ] },
      walk: { text: "If Nessa takes the marsh side. I never want to hear my own voice from empty water again.", choices: [{ label: "We'll get you home.", next: null, action: "close" }] },
      vision: { text: "Two brothers at a border. One let the other leave. And something behind them that smiled without a face. I don't know whose memory it was.", choices: [{ label: "Tell Maelin everything when we return.", next: null, action: "close" }] },
    },
  },
  questReturn: {
    speaker: "Elder Maelin",
    role: "Elder of Hearthmere",
    portrait: "maelin",
    nodes: {
      start: { text: "Iven is alive because you and Nessa went after him. But you look as though you found more than a frightened villager.", choices: [{ label: "The portal is active. A Shadow creature guarded it.", next: "truth" }] },
      truth: { text: "Then the old story was never finished. Keep that fragment. If it reacts to you, it may lead beyond Hearthmere—and to whoever chose to hide the truth of that night.", choices: [{ label: "I will find out why.", next: null, action: "completeQuest" }] },
    },
  },
  afterQuest: {
    speaker: "Elder Maelin",
    role: "Elder of Hearthmere",
    portrait: "maelin",
    nodes: {
      start: { text: "Hearthmere is safe tonight. Tomorrow we decide whether safety means sealing Riftwatch again—or finally learning where it leads.", choices: [{ label: "Tomorrow, then.", next: null, action: "close" }] },
    },
  },
} as const;

export const INTRO_SLIDES = [
  { eyebrow: "Prologue · Near the border to Shanoir", title: "Brothers chose different roads.", text: "Roznoh let Raznah leave, though both understood what a return might demand. Far beyond their farewell, Vakariel's influence remained subtle—and patient." },
  { eyebrow: "Fifteen years ago · Riftwatch", title: "A lost child met Raznah.", text: "Near a dormant portal, the feared exile stopped to help an ordinary human child find the way home. For one moment the old stones answered them both." },
  { eyebrow: "Hearthmere · Today", title: "Now the shadows move incorrectly.", text: "Plants rot, animals panic, and Iven Marr vanishes along the forbidden path. You take up your grandfather's old sword while Nessa Reed waits at the south gate." },
];
