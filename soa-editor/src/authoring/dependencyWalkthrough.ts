import type { EntryRecord } from "../types/editorQol";

export interface DependencyNode {
  id: string;
  kind: string;
  entryId: string;
  label: string;
  schemaName: string;
}

export interface DependencyWalkthroughTrigger {
  id: string;
  label: string;
  node: DependencyNode;
  flagsSet: string[];
  reputationChanges: DependencyReputationChange[];
}

export interface DependencyReputationChange {
  factionId: string;
  label: string;
  amount: number;
}

export interface DependencyReputationGate {
  factionId: string;
  label: string;
  minimum: number;
  current: number;
  met: boolean;
}

export interface DependencyGateStatus {
  id: string;
  requirement: DependencyNode;
  content: DependencyNode;
  requiredFlags: string[];
  forbiddenFlags: string[];
  missingRequiredFlags: string[];
  presentForbiddenFlags: string[];
  reputationGates: DependencyReputationGate[];
  open: boolean;
}

export interface DependencyWalkthroughStep {
  id: string;
  title: string;
  trigger?: DependencyWalkthroughTrigger;
  flagsBefore: string[];
  flagsGained: string[];
  flagsAfter: string[];
  reputationBefore: Record<string, number>;
  reputationGained: DependencyReputationChange[];
  reputationAfter: Record<string, number>;
  openGates: DependencyGateStatus[];
  newlyOpenGates: DependencyGateStatus[];
  blockedGates: DependencyGateStatus[];
}

