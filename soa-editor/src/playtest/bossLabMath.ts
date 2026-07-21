import { ITEMS, ITEM_SETS, type AttackStyle, type CombatRole, type CombatSpec } from "./content";

export const VETERAN_BOSS_HP = 14_500;
export const VETERAN_ENRAGE_SECONDS = 180;
export const VETERAN_TALENT_POINTS = 3;

export type BossLoadout = {
  role: CombatRole;
  spec: CombatSpec;
  weaponId: string;
  armorId?: string;
  charmId?: string;
  talents: string[];
  activeSkillIds?: string[];
};

export type VeteranItemEffects = {
  strikeCleave: number;
  mendWard: number;
  mendDamage: number;
  dodgeWard: number;
  partyWardMultiplier: number;
  primaryDamageMultiplier: number;
  damageMultiplier: number;
  riftBoltDamage: number;
  labels: string[];
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
  attackRange: number;
};

function equippedItems(loadout: BossLoadout) {
  return [loadout.weaponId, loadout.armorId, loadout.charmId]
    .map((id) => id ? ITEMS[id] : undefined)
    .filter((item) => Boolean(item));
}

export function veteranItemEffects(loadout: BossLoadout): VeteranItemEffects {
  const equipped = equippedItems(loadout);
  const powers = new Set(equipped.map((item) => item?.power).filter(Boolean));
  const effects: VeteranItemEffects = {
    strikeCleave: powers.has("cleaving-strike") ? .55 : 0,
    mendWard: powers.has("mending-ward") ? 45 : 0,
    mendDamage: powers.has("mending-smite") ? .45 : 0,
    dodgeWard: 0,
    partyWardMultiplier: 1,
    primaryDamageMultiplier: powers.has("cleaving-strike") ? 1.3 : 1,
    damageMultiplier: 1,
    riftBoltDamage: powers.has("mending-smite") ? 32 : 0,
    labels: [],
  };
  if (effects.strikeCleave) effects.labels.push("Oathsplitter · Weapon Art deals 30% more damage and cleaves other Rift Echoes for 55%.");
  if (effects.mendWard) effects.labels.push("Vowkeeper's Wrap · Greater Mend also grants 45 ward.");
  if (effects.mendDamage) effects.labels.push("Resonant Portal Shard · Active skills fire a 32-damage Rift Bolt; Mend also converts healing into damage.");
  for (const set of Object.values(ITEM_SETS)) {
    const count = equipped.filter((item) => item?.setId === set.id).length;
    for (const bonus of set.bonuses) {
      if (count < bonus.count) continue;
      if (set.id === "lost-path" && bonus.count === 2) {
        effects.dodgeWard = 45;
        effects.labels.push(`${set.name} (2) · Quickstep grants 45 ward.`);
      }
      if (set.id === "lost-path" && bonus.count === 3) {
        effects.partyWardMultiplier = 1.5;
        effects.damageMultiplier = 1.15;
        effects.labels.push(`${set.name} (3) · Deal 15% more damage; party ward abilities grant 50% more ward.`);
      }
    }
  }
  return effects;
}

export function combatRate(total: number, duration: number): number {
  return Math.round(total / Math.max(1, duration));
}

export function riftFracture(stacks: number): { damageMultiplier: number; healingMultiplier: number } {
  return { damageMultiplier: 1 + Math.max(0, stacks) * .22, healingMultiplier: Math.max(.25, 1 - Math.max(0, stacks) * .18) };
}

export type TalentSkillDefinition = { talentId: string; name: string; detail: string; cooldown: number };

