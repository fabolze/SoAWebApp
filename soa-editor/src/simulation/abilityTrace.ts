import type {
  AbilityTrace,
  AbilityTraceEvent,
  EffectContribution,
  SimulationDatasets,
  SimulationScenario,
} from "./types";

type Row = Record<string, unknown>;

interface TraceOptions {
  ability: Row;
  datasets: SimulationDatasets;
  scenario: SimulationScenario;
  seed: number;
  casterProfile?: Row | null;
  targetProfile?: Row | null;
}

interface ActiveStatus {
  statusId: string;
  expires: number[];
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((entry): entry is Row => !!entry && typeof entry === "object" && !Array.isArray(entry)) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function rng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function targetCount(ability: Row, scenario: SimulationScenario): number {
  const targeting = text(ability.targeting, "Single");
  const broad = ["Area", "Allies", "Enemies"].includes(targeting);
  const desired = broad ? Math.max(1, scenario.targetCount) : 1;
  const cap = number(ability.max_targets, 0);
  return cap > 0 ? Math.min(desired, cap) : desired;
}

function effectLinks(ability: Row): Row[] {
  const links = rows(ability.effect_links);
  if (links.length > 0) return links;
  return strings(ability.effects).map((effectId, index) => ({
    effect_id: effectId,
    phase: "Impact",
    turn_offset: 0,
    sort_order: index,
  }));
}

function statusRule(status: Row | undefined, profile: Row | null | undefined): Row | undefined {
  if (!status || !profile) return undefined;
  const rules = rows(profile.status_rules);
  return rules.find((rule) => text(rule.status_id) === text(status.id))
    || rules.find((rule) => text(rule.category) === text(status.category))
    || rules.find((rule) => text(rule.polarity) === text(status.polarity));
}

function statusMatches(status: Row, filter: Row): boolean {
  const ids = strings(filter.status_ids);
  const categories = strings(filter.categories);
  const polarities = strings(filter.polarities);
  return (ids.length === 0 || ids.includes(text(status.id)))
    && (categories.length === 0 || categories.includes(text(status.category)))
    && (polarities.length === 0 || polarities.includes(text(status.polarity)));
}

export function simulateAbilityTrace(options: TraceOptions): AbilityTrace {
  const { ability, datasets, scenario, targetProfile, casterProfile } = options;
  const random = rng(options.seed);
  const effects = new Map(datasets.effects.map((entry) => [text(entry.id), entry]));
  const statuses = new Map(datasets.statuses.map((entry) => [text(entry.id), entry]));
  const links = effectLinks(ability).sort((a, b) => number(a.sort_order) - number(b.sort_order));
  const count = targetCount(ability, scenario);
  const targetIds = Array.from({ length: count }, (_, index) => `target-${index + 1}`);
  const events: AbilityTraceEvent[] = [];
  const contributionMap = new Map<string, EffectContribution>();
  const active = new Map<string, Map<string, ActiveStatus>>();
  const immunity = new Map<string, Map<string, number>>();
  targetIds.forEach((id) => {
    active.set(id, new Map());
    immunity.set(id, new Map());
  });
  const initialResource = scenario.resourceBudget;
  let resource = initialResource;
  let nextReady = 0;
  let casts = 0;
  let toggleActive = false;
  const type = text(ability.type, "Active");
  const cost = Math.max(0, number(ability.resource_cost));
  const upkeep = Math.max(0, number(ability.upkeep_cost));
  const cooldown = Math.max(0, number(ability.cooldown));
  const castTime = Math.max(0, number(ability.cast_time));
  const recovery = Math.max(0, number(ability.recovery_time));
  const casterStats = new Map(rows(casterProfile?.custom_stats).map((entry) => [text(entry.stat_id), number(entry.value)]));
  const scalingBonus = rows(ability.scaling).reduce((sum, entry) => {
    const statValue = casterStats.get(text(entry.stat_id)) ?? scenario.statBudget * 10;
    return sum + statValue * number(entry.multiplier);
  }, 0);

  const addEvent = (event: AbilityTraceEvent) => events.push(event);
  const targetsForEffect = (effect: Row): string[] => {
    const target = text(effect.target, "Enemy");
    return target === "Self" ? ["caster"] : targetIds;
  };
  const contribution = (effect: Row): EffectContribution => {
    const id = text(effect.id);
    const existing = contributionMap.get(id);
    if (existing) return existing;
    const next = { effectId: id, label: text(effect.name, id), damage: 0, control: 0, sustain: 0, applications: 0, affectedTargets: 0 };
    contributionMap.set(id, next);
    return next;
  };

  const executeEffect = (turn: number, link: Row) => {
    const effect = effects.get(text(link.effect_id));
    if (!effect) return;
    const targets = targetsForEffect(effect);
    const amount = Math.abs(number(effect.value, 0) + scalingBonus + number(effect.scaling_multiplier, 0) * (casterStats.get(text(effect.scaling_stat_id)) ?? scenario.statBudget * 10));
    const item = contribution(effect);
    item.applications += 1;
    item.affectedTargets += targets.length;
    if (["Damage", "Reflect"].includes(text(effect.type))) item.damage += amount * targets.length;
    if (["Control"].includes(text(effect.type))) item.control += Math.max(1, number(effect.duration, 1)) * targets.length;
    if (["Heal", "Shield"].includes(text(effect.type))) item.sustain += amount * targets.length;
    addEvent({ turn, kind: "effect", label: text(effect.name, "Effect"), effectId: text(effect.id), targetIds: targets, amount });
    if (text(effect.type) !== "Status") return;

    const operation = text(effect.status_operation, "Apply");
    if (operation === "Remove") {
      const filter = (effect.status_filter && typeof effect.status_filter === "object" ? effect.status_filter : {}) as Row;
      targets.forEach((targetId) => {
        const states = active.get(targetId);
        if (!states) return;
        const removable = Array.from(states.values()).filter((state) => {
          const status = statuses.get(state.statusId);
          if (!status || !statusMatches(status, filter)) return false;
          const allied = ["Self", "Ally", "All"].includes(text(effect.target));
          return allied ? status.can_cleanse !== false : status.can_dispel !== false;
        }).slice(0, Math.max(1, number(filter.max_count, Number.MAX_SAFE_INTEGER)));
        removable.forEach((state) => {
          states.delete(state.statusId);
          addEvent({ turn, kind: "status_remove", label: `Removed ${text(statuses.get(state.statusId)?.name, state.statusId)}`, effectId: text(effect.id), statusId: state.statusId, targetIds: [targetId] });
        });
      });
      return;
    }

    const statusId = text(effect.status_id);
    const status = statuses.get(statusId);
    if (!status) return;
    const filter = operation === "GrantImmunity"
      ? ((effect.status_filter && typeof effect.status_filter === "object" ? effect.status_filter : {}) as Row)
      : {};
    targets.forEach((targetId) => {
      if (operation === "GrantImmunity") {
        const duration = Math.max(1, number(effect.duration, 1));
        immunity.get(targetId)?.set(JSON.stringify(filter), turn + duration);
        addEvent({ turn, kind: "status_immune", label: "Temporary immunity granted", effectId: text(effect.id), targetIds: [targetId], detail: `Until turn ${turn + duration}` });
        return;
      }
      const profileRule = statusRule(status, targetProfile);
      const temporaryImmune = Array.from(immunity.get(targetId)?.entries() || []).some(([raw, expires]) => expires > turn && statusMatches(status, JSON.parse(raw) as Row));
      if (temporaryImmune || profileRule?.immune === true) {
        addEvent({ turn, kind: "status_immune", label: `${text(status.name, statusId)} resisted`, effectId: text(effect.id), statusId, targetIds: [targetId] });
        return;
      }
      const chance = Math.min(1, Math.max(0, number(effect.apply_chance, 100) / 100 * number(profileRule?.chance_multiplier, 1)));
      if (random() > chance) return;
      const duration = Math.max(1, number(effect.duration, number(status.default_duration, 1)) * number(profileRule?.duration_multiplier, 1));
      const states = active.get(targetId);
      if (!states) return;
      const current = states.get(statusId);
      const policy = text(status.reapplication_policy, "RefreshDuration");
      if (!current) {
        states.set(statusId, { statusId, expires: [turn + duration] });
        addEvent({ turn, kind: "status_apply", label: text(status.name, statusId), effectId: text(effect.id), statusId, targetIds: [targetId], detail: `Until turn ${turn + duration}` });
      } else if (policy !== "Ignore") {
        const maxStacks = Math.max(1, number(status.max_stacks, 1));
        if (policy === "AddIndependentStack") current.expires = [...current.expires, turn + duration].slice(-maxStacks);
        else if (policy === "AddStackRefresh") current.expires = Array.from({ length: Math.min(maxStacks, current.expires.length + 1) }, () => turn + duration);
        else current.expires = [turn + duration];
        addEvent({ turn, kind: "status_stack", label: `${text(status.name, statusId)} x${current.expires.length}`, effectId: text(effect.id), statusId, targetIds: [targetId] });
      }
    });
  };

  for (let turn = 0; turn < scenario.turns; turn += 1) {
    active.forEach((states, targetId) => states.forEach((state, statusId) => {
      const remaining = state.expires.filter((expires) => expires > turn);
      if (remaining.length === 0) {
        states.delete(statusId);
        addEvent({ turn, kind: "status_expire", label: `${text(statuses.get(statusId)?.name, statusId)} expired`, statusId, targetIds: [targetId] });
      } else {
        state.expires = remaining;
      }
    }));

    if (type === "Toggle" && toggleActive) {
      if (resource < upkeep) {
        toggleActive = false;
        addEvent({ turn, kind: "deactivate", label: "Toggle deactivated", detail: "Insufficient resource" });
        links.filter((link) => text(link.phase) === "Deactivate").forEach((link) => executeEffect(turn + number(link.turn_offset), link));
        nextReady = turn + cooldown;
      } else {
        resource -= upkeep;
        addEvent({ turn, kind: "resource", label: "Toggle upkeep", amount: -upkeep, detail: `${resource} remaining` });
        links.filter((link) => text(link.phase) === "WhileActive").forEach((link) => executeEffect(turn + number(link.turn_offset), link));
      }
      continue;
    }
    if (turn < nextReady || resource < cost) continue;
    resource -= cost;
    casts += 1;
    toggleActive = type === "Toggle";
    const impactTurn = turn + castTime;
    addEvent({ turn, kind: "activate", label: `${text(ability.name, "Ability")} activated`, amount: -cost });
    if (cost > 0) addEvent({ turn, kind: "resource", label: "Activation cost", amount: -cost, detail: `${resource} remaining` });
    links.filter((link) => text(link.phase, "Impact") !== "WhileActive" && text(link.phase) !== "Deactivate").forEach((link) => {
      const phase = text(link.phase, "Impact");
      const base = phase === "Cast" ? turn : phase === "Aftermath" ? impactTurn + recovery : impactTurn;
      executeEffect(base + number(link.turn_offset), link);
    });
    addEvent({ turn: impactTurn, kind: "impact", label: `${text(ability.name, "Ability")} impact`, targetIds });
    nextReady = type === "Passive" ? impactTurn + cooldown : impactTurn + cooldown + recovery;
    if (type === "Toggle") nextReady = scenario.turns + 1;
    else addEvent({ turn: nextReady, kind: "cooldown", label: "Ready again" });
  }

  return {
    turns: scenario.turns,
    targetCount: count,
    targetIds,
    initialResource,
    finalResource: resource,
    casts,
    events: events.sort((a, b) => a.turn - b.turn),
    contributions: Array.from(contributionMap.values()),
    assumptions: [
      "Abstract-turn authoring estimator; not authoritative runtime combat.",
      "Abilities activate whenever ready and affordable.",
      "Area and group targeting use scenario target count.",
      casterProfile ? "Scaling uses the selected caster profile's custom stats." : "Scaling uses scenario-budget fallback stats.",
    ],
  };
}
