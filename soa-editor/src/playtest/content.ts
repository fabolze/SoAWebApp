export type LocationId = "village" | "forest" | "swamp" | "ruins";
export type EquipmentSlot = "weapon" | "armor" | "charm";
export type CombatRole = "healer" | "damage" | "tank";
export type CombatSpec = "lifebinder" | "wardweaver" | "blademaster" | "ranger" | "vanguard" | "spellguard";
export type AttackStyle = "melee" | "ranged";
export type ItemRarity = "common" | "uncommon" | "set" | "unique";
export type ItemPower = "cleaving-strike" | "mending-ward" | "mending-smite";

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
  attackStyle?: AttackStyle;
  autoRange?: number;
  autoInterval?: number;
  healingPower?: number;
  rarity?: ItemRarity;
  setId?: string;
  power?: ItemPower;
  powerDescription?: string;
};

export type ItemSetDefinition = {
  id: string;
  name: string;
  description: string;
  pieces: string[];
  bonuses: { count: number; name: string; description: string }[];
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
  role: CombatRole;
  spec: CombatSpec;
  tier: number;
  requires?: string;
};

export type CombatPathDefinition = {
  id: CombatSpec;
  role: CombatRole;
  name: string;
  icon: string;
  fantasy: string;
  companionPlan: string;
};

export const COMBAT_ROLES: Record<CombatRole, { name: string; icon: string; summary: string }> = {
  healer: { name: "Healer", icon: "+", summary: "Restore vigor, prevent damage, and direct the party from the back line." },
  damage: { name: "Damage", icon: "✦", summary: "Pressure enemies with stronger weapon attacks and decisive active abilities." },
  tank: { name: "Tank", icon: "⬟", summary: "Stand in front, absorb pressure, and create room for the party." },
};

export const COMBAT_PATHS: CombatPathDefinition[] = [
  { id: "lifebinder", role: "healer", name: "Lifebinder", icon: "✚", fantasy: "Powerful direct healing with a steady restorative pulse.", companionPlan: "Nessa becomes your armored vanguard." },
  { id: "wardweaver", role: "healer", name: "Wardweaver", icon: "◇", fantasy: "Prevent incoming damage with durable wards and shared protection.", companionPlan: "Nessa becomes your armored vanguard." },
  { id: "blademaster", role: "damage", name: "Blademaster", icon: "⚔", fantasy: "Close-range pressure, fast weapon swings, and forceful finishing blows.", companionPlan: "Nessa holds the front while you deal damage." },
  { id: "ranger", role: "damage", name: "Ranger", icon: "➶", fantasy: "Reliable ranged pressure with deliberate, heavy weapon shots.", companionPlan: "Nessa holds the front while you attack from range." },
  { id: "vanguard", role: "tank", name: "Vanguard", icon: "⬟", fantasy: "High vigor and armor built to endure sustained enemy attention.", companionPlan: "Nessa switches to ranged support and healing." },
  { id: "spellguard", role: "tank", name: "Spellguard", icon: "◈", fantasy: "Protective wards soften dangerous enemy mechanics before they land.", companionPlan: "Nessa switches to ranged support and healing." },
];

