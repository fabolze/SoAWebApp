import type {
  SimulationDatasets,
  SimulationMetrics,
  SimulationResult,
  SimulationRunOptions,
  SimulationScenario,
  SimulationSchemaName,
} from "./types";

const TARGET_MULTIPLIER: Record<string, number> = {
  Single: 1,
  Self: 0.65,
  Enemy: 1,
  Allies: 0.85,
  Ally: 0.85,
  Area: 1.35,
  All: 1.45,
  Enemies: 1.3,
};

const TRIGGER_RATE: Record<string, number> = {
  "On Use": 1,
  Passive: 1.15,
  "On Hit": 0.65,
  "When Damaged": 0.55,
  "On Kill": 0.4,
  "On Cast": 0.8,
  None: 0.75,
};

const RARITY_MULTIPLIER: Record<string, number> = {
  Common: 1,
  Uncommon: 1.15,
  Rare: 1.35,
  Epic: 1.65,
  Legendary: 2,
};

const VALUE_TYPE_MULTIPLIER: Record<string, number> = {
  Flat: 1,
  Percentage: 1.4,
  Multiplier: 1.8,
  None: 0.8,
};

const EFFECT_TYPE_MULTIPLIER: Record<string, number> = {
  Damage: 1.25,
  Heal: 0.9,
  Status: 1.1,
  Modifier: 0.95,
  Reflect: 1.2,
  Summon: 1.3,
  Shield: 1.1,
  Control: 1.35,
};

const AGGRESSION_MULTIPLIER: Record<string, number> = {
  Hostile: 1.25,
  Neutral: 1,
  Friendly: 0.8,
};

const ENEMY_TYPE_MULTIPLIER: Record<string, number> = {
  boss: 1.8,
  dragon: 1.6,
  giant: 1.35,
  demon: 1.3,
  undead: 1.15,
  beast: 1.05,
  humanoid: 1,
  elemental: 1.12,
  machine: 1.08,
  spirit: 1.1,
  emanation: 1.12,
  other: 1,
};

const ABILITY_TYPE_MULTIPLIER: Record<string, number> = {
  Active: 1,
  Passive: 0.9,
  Toggle: 1.05,
};

interface EffectVector {
  damage: number;
  control: number;
  sustain: number;
  economy: number;
  procChance: number;
}