export interface DependencyWalkthroughModel {
  flags: DependencyNode[];
  reputations: DependencyNode[];
  triggers: DependencyWalkthroughTrigger[];
  steps: DependencyWalkthroughStep[];
  finalFlags: string[];
  finalReputation: Record<string, number>;
  gates: DependencyGateStatus[];
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function rows(value: unknown): EntryRecord[] {
  return Array.isArray(value)
    ? value.filter((row): row is EntryRecord => typeof row === "object" && row !== null && !Array.isArray(row))
    : [];
}

function dependencyNode(row: EntryRecord): DependencyNode {
  return {
    id: text(row.id),
    kind: text(row.kind),
    entryId: text(row.entry_id),
    label: text(row.label) || text(row.entry_id) || text(row.id),
    schemaName: text(row.schema_name),
  };
}

function compareLabel(left: { label: string; id: string }, right: { label: string; id: string }): number {
  return left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
}

function numberValue(value: unknown): number {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : 0;
}

function metadata(edge: EntryRecord): EntryRecord {
  return typeof edge.metadata === "object" && edge.metadata !== null && !Array.isArray(edge.metadata) ? edge.metadata as EntryRecord : {};
}

function gateStatuses(nodesById: Map<string, DependencyNode>, edges: EntryRecord[], flags: Set<string>, reputation: Record<string, number>): DependencyGateStatus[] {
  const requiredByRequirement = new Map<string, Set<string>>();
  const forbiddenByRequirement = new Map<string, Set<string>>();
  const gatedContentByRequirement = new Map<string, Set<string>>();
  const reputationByRequirement = new Map<string, DependencyReputationGate[]>();

  edges.forEach((edge) => {
    const relation = text(edge.relation);
    const source = text(edge.source);
    const target = text(edge.target);
    if (relation === "required_by") {
      if (!requiredByRequirement.has(target)) requiredByRequirement.set(target, new Set());
      requiredByRequirement.get(target)?.add(source);
    }
    if (relation === "forbidden_by") {
      if (!forbiddenByRequirement.has(target)) forbiddenByRequirement.set(target, new Set());
      forbiddenByRequirement.get(target)?.add(source);
    }
    if (relation === "gates") {
      if (!gatedContentByRequirement.has(source)) gatedContentByRequirement.set(source, new Set());
      gatedContentByRequirement.get(source)?.add(target);
    }
    if (relation === "reputation_required_by") {
      const details = metadata(edge);
      const reputationNode = nodesById.get(source);
      const factionId = text(details.faction_id) || reputationNode?.entryId || source;
      const minimum = numberValue(details.minimum);
      const current = numberValue(reputation[factionId]);
      reputationByRequirement.set(target, [...(reputationByRequirement.get(target) || []), {
        factionId,
        label: reputationNode?.label || factionId,
        minimum,
        current,
        met: current >= minimum,
      }]);
    }
  });

  return [...gatedContentByRequirement.entries()].flatMap(([requirementId, contentIds]) => {
    const requirement = nodesById.get(requirementId);
    if (!requirement) return [];
    const requiredFlags = [...(requiredByRequirement.get(requirementId) ?? new Set())].sort();
    const forbiddenFlags = [...(forbiddenByRequirement.get(requirementId) ?? new Set())].sort();
    return [...contentIds].flatMap((contentId) => {
      const content = nodesById.get(contentId);
      if (!content) return [];
      const missingRequiredFlags = requiredFlags.filter((flag) => !flags.has(flag));
      const presentForbiddenFlags = forbiddenFlags.filter((flag) => flags.has(flag));
      const reputationGates = reputationByRequirement.get(requirementId) || [];
      return [{
        id: `${requirementId}>gates>${contentId}`,
        requirement,
        content,
        requiredFlags,
        forbiddenFlags,
        missingRequiredFlags,
        presentForbiddenFlags,
        reputationGates,
        open: missingRequiredFlags.length === 0 && presentForbiddenFlags.length === 0 && reputationGates.every((gate) => gate.met),
      }];
    });
  }).sort((left, right) => compareLabel(left.content, right.content));
}

export function buildDependencyWalkthrough(index: EntryRecord, initialFlags: string[], triggerIds: string[], initialReputation: Record<string, number> = {}): DependencyWalkthroughModel {
  const nodes = rows(index.nodes).map(dependencyNode).filter((node) => node.id);
  const edges = rows(index.edges);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const flags = nodes.filter((node) => node.kind === "flag").sort(compareLabel);
  const reputations = nodes.filter((node) => node.kind === "faction_reputation").sort(compareLabel);
  const setsBySource = new Map<string, Set<string>>();
  const reputationBySource = new Map<string, DependencyReputationChange[]>();

  edges.forEach((edge) => {
    const source = text(edge.source);
    const target = text(edge.target);
    if (!nodesById.has(source) || !nodesById.has(target)) return;
    if (text(edge.relation) === "sets") {
      if (!setsBySource.has(source)) setsBySource.set(source, new Set());
      setsBySource.get(source)?.add(target);
    }
    if (text(edge.relation) === "grants_reputation") {
      const details = metadata(edge);
      const targetNode = nodesById.get(target);
      const factionId = text(details.faction_id) || targetNode?.entryId || target;
      reputationBySource.set(source, [...(reputationBySource.get(source) || []), {
        factionId,
        label: targetNode?.label || factionId,
        amount: numberValue(details.amount),
      }]);
    }
  });

  const sourceIds = new Set([...setsBySource.keys(), ...reputationBySource.keys()]);
  const triggers = [...sourceIds]
    .map((sourceId) => {
      const node = nodesById.get(sourceId);
      if (!node) return null;
      return {
        id: sourceId,
        label: node.label,
        node,
        flagsSet: [...(setsBySource.get(sourceId) || [])].sort(),
        reputationChanges: reputationBySource.get(sourceId) || [],
      } satisfies DependencyWalkthroughTrigger;
    })
    .filter((trigger): trigger is DependencyWalkthroughTrigger => Boolean(trigger))
    .sort(compareLabel);
  const triggerById = new Map(triggers.map((trigger) => [trigger.id, trigger]));
  const activeFlags = new Set(initialFlags.filter((flag) => nodesById.get(flag)?.kind === "flag"));
  const activeReputation = Object.fromEntries(Object.entries(initialReputation).map(([id, value]) => [id, numberValue(value)]));
  let previousOpenGateIds = new Set<string>();
  const steps: DependencyWalkthroughStep[] = [];

  const appendStep = (id: string, title: string, trigger: DependencyWalkthroughTrigger | undefined, flagsBefore: string[], flagsGained: string[], reputationBefore: Record<string, number>, reputationGained: DependencyReputationChange[]) => {
    const gates = gateStatuses(nodesById, edges, activeFlags, activeReputation);
    const openGates = gates.filter((gate) => gate.open);
    const newlyOpenGates = openGates.filter((gate) => !previousOpenGateIds.has(gate.id));
    steps.push({
      id,
      title,
      trigger,
      flagsBefore,
      flagsGained,
      flagsAfter: [...activeFlags],
      reputationBefore,
      reputationGained,
      reputationAfter: { ...activeReputation },
      openGates,
      newlyOpenGates,
      blockedGates: gates.filter((gate) => !gate.open),
    });
    previousOpenGateIds = new Set(openGates.map((gate) => gate.id));
  };

  appendStep("initial", "Initial State", undefined, [], [], { ...activeReputation }, []);

  triggerIds.forEach((triggerId, index) => {
    const trigger = triggerById.get(triggerId);
    if (!trigger) return;
    const before = [...activeFlags];
    const gained = trigger.flagsSet.filter((flag) => !activeFlags.has(flag));
    const reputationBefore = { ...activeReputation };
    trigger.flagsSet.forEach((flag) => activeFlags.add(flag));
    trigger.reputationChanges.forEach((change) => { activeReputation[change.factionId] = numberValue(activeReputation[change.factionId]) + change.amount; });
    appendStep(`trigger-${index}-${trigger.id}`, trigger.label, trigger, before, gained, reputationBefore, trigger.reputationChanges);
  });

  const gates = gateStatuses(nodesById, edges, activeFlags, activeReputation);
  return { flags, reputations, triggers, steps, finalFlags: [...activeFlags], finalReputation: { ...activeReputation }, gates };
}

export function buildReachableTriggerSequence(index: EntryRecord, initialFlags: string[] = [], initialReputation: Record<string, number> = {}): string[] {
  const sequence: string[] = [];
  while (true) {
    const model = buildDependencyWalkthrough(index, initialFlags, sequence, initialReputation);
    const next = model.triggers.find((trigger) => {
      if (sequence.includes(trigger.id)) return false;
      const sourceGates = model.gates.filter((gate) => gate.content.id === trigger.id);
      return sourceGates.length === 0 || sourceGates.every((gate) => gate.open);
    });
    if (!next) return sequence;
    sequence.push(next.id);
  }
}