export const ITEMS: Record<string, ItemDefinition> = {
  wornBlade: { id: "wornBlade", name: "Grandfather's Old Sword", description: "The blade your adoptive grandfather carried as an adventurer. Worn, balanced, and carefully kept.", type: "weapon", slot: "weapon", price: 0, icon: "⚔", damage: 7, attackStyle: "melee", autoRange: 105, autoInterval: 1.85 },
  forgeBlade: { id: "forgeBlade", name: "Vale Hunting Blade", description: "A practical Hearthmere blade, weighted by Torren for the roads beyond the fields.", type: "weapon", slot: "weapon", price: 34, icon: "†", damage: 13, attackStyle: "melee", autoRange: 110, autoInterval: 1.65 },
  hunterBow: { id: "hunterBow", name: "Gloamwood Recurve", description: "A compact ash bow made for firing across dense trails without surrendering mobility.", type: "weapon", slot: "weapon", price: 32, icon: "➶", damage: 10, attackStyle: "ranged", autoRange: 430, autoInterval: 1.95 },
  focusStaff: { id: "focusStaff", name: "Reedbound Focus", description: "An ashwood focus that turns portal resonance into precise bolts and steadier restorative magic.", type: "weapon", slot: "weapon", price: 30, icon: "✣", damage: 7, attackStyle: "ranged", autoRange: 380, autoInterval: 2.1, healingPower: .16 },
  oathsplitter: { id: "oathsplitter", name: "Oathsplitter", description: "Torren reforged a headsman's iron into a weapon that refuses to choose only one foe.", type: "weapon", slot: "weapon", price: 40, icon: "⚒", damage: 10, attackStyle: "melee", autoRange: 118, autoInterval: 2.05, rarity: "unique", power: "cleaving-strike", powerDescription: "Wayfarer Strike also hits every other enemy for 55% damage." },
  travelCoat: { id: "travelCoat", name: "Waxed Trail Coat", description: "Layered linen that turns thorns, marsh water, and light blows.", type: "armor", slot: "armor", price: 24, icon: "♦", armor: 4, health: 12 },
  vowkeepersWrap: { id: "vowkeepersWrap", name: "Vowkeeper's Wrap", description: "A field-mender's coat sewn with a promise: no restored life will be left unguarded.", type: "armor", slot: "armor", price: 38, icon: "✚", armor: 2, health: 8, rarity: "unique", power: "mending-ward", powerDescription: "Mend also grants its target 10 ward." },
  marshWard: { id: "marshWard", name: "Reed-Knot Ward", description: "A small knot of ashwood and river reed. Nessa swears it keeps bad roads from following you home.", type: "charm", slot: "charm", price: 28, icon: "⌘", armor: 1, health: 6 },
  pathfinderSeal: { id: "pathfinderSeal", name: "Pathfinder's Seal", description: "A brass trail marker recovered where Gloamwood's panicked beasts made their stand.", type: "charm", slot: "charm", price: 0, icon: "✥", damage: 2, health: 4, rarity: "set", setId: "lost-path" },
  fenwatchMantle: { id: "fenwatchMantle", name: "Fenwatch Mantle", description: "Shadow-dark water beads on this scout's mantle but never soaks through.", type: "armor", slot: "armor", price: 0, icon: "♜", armor: 4, health: 14, rarity: "set", setId: "lost-path" },
  riftwatchSpear: { id: "riftwatchSpear", name: "Riftwatch Spear", description: "Its split point hums toward open roads—and toward the portal that ended them.", type: "weapon", slot: "weapon", price: 0, icon: "♠", damage: 11, attackStyle: "melee", autoRange: 128, autoInterval: 1.78, rarity: "set", setId: "lost-path" },
  resonanceCharm: { id: "resonanceCharm", name: "Resonant Portal Shard", description: "A fragment from the forbidden portal. It turns restored life into an answering blow.", type: "charm", slot: "charm", price: 0, icon: "◈", damage: 3, health: 8, rarity: "unique", power: "mending-smite", powerDescription: "Mend deals 45% of the vigor actually restored to your selected enemy." },
  tonic: { id: "tonic", name: "Hearthmere Tonic", description: "Restores vigor. Bitter enough to work and bottled at Torren's forge.", type: "consumable", price: 12, icon: "+", heal: 35 },
  portalFragment: { id: "portalFragment", name: "Unstable Portal Fragment", description: "Stone and crystal marked by Shadow influence. Evidence that the old portal is active again.", type: "quest", price: 0, icon: "◉" },
  missingScarf: { id: "missingScarf", name: "Iven's Torn Scarf", description: "Found on a marsh thorn. Mud and dark residue show Iven's trail continues toward Riftwatch.", type: "quest", price: 0, icon: "≈" },
};

