import { ITEMS, type EquipmentSlot, type LocationId } from "./content";

export type QuestStage = "not-started" | "reach-forest" | "cross-fen" | "reach-gate" | "return" | "complete";

export type PlayState = {
  version: 1;
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
};

export const SAVE_KEY = "soa.playtest.campaign.v1";

export function createNewGame(playerName = "Wayfarer"): PlayState {
  return {
    version: 1,
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
    lore: ["bell"],
    questStage: "not-started",
    clearedEncounters: [],
    choices: [],
    playSeconds: 0,
  };
}

export function loadGame(): PlayState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlayState>;
    if (parsed.version !== 1 || !parsed.playerName || !parsed.inventory) return null;
    return { ...createNewGame(parsed.playerName), ...parsed } as PlayState;
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
  return 100 + (state.level - 1) * 12 + armor + charm + (state.talents.includes("resolve") ? 18 : 0);
}

export function playerDamage(state: PlayState): number {
  const weapon = state.equipment.weapon ? ITEMS[state.equipment.weapon]?.damage ?? 0 : 0;
  const charm = state.equipment.charm ? ITEMS[state.equipment.charm]?.damage ?? 0 : 0;
  return 9 + weapon + charm + (state.level - 1) * 2 + (state.talents.includes("ember") ? 5 : 0);
}

export function playerArmor(state: PlayState): number {
  const item = state.equipment.armor ? ITEMS[state.equipment.armor] : undefined;
  return item?.armor ?? 0;
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
    case "not-started": return "Speak with Mara Vey at the bell tower.";
    case "reach-forest": return "Follow the old road into Elderwood Verge.";
    case "cross-fen": return "Collect mirebloom and cross Blackwater Fen.";
    case "reach-gate": return "Reach Shanoir Gate and recover the bell clapper.";
    case "return": return "Return the Ashen Bell Clapper to Mara.";
    case "complete": return "The first chapter is complete.";
  }
}

export function canTravelTo(state: PlayState, target: LocationId): { allowed: boolean; reason?: string } {
  if (target === state.location) return { allowed: false, reason: "You are already here." };
  if (target === "village") return { allowed: true };
  if (state.questStage === "not-started") return { allowed: false, reason: "The old road is still sealed." };
  if (target === "forest") return { allowed: true };
  if (target === "swamp" && state.clearedEncounters.includes("forest")) return { allowed: true };
  if (target === "ruins" && state.clearedEncounters.includes("swamp")) return { allowed: true };
  return { allowed: false, reason: "The route ahead has not been cleared." };
}

export function applyEncounterVictory(state: PlayState, location: LocationId): PlayState {
  if (state.clearedEncounters.includes(location)) return state;
  let next: PlayState = { ...state, clearedEncounters: [...state.clearedEncounters, location] };
  if (location === "forest") {
    next = gainXp({ ...next, gold: next.gold + 16, questStage: "cross-fen", lore: [...new Set([...next.lore, "oldRoad"])] }, 55);
  } else if (location === "swamp") {
    next = addItem(gainXp({ ...next, gold: next.gold + 24, questStage: "reach-gate", lore: [...new Set([...next.lore, "mire"])] }, 75), "mireBloom");
  } else if (location === "ruins") {
    next = addItem(addItem(gainXp({ ...next, gold: next.gold + 40, questStage: "return", lore: [...new Set([...next.lore, "gate"])] }, 120), "bellClapper"), "emberCharm");
  }
  return { ...next, health: Math.min(maxHealth(next), next.health + 25) };
}
