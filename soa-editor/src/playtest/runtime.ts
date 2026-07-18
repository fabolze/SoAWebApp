import { INITIAL_SHOP_STOCK, ITEMS, TALENTS, type EquipmentSlot, type LocationId } from "./content";

export type QuestStage = "not-started" | "reach-forest" | "cross-fen" | "reach-gate" | "return" | "complete";

export type PlayState = {
  version: 3;
  playerName: string;
  location: LocationId;
  dayMinutes: number;
  gold: number;
  level: number;
  xp: number;
  talentPoints: number;
  health: number;
  inventory: Record<string, number>;
  equipment: Partial<Record<EquipmentSlot, string>>;
  talents: string[];
  lore: string[];
  questStage: QuestStage;
  clearedEncounters: LocationId[];
  choices: string[];
  playSeconds: number;
  shopStock: Record<string, number>;
  companionJoined: boolean;
};

export const SAVE_KEY = "soa.playtest.campaign.v3";
export const LEGACY_SAVE_KEY = "soa.playtest.campaign.v2";

export function createNewGame(playerName = "Wayfarer"): PlayState {
  return {
    version: 3,
    playerName: playerName.trim() || "Wayfarer",
    location: "village",
    dayMinutes: 7 * 60 + 20,
    gold: 42,
    level: 1,
    xp: 0,
    talentPoints: 1,
    health: 100,
    inventory: { wornBlade: 1, tonic: 1 },
    equipment: { weapon: "wornBlade" },
    talents: [],
    lore: ["portalTaboo", "hearthmere"],
    questStage: "not-started",
    clearedEncounters: [],
    choices: [],
    playSeconds: 0,
    shopStock: { ...INITIAL_SHOP_STOCK },
    companionJoined: false,
  };
}

export function loadGame(): PlayState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Omit<Partial<PlayState>, "version"> & { version?: number };
    if ((parsed.version !== 2 && parsed.version !== 3) || !parsed.playerName || !parsed.inventory) return null;
    const fresh = createNewGame(parsed.playerName);
    return {
      ...fresh,
      ...parsed,
      version: 3,
      inventory: { ...fresh.inventory, ...parsed.inventory },
      equipment: { ...fresh.equipment, ...parsed.equipment },
      shopStock: { ...fresh.shopStock, ...parsed.shopStock },
      companionJoined: parsed.companionJoined ?? parsed.questStage !== "not-started",
    };
  } catch {
    return null;
  }
}

export function saveGame(state: PlayState): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function maxHealth(state: PlayState): number {
  const armor = state.equipment.armor ? ITEMS[state.equipment.armor]?.health ?? 0 : 0;
  const charm = state.equipment.charm ? ITEMS[state.equipment.charm]?.health ?? 0 : 0;
  return 100 + (state.level - 1) * 12 + armor + charm + (state.talents.includes("resolve") ? 18 : 0) + (state.talents.includes("bastion") ? 8 : 0);
}

export function playerDamage(state: PlayState): number {
  const weapon = state.equipment.weapon ? ITEMS[state.equipment.weapon]?.damage ?? 0 : 0;
  const charm = state.equipment.charm ? ITEMS[state.equipment.charm]?.damage ?? 0 : 0;
  return 9 + weapon + charm + (state.level - 1) * 2 + (state.talents.includes("ember") ? 5 : 0) + (state.talents.includes("resonance") ? 6 : 0);
}

export function playerArmor(state: PlayState): number {
  const armorItem = state.equipment.armor ? ITEMS[state.equipment.armor] : undefined;
  const charmItem = state.equipment.charm ? ITEMS[state.equipment.charm] : undefined;
  return (armorItem?.armor ?? 0) + (charmItem?.armor ?? 0) + (state.talents.includes("bastion") ? 3 : 0);
}

export function tonicHealing(state: PlayState): number {
  return (ITEMS.tonic.heal ?? 35) + (state.talents.includes("fieldcraft") ? 15 : 0);
}

export function addItem(state: PlayState, itemId: string, amount = 1): PlayState {
  return { ...state, inventory: { ...state.inventory, [itemId]: (state.inventory[itemId] ?? 0) + amount } };
}

export function removeItem(state: PlayState, itemId: string, amount = 1): PlayState {
  const next = Math.max(0, (state.inventory[itemId] ?? 0) - amount);
  const inventory = { ...state.inventory, [itemId]: next };
  if (next === 0) delete inventory[itemId];
  return { ...state, inventory };
}

export function equipItem(state: PlayState, itemId: string): PlayState {
  const item = ITEMS[itemId];
  if (!item?.slot || !(state.inventory[itemId] ?? 0)) return state;
  const next = { ...state, equipment: { ...state.equipment, [item.slot]: itemId } };
  return { ...next, health: Math.min(maxHealth(next), next.health) };
}

export function unequipItem(state: PlayState, slot: EquipmentSlot): PlayState {
  const equipment = { ...state.equipment };
  delete equipment[slot];
  const next = { ...state, equipment };
  return { ...next, health: Math.min(maxHealth(next), next.health) };
}