export const TALENT_SKILLS: Record<string, TalentSkillDefinition> = {
  renewingTouch: { talentId: "renewingTouch", name: "Life Bloom", detail: "Powerful lowest-ally heal", cooldown: 8 },
  livingCurrent: { talentId: "livingCurrent", name: "Living Current", detail: "Heal party · restore focus", cooldown: 14 },
  verdantPulse: { talentId: "verdantPulse", name: "Verdant Nova", detail: "Party heal becomes damage", cooldown: 16 },
  mercifulHands: { talentId: "mercifulHands", name: "Rescue", detail: "Emergency heal + ward", cooldown: 20 },
  resonantWard: { talentId: "resonantWard", name: "Wardburst", detail: "Consume ward for damage", cooldown: 9 },
  sharedShelter: { talentId: "sharedShelter", name: "Shared Shelter", detail: "Large ward for the party", cooldown: 15 },
  echoingAegis: { talentId: "echoingAegis", name: "Aegis Echo", detail: "Ward and heal the party", cooldown: 18 },
  unbrokenCircle: { talentId: "unbrokenCircle", name: "Unbroken Circle", detail: "10s party mitigation", cooldown: 24 },
  relentlessEdge: { talentId: "relentlessEdge", name: "Blade Storm", detail: "Heavy hit · cleaves Echoes", cooldown: 7 },
  finishingRhythm: { talentId: "finishingRhythm", name: "Tempo Break", detail: "Damage · reset Weapon Art", cooldown: 11 },
  battleTempo: { talentId: "battleTempo", name: "Overdrive", detail: "10s extreme auto-attack haste", cooldown: 22 },
  sweepingSteel: { talentId: "sweepingSteel", name: "Rift Sweep", detail: "Massive damage to all Echoes", cooldown: 16 },
  steadyAim: { talentId: "steadyAim", name: "Aimed Shot", detail: "210 ranged damage", cooldown: 9 },
  rapidNocking: { talentId: "rapidNocking", name: "Rapid Volley", detail: "Three fast weapon hits", cooldown: 12 },
  huntersMark: { talentId: "huntersMark", name: "Expose Rift", detail: "+20% personal damage for 12s", cooldown: 20 },
  twinShot: { talentId: "twinShot", name: "Twin Shot", detail: "Two heavy ranged hits", cooldown: 14 },
  ironConstitution: { talentId: "ironConstitution", name: "Bloodied Reprisal", detail: "Damage scales with missing vigor", cooldown: 9 },
  holdTheLine: { talentId: "holdTheLine", name: "Hold the Line", detail: "8s party mitigation", cooldown: 20 },
  unyielding: { talentId: "unyielding", name: "Second Wind", detail: "Large self-heal + ward", cooldown: 18 },
  commandingGuard: { talentId: "commandingGuard", name: "War Cry", detail: "+25% party damage for 10s", cooldown: 24 },
  riftBulwark: { talentId: "riftBulwark", name: "Rift Bulwark", detail: "Massive personal ward", cooldown: 16 },
  dampenRift: { talentId: "dampenRift", name: "Spellbreak", detail: "Cancel the active boss mechanic", cooldown: 28 },
  arcaneReturn: { talentId: "arcaneReturn", name: "Arcane Return", detail: "Damage · focus · cooldown reset", cooldown: 15 },
  nullField: { talentId: "nullField", name: "Null Field", detail: "12s party mitigation field", cooldown: 26 },
};

export function veteranProfile(loadout: BossLoadout): VeteranProfile {
  const weapon = ITEMS[loadout.weaponId] ?? ITEMS.wornBlade;
  const armorItem = loadout.armorId ? ITEMS[loadout.armorId] : undefined;
  const charmItem = loadout.charmId ? ITEMS[loadout.charmId] : undefined;
  const style = weapon.attackStyle ?? "melee";
  const selected = new Set(loadout.talents);
  let maxHp = (loadout.role === "tank" ? 340 : loadout.role === "healer" ? 245 : 230) + ((armorItem?.health ?? 0) + (charmItem?.health ?? 0)) * 2;
  let armor = (loadout.role === "tank" ? 10 : 4) + (armorItem?.armor ?? 0) + (charmItem?.armor ?? 0);
  let autoDamage = 24 + ((weapon.damage ?? 0) + (charmItem?.damage ?? 0)) * 1.4 + (loadout.role === "damage" ? 8 : 0);
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
  autoDamage *= veteranItemEffects(loadout).damageMultiplier;

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
      ? { id: "nessa", name: "Nessa Reed", role: "damage", specialization: "Gloam Ranger", note: "Maintains ranged pressure and handles marked zones.", maxHp: 230, armor: 5, attackDamage: 44, attackInterval: 1.55, attackRange: 520 }
      : { id: "nessa", name: "Nessa Reed", role: "tank", specialization: "Trail Vanguard", note: "Holds boss attention and uses defensive cooldowns.", maxHp: 390, armor: 12, attackDamage: 28, attackInterval: 1.75, attackRange: 190 },
    role === "healer"
      ? { id: "ilyra", name: "Ilyra Venn", role: "damage", specialization: "Rift Arcanist", note: "Converts unused healing focus into burst damage.", maxHp: 220, armor: 4, attackDamage: 48, attackInterval: 1.65, attackRange: 540 }
      : { id: "ilyra", name: "Ilyra Venn", role: "healer", specialization: "Lifebinder", note: "Triages the lowest ally and prepares for raidwide damage.", maxHp: 225, armor: 4, attackDamage: 28, attackInterval: 2, attackRange: 540 },
    { id: "torren", name: "Torren Vale", role: "damage", specialization: "Hammer Adept", note: "Breaks Rift Echoes and supplies reliable melee damage.", maxHp: 280, armor: 7, attackDamage: 50, attackInterval: 1.6, attackRange: 240 },
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
