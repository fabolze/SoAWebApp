import { generateUlid } from "../utils/generateId";

export const CREATION_FLOW_FORMAT = "SOA-CREATION-FLOW/1" as const;

export type CreationFlowRefKind =
  | "dialogue" | "dialogue_node" | "dialogue_choice" | "encounter"
  | "quest" | "quest_objective" | "event" | "shop" | "location"
  | "location_poi" | "location_route" | "story_beat" | "item"
  | "character" | "faction" | "lore_entry" | "creature" | "effect"
  | "status" | "currency" | "stat" | "flow_step" | "custom";

export type CreationFlowStepKind =
  | "unshaped" | "dialogue" | "encounter" | "item_reward" | "numeric_reward"
  | "lore_reveal" | "teleport" | "scripted_moment" | "open_shop"
  | "make_available" | "quest_assignment" | "quest_turn_in"
  | "inventory_objective" | "join_companion" | "persistent_fact"
  | "activate_location_variant" | "activate_character_variant"
  | "activate_item_variant" | "world_state" | "gameplay_effect"
  | "story_placement" | "note" | "custom";

export type CreationFlowShape = "sequence" | "constellation" | "hybrid";
export type CreationFlowSupport = "unshaped" | "unresolved" | "compilable" | "story_only" | "unsupported" | "runtime_unverified";

export interface CreationFlowRef {
  kind: CreationFlowRefKind;
  canonicalId?: string;
  draftId?: string;
  label?: string;
}

export interface CreationFlowOrigin {
  ref: CreationFlowRef;
  subRef?: CreationFlowRef;
}

export interface CreationFlowStep {
  id: string;
  kind: CreationFlowStepKind;
  text: string;
  target?: CreationFlowRef;
  timing?: "immediate" | "after_completion" | "available_later" | "story_only";
  persistence?: "none" | "session" | "permanent";
  repeatPolicy?: "unspecified" | "inherit_owner" | "repeatable" | "one_shot";
  payload?: Record<string, unknown>;
  targetResolution: "none" | "unresolved" | "placeholder" | "canonical";
  support: CreationFlowSupport;
  supportReason?: string;
}

export interface CreationFlowTransition {
  id: string;
  fromStepId: string;
  toStepId: string;
  trigger: "complete" | "dialogue_choice" | "victory" | "interaction_closed" | "condition" | "fallback";
  sourceRefId?: string;
  requirementId?: string;
  sortOrder: number;
}

export interface CreationFlowRelation {
  id: string;
  fromStepId: string;
  toStepId: string;
  relation: string;
  resolution: "local_intent" | "canonical" | "unsupported";
}

export interface CreationFlowPlaceholder {
  id: string;
  kind: string;
  label: string;
  direction?: string;
  owningWorkspace?: string;
  promotedCanonicalId?: string;
}

export interface CreationFlowMention {
  id: string;
  ideaId: string;
  noteId: string;
  start: number;
  end: number;
  quotedText: string;
}

export interface CreationFlowReturnFrame {
  workspace: string;
  context?: CreationFlowRef;
  selectedId?: string;
  localViewState?: Record<string, unknown>;
}

