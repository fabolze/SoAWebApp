import { ITEMS, type AttackStyle, type CombatRole, type CombatSpec } from "./content";

export const VETERAN_BOSS_HP = 18_000;
export const VETERAN_ENRAGE_SECONDS = 225;
export const VETERAN_TALENT_POINTS = 3;

export type BossLoadout = {
  role: CombatRole;
  spec: CombatSpec;
  weaponId: string;
  talents: string[];
};

export type VeteranProfile = {
  maxHp: number;
  armor: number;
  autoDamage: number;
  autoInterval: number;
  autoRange: number;
  attackStyle: AttackStyle;
  healingPower: number;
  wardPower: number;
  mechanicTaken: number;
};

export type VeteranCompanion = {
  id: "nessa" | "ilyra" | "torren";
  name: string;
  role: "tank" | "healer" | "damage";
  specialization: string;
  note: string;
  maxHp: number;
  armor: number;
  attackDamage: number;
  attackInterval: number;
};

export function veteranProfile(loadout: BossLoadout): VeteranProfile {
  const weapon = ITEMS[loadout.weaponId] ?? ITEMS.wornBlade;
  const style = weapon.attackStyle ?? "melee";
  const selected = new Set(loadout.talents);
  let maxHp = loadout.role === "tank" ? 340 : loadout.role === "healer" ? 245 : 230;
  let armor = loadout.role === "tank" ? 10 : 4;
  let autoDamage = 24 + (weapon.damage ?? 0) * 1.4 + (loadout.role === "damage" ? 8 : 0);
  let autoInterval = Math.max(1.25, (weapon.autoInterval ?? 1.9) - .12);
  let autoRange = weapon.autoRange ?? (style === "ranged" ? 420 : 110);
  let healingPower = 1 + (weapon.healingPower ?? 0) + (loadout.role === "healer" ? .35 : 0);
  let wardPower = 1 + (loadout.role === "healer" ? .25 : 0);
  let mechanicTaken = 1;

  if (selected.has("ironConstitution")) maxHp += 55;
  if (selected.has("holdTheLine")) { maxHp += 25; armor += 5; }
  if (selected.has("commandingGuard")) armor += 2;
  if (selected.has("riftBulwark")) maxHp += 30;
  if (selected.has("dampenRift")) mechanicTaken *= .8;
  if (selected.has("nullField")) mechanicTaken *= .85;
  if (style === "melee" && selected.has("relentlessEdge")) autoDamage *= 1.25;
  if (selected.has("finishingRhythm")) autoDamage *= 1.15;
  if (style === "melee" && selected.has("battleTempo")) autoInterval *= .85;
  if (style === "ranged" && selected.has("steadyAim")) { autoDamage *= 1.25; autoRange += 55; }
  if (style === "ranged" && selected.has("rapidNocking")) autoInterval *= .8;
  if (selected.has("huntersMark")) autoDamage *= 1.15;
  if (selected.has("twinShot")) autoDamage *= 1.2;
  if (selected.has("renewingTouch")) healingPower += .3;
  if (selected.has("verdantPulse")) healingPower += .15;
  if (selected.has("mercifulHands")) healingPower += .15;
  if (selected.has("resonantWard")) wardPower += .35;
  if (selected.has("unbrokenCircle")) wardPower += .2;

  return {
    maxHp,
    armor,
    autoDamage: Math.round(autoDamage),
    autoInterval: Number(autoInterval.toFixed(2)),
    autoRange,
    attackStyle: style,
    healingPower: Number(healingPower.toFixed(2)),
    wardPower: Number(wardPower.toFixed(2)),
    mechanicTaken: Number(mechanicTaken.toFixed(2)),
  };
}

export function veteranParty(role: CombatRole): VeteranCompanion[] {
  return [
    role === "tank"
      ? { id: "nessa", name: "Nessa Reed", role: "damage", specialization: "Gloam Ranger", note: "Maintains ranged pressure and handles marked zones.", maxHp: 230, armor: 5, attackDamage: 31, attackInterval: 1.65 }
      : { id: "nessa", name: "Nessa Reed", role: "tank", specialization: "Trail Vanguard", note: "Holds boss attention and uses defensive cooldowns.", maxHp: 390, armor: 12, attackDamage: 18, attackInterval: 1.9 },
    role === "healer"
      ? { id: "ilyra", name: "Ilyra Venn", role: "damage", specialization: "Rift Arcanist", note: "Converts unused healing focus into burst damage.", maxHp: 220, armor: 4, attackDamage: 35, attackInterval: 1.8 }
      : { id: "ilyra", name: "Ilyra Venn", role: "healer", specialization: "Lifebinder", note: "Triages the lowest ally and prepares for raidwide damage.", maxHp: 225, armor: 4, attackDamage: 12, attackInterval: 2.2 },
    role === "damage"
      ? { id: "torren", name: "Torren Vale", role: "tank", specialization: "Forgeguard", note: "Provides an off-tank cooldown when Nessa is pressured.", maxHp: 315, armor: 9, attackDamage: 22, attackInterval: 1.75 }
      : { id: "torren", name: "Torren Vale", role: "damage", specialization: "Hammer Adept", note: "Breaks Rift Echoes and supplies reliable melee damage.", maxHp: 280, armor: 7, attackDamage: 38, attackInterval: 1.7 },
  ];
}

export function bossPhase(remainingHp: number): 1 | 2 | 3 {
  const ratio = remainingHp / VETERAN_BOSS_HP;
  if (ratio > .7) return 1;
  if (ratio > .35) return 2;
  return 3;
}

export function projectedVeteranDuration(loadout: BossLoadout): number {
  const profile = veteranProfile(loadout);
  const companions = veteranParty(loadout.role);
  const passiveDps = profile.autoDamage / profile.autoInterval + companions.reduce((sum, companion) => sum + companion.attackDamage / companion.attackInterval, 0);
  const activeDps = loadout.role === "damage" ? 61 : loadout.role === "tank" ? 42 : 36;
  const echoes = 2_700;
  const phaseTransitions = 6;
  return Math.round((VETERAN_BOSS_HP + echoes) / (passiveDps + activeDps) + phaseTransitions);
}