export function purchaseItem(state: PlayState, itemId: string): { state: PlayState; reason?: string } {
  const item = ITEMS[itemId];
  if (!item || !(state.shopStock[itemId] ?? 0)) return { state, reason: "Torren has sold out of that item." };
  if (state.gold < item.price) return { state, reason: "Not enough gold." };
  const next = addItem({
    ...state,
    gold: state.gold - item.price,
    shopStock: { ...state.shopStock, [itemId]: state.shopStock[itemId] - 1 },
  }, itemId);
  return { state: next };
}

export function sellItem(state: PlayState, itemId: string): { state: PlayState; value: number; reason?: string } {
  const item = ITEMS[itemId];
  if (!item || !(state.inventory[itemId] ?? 0)) return { state, value: 0, reason: "You do not have that item." };
  if (item.type === "quest" || item.price <= 0) return { state, value: 0, reason: "That should stay with you." };
  if (item.slot && state.equipment[item.slot] === itemId) return { state, value: 0, reason: "Unequip that item before selling it." };
  const value = Math.max(1, Math.floor(item.price * 0.5));
  const next = removeItem({
    ...state,
    gold: state.gold + value,
    shopStock: { ...state.shopStock, [itemId]: (state.shopStock[itemId] ?? 0) + 1 },
  }, itemId);
  return { state: next, value };
}

export function canUnlockTalent(state: PlayState, talentId: string): { allowed: boolean; reason?: string } {
  const talent = TALENTS.find((entry) => entry.id === talentId);
  if (!talent) return { allowed: false, reason: "Unknown talent." };
  if (state.talents.includes(talentId)) return { allowed: false, reason: "Already learned." };
  if (talent.requires && !state.talents.includes(talent.requires)) {
    const required = TALENTS.find((entry) => entry.id === talent.requires);
    return { allowed: false, reason: `Learn ${required?.name ?? "the previous talent"} first.` };
  }
  if (state.talentPoints < talent.cost) return { allowed: false, reason: "Not enough talent points." };
  return { allowed: true };
}

export function unlockTalent(state: PlayState, talentId: string): PlayState {
  if (!canUnlockTalent(state, talentId).allowed) return state;
  const talent = TALENTS.find((entry) => entry.id === talentId)!;
  const next = { ...state, talents: [...state.talents, talentId], talentPoints: state.talentPoints - talent.cost };
  return { ...next, health: Math.min(maxHealth(next), state.health + (talentId === "resolve" ? 18 : talentId === "bastion" ? 8 : 0)) };
}

export function gainXp(state: PlayState, amount: number): PlayState {
  let xp = state.xp + amount;
  let level = state.level;
  let talentPoints = state.talentPoints;
  while (xp >= level * 100) {
    xp -= level * 100;
    level += 1;
    talentPoints += 1;
  }
  const next = { ...state, xp, level, talentPoints };
  return { ...next, health: Math.min(maxHealth(next), state.health + (level - state.level) * 35) };
}

export function formatTime(minutes: number): string {
  const normalized = minutes % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = Math.floor(normalized % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function objectiveText(stage: QuestStage): string {
  switch (stage) {
    case "not-started": return "Speak with Elder Maelin about Iven's disappearance.";
    case "reach-forest": return "Meet Nessa and follow Iven's tracks into Gloamwood.";
    case "cross-fen": return "Keep following the trail through Morrowfen.";
    case "reach-gate": return "Find Iven at the forbidden Riftwatch portal.";
    case "return": return "Bring Iven home and tell Maelin what awoke at Riftwatch.";
    case "complete": return "Chapter I is complete. Hearthmere is safe—for tonight.";
  }
}

export function canTravelTo(state: PlayState, target: LocationId): { allowed: boolean; reason?: string } {
  if (target === state.location) return { allowed: false, reason: "You are already here." };
  if (target === "village") return { allowed: true };
  if (state.questStage === "not-started") return { allowed: false, reason: "The south gate is closed until the search begins." };
  if (target === "forest") return { allowed: true };
  if (target === "swamp" && state.clearedEncounters.includes("forest")) return { allowed: true };
  if (target === "ruins" && state.clearedEncounters.includes("swamp")) return { allowed: true };
  return { allowed: false, reason: "The route ahead has not been cleared." };
}

export function applyEncounterVictory(state: PlayState, location: LocationId): PlayState {
  if (state.clearedEncounters.includes(location)) return state;
  let next: PlayState = { ...state, clearedEncounters: [...state.clearedEncounters, location] };
  if (location === "forest") {
    next = gainXp({ ...next, gold: next.gold + 16, questStage: "cross-fen", lore: [...new Set([...next.lore, "wrongShadows", "nessa"])] }, 55);
  } else if (location === "swamp") {
    next = addItem(gainXp({ ...next, gold: next.gold + 24, questStage: "reach-gate", lore: [...new Set([...next.lore, "missingTrail"])] }, 75), "missingScarf");
  } else if (location === "ruins") {
    next = addItem(addItem(gainXp({ ...next, gold: next.gold + 40, questStage: "return", lore: [...new Set([...next.lore, "shanoirRift", "raznah"])] }, 120), "portalFragment"), "resonanceCharm");
  }
  return { ...next, health: Math.min(maxHealth(next), next.health + 25) };
}