interface InternalSimulationResult {
  metrics: SimulationMetrics;
  warnings: string[];
  notes: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asObjectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance = values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function score(raw: number, pivot: number): number {
  if (pivot <= 0) return 0;
  return clamp((raw / pivot) * 100, 0, 100);
}

function createRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function lookupById(dataset: Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  dataset.forEach((entry) => {
    const id = toText(entry.id);
    if (id) map.set(id, entry);
  });
  return map;
}

function getEntityId(entity: Record<string, unknown>): string {
  const raw = toText(entity.id).trim();
  return raw || "draft";
}

function getEntityLabel(entity: Record<string, unknown>, fallback: string): string {
  const name = toText(entity.name).trim();
  const title = toText(entity.title).trim();
  if (name) return name;
  if (title) return title;
  return fallback;
}

function safeChancePercent(value: unknown, defaultPercent = 100): number {
  return clamp(num(value, defaultPercent), 0, 100) / 100;
}

function deriveEffectVector(
  effect: Record<string, unknown>,
  scenario: SimulationScenario
): EffectVector {
  const type = toText(effect.type, "Modifier");
  const target = toText(effect.target, "Enemy");
  const triggerCondition = toText(effect.trigger_condition, "None");
  const valueType = toText(effect.value_type, "Flat");
  const duration = num(effect.duration, 0);
  const rawValue = Math.abs(num(effect.value, 12));
  const baseTypeMultiplier = EFFECT_TYPE_MULTIPLIER[type] ?? 1;
  const targetMultiplier = TARGET_MULTIPLIER[target] ?? 1;
  const triggerMultiplier = TRIGGER_RATE[triggerCondition] ?? 0.8;
  const valueTypeMultiplier = VALUE_TYPE_MULTIPLIER[valueType] ?? 1;
  const durationMultiplier = duration < 0 ? 2.2 : 1 + clamp(duration, 0, 10) * 0.1;
  const stackMultiplier = effect.stackable ? 1.15 : 1;
  const chance = type === "Status" || type === "Control"
    ? safeChancePercent(effect.apply_chance, 75)
    : safeChancePercent(effect.apply_chance, 100);

  const base = rawValue * baseTypeMultiplier * targetMultiplier * valueTypeMultiplier * durationMultiplier * stackMultiplier;

  let damage = 0;
  let control = 0;
  let sustain = 0;
  let economy = 0;

  if (type === "Damage" || type === "Reflect") {
    damage = base * triggerMultiplier * (0.85 + scenario.pressure * 0.25);
  } else if (type === "Heal" || type === "Shield") {
    sustain = base * triggerMultiplier * 0.9;
  } else if (type === "Control" || type === "Status") {
    control = base * triggerMultiplier * (0.9 + scenario.controlWeight * 0.5);
  } else if (type === "Modifier" || type === "Summon") {
    damage = base * 0.45;
    sustain = base * 0.25;
    control = base * 0.3;
  } else {
    economy = base * 0.2;
  }

  economy += rawValue * 0.06;

  return {
    damage,
    control,
    sustain,
    economy,
    procChance: chance,
  };
}

function estimateAbilityStaticImpact(
  ability: Record<string, unknown>,
  datasets: SimulationDatasets,
  scenario: SimulationScenario
): number {
  const scaling = asObjectArray(ability.scaling).reduce(
    (acc, row) => acc + Math.max(0, num(row.multiplier, 0)),
    0
  );
  const targetFactor = TARGET_MULTIPLIER[toText(ability.targeting, "Single")] ?? 1;
  const cooldown = Math.max(0, num(ability.cooldown, 0));
  const typeFactor = ABILITY_TYPE_MULTIPLIER[toText(ability.type, "Active")] ?? 1;
  const effectLookup = lookupById(datasets.effects);
  const effectImpact = asStringArray(ability.effects).reduce((acc, effectId) => {
    const effect = effectLookup.get(effectId);
    if (!effect) return acc;
    const vector = deriveEffectVector(effect, scenario);
    return acc + vector.damage + vector.control * 0.8 + vector.sustain * 0.45;
  }, 0);
  const base = (20 + scaling * scenario.statBudget * 30 + effectImpact * 0.4) * targetFactor * typeFactor;
  const cadence = 1 / Math.max(1, cooldown + 1);
  return base * cadence;
}

function collectGenericWarnings(
  schemaName: SimulationSchemaName,
  entity: Record<string, unknown>
): string[] {
  const warnings: string[] = [];
  if (!toText(entity.id)) warnings.push("Draft has no ID yet. Cross-reference checks may be incomplete.");
  if (!toText(entity.name) && !toText(entity.title)) {
    warnings.push("Entity has no clear name/title, which can make curation harder at scale.");
  }
  if (schemaName === "abilities" && num(entity.cooldown, 0) > 10) {
    warnings.push("Very high cooldown detected. Check if burst value compensates for downtime.");
  }
  if (schemaName === "items" && num(entity.base_price, 0) <= 0) {
    warnings.push("Item has non-positive base price. Economy simulations may be skewed.");
  }
  if (schemaName === "effects" && num(entity.apply_chance, 100) < 30) {
    warnings.push("Low apply chance can create highly volatile outcomes.");
  }
  if (schemaName === "encounters" && asObjectArray(entity.participants).length === 0) {
    warnings.push("Encounter has no participants. Threat estimation is near-zero.");
  }
  if (schemaName === "combat_profiles" && asObjectArray(entity.custom_stats).length === 0) {
    warnings.push("Combat profile has no custom stats. Threat relies mostly on linked abilities.");
  }
  if (schemaName === "characters" && num(entity.level, 0) <= 0) {
    warnings.push("Character level is not set or <= 0.");
  }
  return warnings;
}

function evaluateAbility(
  entity: Record<string, unknown>,
  datasets: SimulationDatasets,
  scenario: SimulationScenario,
  runs: number,
  seed: number
): InternalSimulationResult {
  const warnings = collectGenericWarnings("abilities", entity);
  const notes: string[] = [];
  const effectLookup = lookupById(datasets.effects);
  const scalingStrength = asObjectArray(entity.scaling).reduce(
    (acc, row) => acc + Math.max(0, num(row.multiplier, 0)),
    0
  );
  const targetFactor = TARGET_MULTIPLIER[toText(entity.targeting, "Single")] ?? 1;
  const typeFactor = ABILITY_TYPE_MULTIPLIER[toText(entity.type, "Active")] ?? 1;
  const triggerFactor = TRIGGER_RATE[toText(entity.trigger_condition, "On Use")] ?? 1;
  const cooldown = Math.max(0, num(entity.cooldown, 0));
  const cost = Math.max(0, num(entity.resource_cost, 0));
  const effects = asStringArray(entity.effects)
    .map((effectId) => effectLookup.get(effectId))
    .filter((effect): effect is Record<string, unknown> => !!effect);
  const castsPerTurn = 1 / Math.max(1, cooldown + 1);
  const baseCastDamage = (24 + scalingStrength * scenario.statBudget * 32) * targetFactor * typeFactor * triggerFactor;

  const dpsSamples: number[] = [];
  const controlSamples: number[] = [];
  const sustainSamples: number[] = [];
  const economySamples: number[] = [];

  for (let run = 0; run < runs; run += 1) {
    const rng = createRng(seed + run * 7919 + 17);
    let cooldownRemaining = 0;
    let totalDamage = 0;
    let totalControl = 0;
    let totalSustain = 0;
    let totalResourceSpent = 0;

    for (let turn = 0; turn < scenario.turns; turn += 1) {
      if (cooldownRemaining <= 0) {
        const castVariance = 0.88 + rng() * 0.24;
        let castDamage = baseCastDamage * castVariance;
        effects.forEach((effect) => {
          const vector = deriveEffectVector(effect, scenario);
          if (rng() <= vector.procChance) {
            castDamage += vector.damage;
            totalControl += vector.control;
            totalSustain += vector.sustain;
          }
        });
        totalDamage += castDamage;
        totalResourceSpent += cost;
        cooldownRemaining = cooldown;
      } else {
        cooldownRemaining -= 1;
      }
    }

    const turns = Math.max(1, scenario.turns);
    const dps = totalDamage / turns;
    const control = totalControl / turns;
    const sustain = totalSustain / turns;
    const efficiency = (totalDamage + totalControl * 10 + totalSustain * 8) /
      Math.max(1, totalResourceSpent + castsPerTurn * scenario.turns * 2);

    dpsSamples.push(dps);
    controlSamples.push(control);
    sustainSamples.push(sustain);
    economySamples.push(efficiency);
  }

  const avgDps = mean(dpsSamples);
  const avgControl = mean(controlSamples);
  const avgSustain = mean(sustainSamples);
  const avgEconomy = mean(economySamples);
  const consistency = clamp(
    100 - (stdDev(dpsSamples) / Math.max(1, avgDps)) * 100,
    0,
    100
  );

  if (effects.length === 0) {
    notes.push("No linked effects found. Simulation is based on scaling + cadence only.");
  }
  if (cost > scenario.resourceBudget * 0.12) {
    warnings.push("Resource cost is high relative to scenario budget.");
  }

  return {
    metrics: {
      power: score(avgDps * 2.4 + avgControl * 15 + avgSustain * 10, 160),
      value: score(avgEconomy * 28 + avgSustain * 9, 100),
      influence: score(avgControl * 24 + (targetFactor - 1) * 70 + effects.length * 6, 110),
      dps: score(avgDps, 45),
      survivability: score(avgSustain * 14, 100),
      control: score(avgControl * 18, 100),
      economy: score(avgEconomy * 25, 100),
      consistency,
    },
    warnings,
    notes,
  };
}

function evaluateItem(
  entity: Record<string, unknown>,
  datasets: SimulationDatasets,
  scenario: SimulationScenario,
  runs: number,
  seed: number
): InternalSimulationResult {
  const warnings = collectGenericWarnings("items", entity);
  const notes: string[] = [];
  const rarity = toText(entity.rarity, "Common");
  const type = toText(entity.type, "Misc");
  const rarityFactor = RARITY_MULTIPLIER[rarity] ?? 1;
  const basePrice = Math.max(0, num(entity.base_price, 0));
  const effectLookup = lookupById(datasets.effects);
  const effectIds = asStringArray(entity.effects);
  const effectVectors = effectIds
    .map((effectId) => effectLookup.get(effectId))
    .filter((effect): effect is Record<string, unknown> => !!effect)
    .map((effect) => deriveEffectVector(effect, scenario));

  const statPower = asObjectArray(entity.stat_modifiers).reduce((acc, row) => {
    const value = Math.abs(num(row.value, 0));
    const valueType = VALUE_TYPE_MULTIPLIER[toText(row.value_type, "Flat")] ?? 1;
    const scalingBehavior = toText(row.scaling_behavior, "None");
    const scalingFactor = scalingBehavior === "Exponential"
      ? 1.45
      : scalingBehavior === "Linear"
        ? 1.2
        : scalingBehavior === "Logarithmic"
          ? 1.1
          : 1;
    return acc + value * valueType * scalingFactor;
  }, 0);
  const attributePower = asObjectArray(entity.attribute_modifiers).reduce((acc, row) => {
    const value = Math.abs(num(row.value, 0));
    const scaling = toText(row.scaling, "None");
    const scalingFactor = scaling === "Exponential"
      ? 1.4
      : scaling === "Linear"
        ? 1.15
        : scaling === "Logarithmic"
          ? 1.1
          : 1;
    return acc + value * scalingFactor;
  }, 0);
  const effectDamage = effectVectors.reduce((acc, vector) => acc + vector.damage, 0);
  const effectControl = effectVectors.reduce((acc, vector) => acc + vector.control, 0);
  const effectSustain = effectVectors.reduce((acc, vector) => acc + vector.sustain, 0);
  const effectEconomy = effectVectors.reduce((acc, vector) => acc + vector.economy, 0);

  const weaponRange = Math.max(0, num(entity.weapon_range, 0));
  const slotBonus = type === "Weapon"
    ? 14 + weaponRange * 2
    : type === "Armor"
      ? 11
      : type === "Accessory"
        ? 9
        : type === "Consumable"
          ? 7
          : 5;

  const combatSamples: number[] = [];
  const valueSamples: number[] = [];
  const influenceSamples: number[] = [];

  for (let run = 0; run < runs; run += 1) {
    const rng = createRng(seed + run * 10007 + 31);
    const variance = 0.9 + rng() * 0.2;
    const combatRaw = (statPower * 1.8 + attributePower * 1.35 + effectDamage * 0.45 + effectControl * 0.5 + effectSustain * 0.35 + slotBonus) * rarityFactor * variance;
    const economyRaw = (Math.log1p(basePrice) * 11 + effectEconomy * 0.45) * (0.85 + scenario.economyWeight * 0.45);
    const valueRaw = combatRaw / Math.max(1, 1 + basePrice / 240) + economyRaw * scenario.economyWeight;
    const influenceRaw = effectControl * 0.8 + effectDamage * 0.25 + effectIds.length * 2.5 + (type === "Consumable" ? 5 : 0);
    combatSamples.push(combatRaw);
    valueSamples.push(valueRaw);
    influenceSamples.push(influenceRaw);
  }

  if (effectVectors.length === 0 && statPower < 1 && attributePower < 1) {
    warnings.push("Item has almost no mechanical payload (stats/effects).");
  }
  if (basePrice > 0 && mean(valueSamples) < 20) {
    warnings.push("Price-to-impact ratio looks weak in current scenarios.");
  }
  notes.push("Item score blends combat value and economy contribution.");

  const avgCombat = mean(combatSamples);
  const avgValue = mean(valueSamples);
  const avgInfluence = mean(influenceSamples);
  const consistency = clamp(100 - (stdDev(combatSamples) / Math.max(1, avgCombat)) * 100, 0, 100);

  return {
    metrics: {
      power: score(avgCombat, 180),
      value: score(avgValue, 120),
      influence: score(avgInfluence, 90),
      dps: score(avgCombat * 0.45, 100),
      survivability: score((effectSustain + attributePower * 0.6) * 1.8, 100),
      control: score((effectControl + effectIds.length * 0.8) * 2.2, 100),
      economy: score((Math.log1p(basePrice) * 9 + effectEconomy * 0.8) * scenario.economyWeight, 100),
      consistency,
    },
    warnings,
    notes,
  };
}

function evaluateEffect(
  entity: Record<string, unknown>,
  scenario: SimulationScenario,
  runs: number,
  seed: number
): InternalSimulationResult {
  const warnings = collectGenericWarnings("effects", entity);
  const notes: string[] = [];
  const vector = deriveEffectVector(entity, scenario);
  const triggerCondition = toText(entity.trigger_condition, "None");
  const triggerRate = TRIGGER_RATE[triggerCondition] ?? 0.8;

  const powerSamples: number[] = [];
  const influenceSamples: number[] = [];
  const economySamples: number[] = [];

  for (let run = 0; run < runs; run += 1) {
    const rng = createRng(seed + run * 6151 + 43);
    const triggerVariance = 0.85 + rng() * 0.3;
    const estimatedProcs = scenario.turns * triggerRate * triggerVariance;
    const damage = vector.damage * estimatedProcs * vector.procChance;
    const control = vector.control * estimatedProcs * vector.procChance;
    const sustain = vector.sustain * estimatedProcs * vector.procChance;
    const economy = vector.economy * estimatedProcs * vector.procChance;
    powerSamples.push(damage + control * 0.75 + sustain * 0.5);
    influenceSamples.push(control + sustain * 0.45 + damage * 0.2);
    economySamples.push(economy + sustain * 0.25);
  }

  if (vector.procChance < 0.4) {
    warnings.push("Low proc chance leads to high variance. Consider fallback utility.");
  }
  notes.push("Effect simulation models expected proc impact over scenario turns.");

  const avgPower = mean(powerSamples);
  const avgInfluence = mean(influenceSamples);
  const avgEconomy = mean(economySamples);
  const consistency = clamp(100 - (stdDev(powerSamples) / Math.max(1, avgPower)) * 100, 0, 100);

  return {
    metrics: {
      power: score(avgPower, 170),
      value: score(avgPower * 0.55 + avgEconomy * 1.2, 130),
      influence: score(avgInfluence, 115),
      dps: score((vector.damage * triggerRate * scenario.turns) / Math.max(1, scenario.turns), 45),
      survivability: score((vector.sustain * triggerRate * scenario.turns) / Math.max(1, scenario.turns), 35),
      control: score((vector.control * triggerRate * scenario.turns) / Math.max(1, scenario.turns), 40),
      economy: score(avgEconomy * scenario.economyWeight, 85),
      consistency,
    },
    warnings,
    notes,
  };
}

function estimateCombatProfileThreat(
  profile: Record<string, unknown>,
  datasets: SimulationDatasets,
  scenario: SimulationScenario
): number {
  const customStats = asObjectArray(profile.custom_stats);
  const statThreat = customStats.reduce((acc, row) => acc + Math.max(0, num(row.value, 0)), 0);
  const abilitiesLookup = lookupById(datasets.abilities);
  const abilitiesThreat = asStringArray(profile.custom_abilities).reduce((acc, abilityId) => {
    const ability = abilitiesLookup.get(abilityId);
    if (!ability) return acc;
    return acc + estimateAbilityStaticImpact(ability, datasets, scenario);
  }, 0);
  const enemyTypeFactor = ENEMY_TYPE_MULTIPLIER[toText(profile.enemy_type, "other")] ?? 1;
  const aggressionFactor = AGGRESSION_MULTIPLIER[toText(profile.aggression, "Neutral")] ?? 1;
  return (statThreat * 1.2 + abilitiesThreat * 0.95) * enemyTypeFactor * aggressionFactor;
}

function evaluateCombatProfile(
  entity: Record<string, unknown>,
  datasets: SimulationDatasets,
  scenario: SimulationScenario,
  runs: number,
  seed: number
): InternalSimulationResult {
  const warnings = collectGenericWarnings("combat_profiles", entity);
  const notes: string[] = [];
  const baseThreat = estimateCombatProfileThreat(entity, datasets, scenario);
  const lootEntries = asObjectArray(entity.loot_table);
  const currencyRewards = asObjectArray(entity.currency_rewards);
  const repRewards = asObjectArray(entity.reputation_rewards);
  const xpReward = Math.max(0, num(entity.xp_reward, 0));

  const lootValue = lootEntries.reduce((acc, row) => {
    const dropChance = safeChancePercent(row.drop_chance, 100);
    return acc + dropChance * (10 + Math.max(0, num(row.amount, 1)) * 8);
  }, 0);
  const currencyValue = currencyRewards.reduce((acc, row) => {
    const dropChance = safeChancePercent(row.drop_chance, 100);
    return acc + dropChance * Math.max(0, num(row.amount, 0));
  }, 0);
  const reputationValue = repRewards.reduce((acc, row) => {
    const dropChance = safeChancePercent(row.drop_chance, 100);
    return acc + dropChance * Math.abs(num(row.amount, 0)) * 2;
  }, 0);

  const threatSamples: number[] = [];
  const valueSamples: number[] = [];

  for (let run = 0; run < runs; run += 1) {
    const rng = createRng(seed + run * 3253 + 59);
    const variance = 0.86 + rng() * 0.28;
    const threat = baseThreat * variance * scenario.pressure;
    const value = xpReward * 0.7 + lootValue * 1.1 + currencyValue * 0.45 + reputationValue * 0.9;
    threatSamples.push(threat);
    valueSamples.push(value);
  }

  if (baseThreat < 20) warnings.push("Threat is low for a combat profile. Check stats and ability links.");
  if (xpReward <= 0 && lootValue <= 0 && currencyValue <= 0) {
    warnings.push("Profile has almost no tangible rewards.");
  }
  notes.push("Threat uses custom stats, abilities, enemy type, and aggression.");

  const avgThreat = mean(threatSamples);
  const avgValue = mean(valueSamples);
  const consistency = clamp(100 - (stdDev(threatSamples) / Math.max(1, avgThreat)) * 100, 0, 100);

  return {
    metrics: {
      power: score(avgThreat, 210),
      value: score(avgValue, 140),
      influence: score(avgThreat * 0.45 + reputationValue * 0.7, 130),
      dps: score(avgThreat * 0.48, 100),
      survivability: score(avgThreat * 0.32, 100),
      control: score(avgThreat * 0.28, 100),
      economy: score((lootValue + currencyValue * 0.8 + xpReward * 0.5) * scenario.economyWeight, 120),
      consistency,
    },
    warnings,
    notes,
  };
}

function evaluateCharacter(
  entity: Record<string, unknown>,
  datasets: SimulationDatasets,
  scenario: SimulationScenario,
  runs: number,
  seed: number
): InternalSimulationResult {
  const warnings = collectGenericWarnings("characters", entity);
  const notes: string[] = [];
  const level = Math.max(0, num(entity.level, 1));
  const title = toText(entity.title).toLowerCase();
  const tags = asStringArray(entity.tags).map((tag) => tag.toLowerCase());
  const id = toText(entity.id);
  const profile = datasets.combat_profiles.find(
    (entry) => toText(entry.character_id) === id
  );
  const profileThreat = profile ? estimateCombatProfileThreat(profile, datasets, scenario) : 0;

  const roleMultiplier = title.includes("boss") || tags.some((tag) => tag.includes("boss"))
    ? 1.6
    : title.includes("elite")
      ? 1.3
      : 1;

  const powerSamples: number[] = [];
  const influenceSamples: number[] = [];

  for (let run = 0; run < runs; run += 1) {
    const rng = createRng(seed + run * 4721 + 73);
    const variance = 0.9 + rng() * 0.22;
    const levelPower = level * (2.4 + scenario.pressure * 0.9);
    const power = (levelPower + profileThreat * 0.85) * roleMultiplier * variance;
    const influence = (level * 1.3 + tags.length * 3 + (profile ? 14 : 0)) * variance;
    powerSamples.push(power);
    influenceSamples.push(influence);
  }

  if (!profile && level >= 10) {
    warnings.push("Character has no combat profile despite high level.");
  }
  notes.push("Character influence combines level, role tags, and linked combat profile.");

  const avgPower = mean(powerSamples);
  const avgInfluence = mean(influenceSamples);
  const consistency = clamp(100 - (stdDev(powerSamples) / Math.max(1, avgPower)) * 100, 0, 100);

  return {
    metrics: {
      power: score(avgPower, 200),
      value: score((avgPower * 0.48 + avgInfluence * 0.65) * 0.9, 160),
      influence: score(avgInfluence, 95),
      dps: score(avgPower * 0.35, 100),
      survivability: score(avgPower * 0.28, 100),
      control: score(avgInfluence * 0.85, 100),
      economy: score((tags.length * 8 + level * 1.2) * scenario.economyWeight, 100),
      consistency,
    },
    warnings,
    notes,
  };
}

function estimateCharacterThreat(
  characterId: string,
  datasets: SimulationDatasets,
  scenario: SimulationScenario
): number {
  const character = datasets.characters.find((entry) => toText(entry.id) === characterId);
  if (!character) return 10;
  const level = Math.max(1, num(character.level, 1));
  const profile = datasets.combat_profiles.find(
    (entry) => toText(entry.character_id) === characterId
  );
  const profileThreat = profile ? estimateCombatProfileThreat(profile, datasets, scenario) : 0;
  return level * 2.2 + profileThreat * 0.72;
}

function evaluateEncounter(
  entity: Record<string, unknown>,
  datasets: SimulationDatasets,
  scenario: SimulationScenario,
  runs: number,
  seed: number
): InternalSimulationResult {
  const warnings = collectGenericWarnings("encounters", entity);
  const notes: string[] = [];
  const participants = asObjectArray(entity.participants);
  const encounterType = toText(entity.encounter_type, "Combat");
  const rewards = asObject(entity.rewards);
  const rewardItems = asObjectArray(rewards.items);
  const rewardCurrencies = asObjectArray(rewards.currencies);
  const rewardReputation = asObjectArray(rewards.reputation);
  const flagsSet = asStringArray(rewards.flags_set);
  const xp = Math.max(0, num(rewards.xp, 0));

  const hostileThreat = participants.reduce((acc, participant) => {
    const side = toText(participant.combat_side, "Neutral");
    const sideFactor = side === "Hostile" ? 1.2 : side === "Friendly" ? 0.8 : 1;
    const charId = toText(participant.character_id);
    return acc + estimateCharacterThreat(charId, datasets, scenario) * sideFactor;
  }, 0);

  const rewardValue = rewardItems.reduce(
    (acc, row) => acc + Math.max(1, num(row.quantity, 1)) * 16,
    0
  ) + rewardCurrencies.reduce(
    (acc, row) => acc + Math.max(0, num(row.amount, 0)) * 0.5,
    0
  ) + rewardReputation.reduce(
    (acc, row) => acc + Math.abs(num(row.amount, 0)) * 4,
    0
  ) + xp * 0.7;

  const typeFactor = encounterType === "Combat" ? 1.2 : encounterType === "Dialogue" ? 0.8 : 0.9;

  const threatSamples: number[] = [];
  const valueSamples: number[] = [];

  for (let run = 0; run < runs; run += 1) {
    const rng = createRng(seed + run * 2371 + 101);
    const variance = 0.88 + rng() * 0.26;
    threatSamples.push(hostileThreat * typeFactor * variance);
    valueSamples.push(rewardValue * (0.92 + rng() * 0.16));
  }

  if (participants.length < 2 && encounterType === "Combat") {
    warnings.push("Combat encounter has very few participants.");
  }
  if (rewardValue < 5) {
    warnings.push("Encounter rewards are low for the estimated effort.");
  }
  if (flagsSet.length > 0) {
    notes.push("Encounter modifies progression flags, increasing narrative influence.");
  }

  const avgThreat = mean(threatSamples);
  const avgValue = mean(valueSamples);
  const consistency = clamp(100 - (stdDev(threatSamples) / Math.max(1, avgThreat)) * 100, 0, 100);

  return {
    metrics: {
      power: score(avgThreat, 260),
      value: score(avgValue, 170),
      influence: score(avgThreat * 0.35 + participants.length * 9 + flagsSet.length * 14, 150),
      dps: score(avgThreat * 0.22, 100),
      survivability: score(avgThreat * 0.18, 100),
      control: score(participants.length * 12 * scenario.controlWeight, 100),
      economy: score(avgValue * scenario.economyWeight, 130),
      consistency,
    },
    warnings,
    notes,
  };
}

function evaluateEntityInternal(
  options: SimulationRunOptions
): InternalSimulationResult {
  const boundedRuns = clamp(Math.round(options.runs), 50, 2000);
  const boundedSeed = Math.abs(Math.floor(options.seed)) || 1;

  switch (options.schemaName) {
    case "abilities":
      return evaluateAbility(options.entity, options.datasets, options.scenario, boundedRuns, boundedSeed);
    case "items":
      return evaluateItem(options.entity, options.datasets, options.scenario, boundedRuns, boundedSeed);
    case "effects":
      return evaluateEffect(options.entity, options.scenario, boundedRuns, boundedSeed);
    case "combat_profiles":
      return evaluateCombatProfile(options.entity, options.datasets, options.scenario, boundedRuns, boundedSeed);
    case "characters":
      return evaluateCharacter(options.entity, options.datasets, options.scenario, boundedRuns, boundedSeed);
    case "encounters":
      return evaluateEncounter(options.entity, options.datasets, options.scenario, boundedRuns, boundedSeed);
    default: {
      const neverSchema: never = options.schemaName;
      throw new Error(`Unsupported simulation schema: ${String(neverSchema)}`);
    }
  }
}

export function simulateEntity(options: SimulationRunOptions): SimulationResult {
  const boundedRuns = clamp(Math.round(options.runs), 50, 2000);
  const { metrics, warnings, notes } = evaluateEntityInternal({
    ...options,
    runs: boundedRuns,
  });
  const fallbackLabel = `${options.schemaName} draft`;
  return {
    schemaName: options.schemaName,
    entityId: getEntityId(options.entity),
    entityLabel: getEntityLabel(options.entity, fallbackLabel),
    scenarioId: options.scenario.id,
    runs: boundedRuns,
    metrics,
    warnings,
    notes,
  };
}

export function isMeaningfulEntity(entity: Record<string, unknown>): boolean {
  return Object.keys(entity).length > 0;
}

export function getSimulationSummary(metrics: SimulationMetrics): string {
  const top = [
    { key: "power", value: metrics.power, label: "Power" },
    { key: "value", value: metrics.value, label: "Value" },
    { key: "influence", value: metrics.influence, label: "Influence" },
  ].sort((a, b) => b.value - a.value)[0];
  if (top.value >= 75) return `Strong ${top.label.toLowerCase()} profile in current scenario.`;
  if (top.value >= 45) return `Balanced profile with moderate ${top.label.toLowerCase()}.`;
  return `Under-tuned profile. Primary bottleneck appears in ${top.label.toLowerCase()}.`;
}
