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
}

export interface DependencyGateStatus {
  id: string;
  requirement: DependencyNode;
  content: DependencyNode;
  requiredFlags: string[];
  forbiddenFlags: string[];
  missingRequiredFlags: string[];
  presentForbiddenFlags: string[];
  open: boolean;
}

export interface DependencyWalkthroughStep {
  id: string;
  title: string;
  trigger?: DependencyWalkthroughTrigger;
  flagsBefore: string[];
  flagsGained: string[];
  flagsAfter: string[];
  openGates: DependencyGateStatus[];
  newlyOpenGates: DependencyGateStatus[];
  blockedGates: DependencyGateStatus[];
}

export interface DependencyWalkthroughModel {
  flags: DependencyNode[];
  triggers: DependencyWalkthroughTrigger[];
  steps: DependencyWalkthroughStep[];
  finalFlags: string[];
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

function gateStatuses(nodesById: Map<string, DependencyNode>, edges: EntryRecord[], flags: Set<string>): DependencyGateStatus[] {
  const requiredByRequirement = new Map<string, Set<string>>();
  const forbiddenByRequirement = new Map<string, Set<string>>();
  const gatedContentByRequirement = new Map<string, Set<string>>();

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
      return [{
        id: `${requirementId}>gates>${contentId}`,
        requirement,
        content,
        requiredFlags,
        forbiddenFlags,
        missingRequiredFlags,
        presentForbiddenFlags,
        open: missingRequiredFlags.length === 0 && presentForbiddenFlags.length === 0,
      }];
    });
  }).sort((left, right) => compareLabel(left.content, right.content));
}

export function buildDependencyWalkthrough(index: EntryRecord, initialFlags: string[], triggerIds: string[]): DependencyWalkthroughModel {
  const nodes = rows(index.nodes).map(dependencyNode).filter((node) => node.id);
  const edges = rows(index.edges);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const flags = nodes.filter((node) => node.kind === "flag").sort(compareLabel);
  const setsBySource = new Map<string, Set<string>>();

  edges.forEach((edge) => {
    if (text(edge.relation) !== "sets") return;
    const source = text(edge.source);
    const target = text(edge.target);
    if (!nodesById.has(source) || !nodesById.has(target)) return;
    if (!setsBySource.has(source)) setsBySource.set(source, new Set());
    setsBySource.get(source)?.add(target);
  });

  const triggers = [...setsBySource.entries()]
    .map(([sourceId, sourceFlags]) => {
      const node = nodesById.get(sourceId);
      if (!node) return null;
      return {
        id: sourceId,
        label: node.label,
        node,
        flagsSet: [...sourceFlags].sort(),
      } satisfies DependencyWalkthroughTrigger;
    })
    .filter((trigger): trigger is DependencyWalkthroughTrigger => Boolean(trigger))
    .sort(compareLabel);
  const triggerById = new Map(triggers.map((trigger) => [trigger.id, trigger]));
  const activeFlags = new Set(initialFlags.filter((flag) => nodesById.get(flag)?.kind === "flag"));
  let previousOpenGateIds = new Set<string>();
  const steps: DependencyWalkthroughStep[] = [];

  const appendStep = (id: string, title: string, trigger: DependencyWalkthroughTrigger | undefined, flagsBefore: string[], flagsGained: string[]) => {
    const gates = gateStatuses(nodesById, edges, activeFlags);
    const openGates = gates.filter((gate) => gate.open);
    const newlyOpenGates = openGates.filter((gate) => !previousOpenGateIds.has(gate.id));
    steps.push({
      id,
      title,
      trigger,
      flagsBefore,
      flagsGained,
      flagsAfter: [...activeFlags],
      openGates,
      newlyOpenGates,
      blockedGates: gates.filter((gate) => !gate.open),
    });
    previousOpenGateIds = new Set(openGates.map((gate) => gate.id));
  };

  appendStep("initial", "Initial State", undefined, [], []);

  triggerIds.forEach((triggerId, index) => {
    const trigger = triggerById.get(triggerId);
    if (!trigger) return;
    const before = [...activeFlags];
    const gained = trigger.flagsSet.filter((flag) => !activeFlags.has(flag));
    trigger.flagsSet.forEach((flag) => activeFlags.add(flag));
    appendStep(`trigger-${index}-${trigger.id}`, trigger.label, trigger, before, gained);
  });

  const gates = gateStatuses(nodesById, edges, activeFlags);
  return { flags, triggers, steps, finalFlags: [...activeFlags], gates };
}