export interface CreationFlowDraft {
  format: typeof CREATION_FLOW_FORMAT;
  id: string;
  revision: number;
  title: string;
  shape: CreationFlowShape;
  origin?: CreationFlowOrigin;
  returnStack: CreationFlowReturnFrame[];
  entryStepId?: string;
  steps: CreationFlowStep[];
  transitions: CreationFlowTransition[];
  relations: CreationFlowRelation[];
  placeholders: CreationFlowPlaceholder[];
  mentions: CreationFlowMention[];
  localNotes: Array<{ id: string; text: string }>;
  artifactIds: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface CreationFlowIssue {
  severity: "blocker" | "warning";
  path: string;
  message: string;
}

export class CreationFlowFormatError extends Error {}

const STEP_KINDS = new Set<CreationFlowStepKind>([
  "unshaped", "dialogue", "encounter", "item_reward", "numeric_reward", "lore_reveal", "teleport",
  "scripted_moment", "open_shop", "make_available", "quest_assignment", "quest_turn_in",
  "inventory_objective", "join_companion", "persistent_fact", "activate_location_variant",
  "activate_character_variant", "activate_item_variant", "world_state", "gameplay_effect",
  "story_placement", "note", "custom",
]);

const CURRENT_RECORD_KINDS = new Set<CreationFlowStepKind>([
  "dialogue", "encounter", "item_reward", "numeric_reward", "lore_reveal", "teleport",
  "scripted_moment", "make_available", "persistent_fact", "story_placement",
]);

const NEW_CONTRACT_KINDS = new Set<CreationFlowStepKind>([
  "open_shop", "quest_assignment", "quest_turn_in", "inventory_objective", "join_companion",
  "activate_location_variant", "activate_character_variant", "activate_item_variant", "world_state", "gameplay_effect",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeRef(value: unknown): CreationFlowRef | undefined {
  if (!isRecord(value)) return undefined;
  const kind = stringValue(value.kind, "custom") as CreationFlowRefKind;
  const canonicalId = stringValue(value.canonicalId);
  const draftId = stringValue(value.draftId);
  const label = stringValue(value.label);
  return { kind, ...(canonicalId ? { canonicalId } : {}), ...(draftId ? { draftId } : {}), ...(label ? { label } : {}) };
}

export function classifyCreationFlowStep(step: Pick<CreationFlowStep, "kind" | "targetResolution">): Pick<CreationFlowStep, "support" | "supportReason"> {
  if (step.kind === "unshaped") return { support: "unshaped", supportReason: "Choose a behavior when you are ready; capture remains valid." };
  if (step.targetResolution === "unresolved" || step.targetResolution === "placeholder") {
    return { support: "unresolved", supportReason: "Resolve or promote the target before canonical commit." };
  }
  if (step.kind === "note") return { support: "story_only", supportReason: "This note stays in the authoring draft and does not claim runtime behavior." };
  if (step.kind === "custom") return { support: "unsupported", supportReason: "Custom executable behavior needs an approved typed contract." };
  if (NEW_CONTRACT_KINDS.has(step.kind)) {
    return { support: "runtime_unverified", supportReason: "Intent is preserved, but its typed web/export contract is not implemented yet." };
  }
  if (CURRENT_RECORD_KINDS.has(step.kind)) {
    return { support: "compilable", supportReason: "The current model has an honest canonical representation; compiler work is still pending." };
  }
  return { support: "unsupported", supportReason: "No honest canonical representation is registered for this step." };
}

function normalizeStep(value: unknown): CreationFlowStep {
  const row = isRecord(value) ? value : {};
  const kind = STEP_KINDS.has(row.kind as CreationFlowStepKind) ? row.kind as CreationFlowStepKind : "unshaped";
  const target = normalizeRef(row.target);
  const rawResolution = stringValue(row.targetResolution);
  const targetResolution = (["none", "unresolved", "placeholder", "canonical"].includes(rawResolution)
    ? rawResolution
    : target?.canonicalId ? "canonical" : target?.draftId ? "placeholder" : "none") as CreationFlowStep["targetResolution"];
  const base: CreationFlowStep = {
    id: stringValue(row.id, generateUlid()),
    kind,
    text: typeof row.text === "string" ? row.text : "",
    targetResolution,
  } as CreationFlowStep;
  const targetWithFields: CreationFlowStep = {
    ...base,
    ...(target ? { target } : {}),
    ...(["immediate", "after_completion", "available_later", "story_only"].includes(String(row.timing)) ? { timing: row.timing as CreationFlowStep["timing"] } : {}),
    ...(["none", "session", "permanent"].includes(String(row.persistence)) ? { persistence: row.persistence as CreationFlowStep["persistence"] } : {}),
    ...(["unspecified", "inherit_owner", "repeatable", "one_shot"].includes(String(row.repeatPolicy)) ? { repeatPolicy: row.repeatPolicy as CreationFlowStep["repeatPolicy"] } : {}),
    ...(isRecord(row.payload) ? { payload: row.payload } : {}),
  };
  return { ...targetWithFields, ...classifyCreationFlowStep(targetWithFields) };
}

function migrateLegacy(value: Record<string, unknown>): Record<string, unknown> {
  if (value.format !== "SOA-CREATION-FLOW/0") return value;
  return {
    ...value,
    format: CREATION_FLOW_FORMAT,
    revision: numberValue(value.revision, 0) + 1,
    steps: arrayValue(value.steps ?? value.nodes),
    relations: arrayValue(value.relations),
    transitions: arrayValue(value.transitions),
    placeholders: arrayValue(value.placeholders),
    mentions: arrayValue(value.mentions),
    localNotes: arrayValue(value.localNotes),
    artifactIds: isRecord(value.artifactIds) ? value.artifactIds : {},
  };
}

export function normalizeCreationFlowDraft(value: unknown, now = Date.now()): CreationFlowDraft {
  if (!isRecord(value)) throw new CreationFlowFormatError("Creation Flow draft must be an object.");
  const migrated = migrateLegacy(value);
  if (migrated.format !== CREATION_FLOW_FORMAT) throw new CreationFlowFormatError(`Unsupported Creation Flow format '${String(migrated.format || "missing")}'.`);
  const shape = (["sequence", "constellation", "hybrid"].includes(String(migrated.shape)) ? migrated.shape : "sequence") as CreationFlowShape;
  const originRow = isRecord(migrated.origin) ? migrated.origin : undefined;
  const originRef = normalizeRef(originRow?.ref);
  const originSubRef = normalizeRef(originRow?.subRef);
  const steps = arrayValue(migrated.steps).map(normalizeStep);
  const stepIds = new Set(steps.map((step) => step.id));
  const transitions = arrayValue(migrated.transitions).flatMap((entry, index): CreationFlowTransition[] => {
    if (!isRecord(entry)) return [];
    const fromStepId = stringValue(entry.fromStepId);
    const toStepId = stringValue(entry.toStepId);
    if (!fromStepId || !toStepId) return [];
    const trigger = (["complete", "dialogue_choice", "victory", "interaction_closed", "condition", "fallback"].includes(String(entry.trigger)) ? entry.trigger : "complete") as CreationFlowTransition["trigger"];
    return [{ id: stringValue(entry.id, generateUlid()), fromStepId, toStepId, trigger, sortOrder: numberValue(entry.sortOrder, index) }];
  });
  const relations = arrayValue(migrated.relations).flatMap((entry): CreationFlowRelation[] => {
    if (!isRecord(entry)) return [];
    const fromStepId = stringValue(entry.fromStepId);
    const toStepId = stringValue(entry.toStepId);
    if (!fromStepId || !toStepId) return [];
    const resolution = (["local_intent", "canonical", "unsupported"].includes(String(entry.resolution)) ? entry.resolution : "local_intent") as CreationFlowRelation["resolution"];
    return [{ id: stringValue(entry.id, generateUlid()), fromStepId, toStepId, relation: stringValue(entry.relation, "relates to"), resolution }];
  });
  const placeholders = arrayValue(migrated.placeholders).flatMap((entry): CreationFlowPlaceholder[] => {
    if (!isRecord(entry)) return [];
    const label = stringValue(entry.label);
    if (!label) return [];
    return [{ id: stringValue(entry.id, generateUlid()), kind: stringValue(entry.kind, "custom"), label,
      ...(stringValue(entry.direction) ? { direction: stringValue(entry.direction) } : {}),
      ...(stringValue(entry.owningWorkspace) ? { owningWorkspace: stringValue(entry.owningWorkspace) } : {}),
      ...(stringValue(entry.promotedCanonicalId) ? { promotedCanonicalId: stringValue(entry.promotedCanonicalId) } : {}) }];
  });
  const mentions = arrayValue(migrated.mentions).flatMap((entry): CreationFlowMention[] => {
    if (!isRecord(entry)) return [];
    const ideaId = stringValue(entry.ideaId);
    const noteId = stringValue(entry.noteId);
    if (!ideaId || !noteId) return [];
    return [{ id: stringValue(entry.id, generateUlid()), ideaId, noteId, start: numberValue(entry.start, 0), end: numberValue(entry.end, 0), quotedText: stringValue(entry.quotedText) }];
  });
  const localNotes = arrayValue(migrated.localNotes).flatMap((entry): Array<{ id: string; text: string }> => isRecord(entry) && typeof entry.text === "string"
    ? [{ id: stringValue(entry.id, generateUlid()), text: entry.text }]
    : []);
  const entryStepId = stringValue(migrated.entryStepId);
  return {
    format: CREATION_FLOW_FORMAT,
    id: stringValue(migrated.id, generateUlid()),
    revision: Math.max(1, numberValue(migrated.revision, 1)),
    title: stringValue(migrated.title, "Untitled Creation Flow"),
    shape,
    ...(originRef ? { origin: { ref: originRef, ...(originSubRef ? { subRef: originSubRef } : {}) } } : {}),
    returnStack: arrayValue(migrated.returnStack).flatMap((entry): CreationFlowReturnFrame[] => isRecord(entry) && stringValue(entry.workspace)
      ? [{ workspace: stringValue(entry.workspace), ...(normalizeRef(entry.context) ? { context: normalizeRef(entry.context) } : {}), ...(stringValue(entry.selectedId) ? { selectedId: stringValue(entry.selectedId) } : {}), ...(isRecord(entry.localViewState) ? { localViewState: entry.localViewState } : {}) }]
      : []),
    ...(entryStepId && stepIds.has(entryStepId) ? { entryStepId } : steps[0] ? { entryStepId: steps[0].id } : {}),
    steps,
    transitions,
    relations,
    placeholders,
    mentions,
    localNotes,
    artifactIds: isRecord(migrated.artifactIds) ? Object.fromEntries(Object.entries(migrated.artifactIds).map(([key, entry]) => [key, String(entry)])) : {},
    createdAt: numberValue(migrated.createdAt, now),
    updatedAt: numberValue(migrated.updatedAt, now),
  };
}

export function createCreationFlowDraft(input: { title: string; shape?: CreationFlowShape; origin?: CreationFlowOrigin; returnFrame?: CreationFlowReturnFrame; now?: number }): CreationFlowDraft {
  const now = input.now ?? Date.now();
  return {
    format: CREATION_FLOW_FORMAT,
    id: generateUlid(new Date(now)),
    revision: 1,
    title: input.title.trim() || "Untitled Creation Flow",
    shape: input.shape ?? "sequence",
    ...(input.origin ? { origin: input.origin } : {}),
    returnStack: input.returnFrame ? [input.returnFrame] : [],
    steps: [], transitions: [], relations: [], placeholders: [], mentions: [], localNotes: [], artifactIds: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function createCreationFlowStep(text: string, kind: CreationFlowStepKind = "unshaped"): CreationFlowStep {
  return normalizeStep({ id: generateUlid(), text, kind, targetResolution: "none", repeatPolicy: "unspecified" });
}

export function appendCreationFlowStep(draft: CreationFlowDraft, step: CreationFlowStep, now = Date.now()): CreationFlowDraft {
  const previous = draft.steps[draft.steps.length - 1];
  const transition = previous && draft.shape !== "constellation"
    ? [{ id: generateUlid(), fromStepId: previous.id, toStepId: step.id, trigger: "complete" as const, sortOrder: draft.transitions.length }]
    : [];
  return { ...draft, revision: draft.revision + 1, steps: [...draft.steps, normalizeStep(step)], transitions: [...draft.transitions, ...transition], entryStepId: draft.entryStepId || step.id, updatedAt: now };
}

export function updateCreationFlowStep(draft: CreationFlowDraft, stepId: string, patch: Partial<CreationFlowStep>, now = Date.now()): CreationFlowDraft {
  return { ...draft, revision: draft.revision + 1, steps: draft.steps.map((step) => step.id === stepId ? normalizeStep({ ...step, ...patch, id: step.id }) : step), updatedAt: now };
}

export function removeCreationFlowStep(draft: CreationFlowDraft, stepId: string, now = Date.now()): CreationFlowDraft {
  const steps = draft.steps.filter((step) => step.id !== stepId);
  return {
    ...draft, revision: draft.revision + 1, steps,
    transitions: draft.transitions.filter((transition) => transition.fromStepId !== stepId && transition.toStepId !== stepId),
    relations: draft.relations.filter((relation) => relation.fromStepId !== stepId && relation.toStepId !== stepId),
    entryStepId: draft.entryStepId === stepId ? steps[0]?.id : draft.entryStepId,
    updatedAt: now,
  };
}

export function moveCreationFlowStep(draft: CreationFlowDraft, stepId: string, direction: -1 | 1, now = Date.now()): CreationFlowDraft {
  const index = draft.steps.findIndex((step) => step.id === stepId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= draft.steps.length) return draft;
  const steps = [...draft.steps];
  [steps[index], steps[target]] = [steps[target], steps[index]];
  const transitions = draft.shape === "constellation" ? draft.transitions : steps.slice(1).map((step, nextIndex) => ({
    id: draft.transitions.find((transition) => transition.fromStepId === steps[nextIndex].id && transition.toStepId === step.id)?.id ?? generateUlid(),
    fromStepId: steps[nextIndex].id, toStepId: step.id, trigger: "complete" as const, sortOrder: nextIndex,
  }));
  return { ...draft, revision: draft.revision + 1, steps, transitions, entryStepId: steps[0]?.id, updatedAt: now };
}

export function validateCreationFlowDraft(draft: CreationFlowDraft): CreationFlowIssue[] {
  const issues: CreationFlowIssue[] = [];
  const stepIds = new Set<string>();
  draft.steps.forEach((step, index) => {
    if (stepIds.has(step.id)) issues.push({ severity: "blocker", path: `steps[${index}].id`, message: "Step ids must be unique." });
    stepIds.add(step.id);
    if (!step.text.trim()) issues.push({ severity: "warning", path: `steps[${index}].text`, message: "Step text is empty." });
    if (["unresolved", "placeholder"].includes(step.targetResolution)) issues.push({ severity: "blocker", path: `steps[${index}].target`, message: "Resolve or promote this target before canonical commit." });
    if (["unsupported", "runtime_unverified", "unshaped"].includes(step.support)) issues.push({ severity: "warning", path: `steps[${index}].support`, message: step.supportReason || "Step is not canonically compilable yet." });
  });
  draft.transitions.forEach((transition, index) => {
    if (!stepIds.has(transition.fromStepId) || !stepIds.has(transition.toStepId)) issues.push({ severity: "blocker", path: `transitions[${index}]`, message: "Transition references a missing step." });
    if (transition.fromStepId === transition.toStepId) issues.push({ severity: "warning", path: `transitions[${index}]`, message: "Self-transition requires explicit loop review." });
  });
  draft.relations.forEach((relation, index) => {
    if (!stepIds.has(relation.fromStepId) || !stepIds.has(relation.toStepId)) issues.push({ severity: "blocker", path: `relations[${index}]`, message: "Relation references a missing idea." });
  });
  const placeholderIds = new Set(draft.placeholders.map((placeholder) => placeholder.id));
  draft.mentions.forEach((mention, index) => {
    if (!placeholderIds.has(mention.ideaId)) issues.push({ severity: "blocker", path: `mentions[${index}].ideaId`, message: "Text mention references a missing idea card." });
    const note = draft.localNotes.find((entry) => entry.id === mention.noteId);
    if (!note || mention.start < 0 || mention.end > note.text.length || mention.start >= mention.end) issues.push({ severity: "warning", path: `mentions[${index}]`, message: "Text mention range is stale and needs review." });
  });
  return issues;
}

export function sameCreationFlowRef(left: CreationFlowRef | undefined, right: CreationFlowRef | undefined): boolean {
  if (!left || !right || left.kind !== right.kind) return false;
  return Boolean(left.canonicalId && left.canonicalId === right.canonicalId) || Boolean(left.draftId && left.draftId === right.draftId);
}