export const ITEM_SETS: Record<string, ItemSetDefinition> = {
  "lost-path": {
    id: "lost-path",
    name: "Regalia of the Lost Path",
    description: "Three relics carried by the scouts who sealed the road to Riftwatch.",
    pieces: ["pathfinderSeal", "fenwatchMantle", "riftwatchSpear"],
    bonuses: [
      { count: 2, name: "Roadward", description: "Quickstep grants 12 ward." },
      { count: 3, name: "No One Left Behind", description: "Aegis echoes 50% of its ward to your other party member." },
    ],
  },
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
  { id: "renewingTouch", name: "Renewing Touch", description: "Mend restores 30% more vigor.", cost: 1, icon: "+", role: "healer", spec: "lifebinder", tier: 1 },
  { id: "livingCurrent", name: "Living Current", description: "Your party receives a small restorative pulse during battle.", cost: 1, icon: "≈", role: "healer", spec: "lifebinder", tier: 2, requires: "renewingTouch" },
  { id: "verdantPulse", name: "Verdant Pulse", description: "Direct healing leaves a short restorative echo.", cost: 1, icon: "✣", role: "healer", spec: "lifebinder", tier: 3, requires: "renewingTouch" },
  { id: "mercifulHands", name: "Merciful Hands", description: "Healing is 25% stronger on allies below 40% vigor.", cost: 1, icon: "♥", role: "healer", spec: "lifebinder", tier: 4, requires: "livingCurrent" },
  { id: "resonantWard", name: "Resonant Ward", description: "Aegis creates 35% more ward.", cost: 1, icon: "◇", role: "healer", spec: "wardweaver", tier: 1 },
  { id: "sharedShelter", name: "Shared Shelter", description: "Both party members begin combat with 18 ward.", cost: 1, icon: "◈", role: "healer", spec: "wardweaver", tier: 2, requires: "resonantWard" },
  { id: "echoingAegis", name: "Echoing Aegis", description: "Aegis also grants a smaller ward to the rest of the party.", cost: 1, icon: "⬡", role: "healer", spec: "wardweaver", tier: 3, requires: "resonantWard" },
  { id: "unbrokenCircle", name: "Unbroken Circle", description: "Ward capacity and ward strength increase by 20%.", cost: 1, icon: "○", role: "healer", spec: "wardweaver", tier: 4, requires: "sharedShelter" },
  { id: "relentlessEdge", name: "Relentless Edge", description: "Melee auto-attacks deal 25% more damage.", cost: 1, icon: "⚔", role: "damage", spec: "blademaster", tier: 1 },
  { id: "finishingRhythm", name: "Finishing Rhythm", description: "Weapon abilities and auto-attacks deal 15% more damage.", cost: 1, icon: "✦", role: "damage", spec: "blademaster", tier: 2, requires: "relentlessEdge" },
  { id: "battleTempo", name: "Battle Tempo", description: "Melee auto-attacks occur 15% faster.", cost: 1, icon: "»", role: "damage", spec: "blademaster", tier: 3, requires: "relentlessEdge" },
  { id: "sweepingSteel", name: "Sweeping Steel", description: "Weapon abilities strike all nearby enemies.", cost: 1, icon: "∿", role: "damage", spec: "blademaster", tier: 4, requires: "finishingRhythm" },
  { id: "steadyAim", name: "Steady Aim", description: "Ranged auto-attacks deal 25% more damage and reach farther.", cost: 1, icon: "➶", role: "damage", spec: "ranger", tier: 1 },
  { id: "rapidNocking", name: "Rapid Nocking", description: "Ranged auto-attacks fire 20% faster.", cost: 1, icon: "»", role: "damage", spec: "ranger", tier: 2, requires: "steadyAim" },
  { id: "huntersMark", name: "Hunter's Mark", description: "Weapon damage against the selected target increases by 15%.", cost: 1, icon: "◎", role: "damage", spec: "ranger", tier: 3, requires: "steadyAim" },
  { id: "twinShot", name: "Twin Shot", description: "Every fifth ranged auto-attack fires a second shot.", cost: 1, icon: "↠", role: "damage", spec: "ranger", tier: 4, requires: "rapidNocking" },
  { id: "ironConstitution", name: "Iron Constitution", description: "+28 maximum vigor.", cost: 1, icon: "♥", role: "tank", spec: "vanguard", tier: 1 },
  { id: "holdTheLine", name: "Hold the Line", description: "+4 armor and +12 maximum vigor.", cost: 1, icon: "⬟", role: "tank", spec: "vanguard", tier: 2, requires: "ironConstitution" },
  { id: "unyielding", name: "Unyielding", description: "Recover a small amount of vigor while under sustained pressure.", cost: 1, icon: "▲", role: "tank", spec: "vanguard", tier: 3, requires: "ironConstitution" },
  { id: "commandingGuard", name: "Commanding Guard", description: "Your presence reduces damage taken by the whole party.", cost: 1, icon: "♜", role: "tank", spec: "vanguard", tier: 4, requires: "holdTheLine" },
  { id: "riftBulwark", name: "Rift Bulwark", description: "Begin combat with 28 ward.", cost: 1, icon: "◈", role: "tank", spec: "spellguard", tier: 1 },
  { id: "dampenRift", name: "Dampen the Rift", description: "Dangerous enemy mechanics deal 20% less damage to you.", cost: 1, icon: "◇", role: "tank", spec: "spellguard", tier: 2, requires: "riftBulwark" },
  { id: "arcaneReturn", name: "Arcane Return", description: "Consumed wards restore focus and accelerate your next ability.", cost: 1, icon: "↻", role: "tank", spec: "spellguard", tier: 3, requires: "riftBulwark" },
  { id: "nullField", name: "Null Field", description: "Nearby allies take 15% less damage from major mechanics.", cost: 1, icon: "⊘", role: "tank", spec: "spellguard", tier: 4, requires: "dampenRift" },
];

export const SHOP_STOCK = ["forgeBlade", "hunterBow", "focusStaff", "oathsplitter", "travelCoat", "vowkeepersWrap", "marshWard", "tonic"];
export const INITIAL_SHOP_STOCK: Record<string, number> = { forgeBlade: 1, hunterBow: 1, focusStaff: 1, oathsplitter: 1, travelCoat: 1, vowkeepersWrap: 1, marshWard: 1, tonic: 4 };

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
