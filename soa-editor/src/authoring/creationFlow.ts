import { generateUlid } from "../utils/generateId";

export const CREATION_FLOW_FORMAT = "SOA-CREATION-FLOW/1" as const;

export type CreationFlowShape = "sequence" | "constellation" | "hybrid";
export type CreationFlowRefKind =
  | "dialogue" | "dialogue_node" | "dialogue_choice" | "encounter"
  | "quest" | "quest_objective" | "event" | "shop" | "location"
  | "location_poi" | "location_route" | "story_beat" | "item"
  | "character" | "faction" | "lore_entry" | "creature" | "effect"
  | "status" | "currency" | "stat" | "requirement" | "flow_step" | "custom";

export type CreationFlowStepKind =
  | "unshaped" | "dialogue" | "encounter" | "item_reward" | "numeric_reward"
  | "lore_reveal" | "teleport" | "scripted_moment" | "open_shop"
  | "make_available" | "quest_assignment" | "quest_turn_in"
  | "inventory_objective" | "join_companion" | "persistent_fact"
  | "activate_location_variant" | "activate_character_variant"
  | "activate_item_variant" | "world_state" | "gameplay_effect"
  | "story_placement" | "note" | "custom";

export type CreationFlowTiming = "immediate" | "after_completion" | "available_later" | "story_only";
export type CreationFlowRepeatPolicy = "unspecified" | "inherit_owner" | "repeatable" | "one_shot";
export type CreationFlowSupport = "unshaped" | "unresolved" | "compilable" | "story_only" | "unsupported" | "runtime_unverified";

export interface CreationFlowRef {
  kind: CreationFlowRefKind;
  canonicalId?: string;
  draftId?: string;
  label?: string;
}
export interface GameplayActionTarget {
  scope: "player" | "party" | "source_character" | "target_character" | "encounter_side" | "location" | "explicit_entity";
  ref?: CreationFlowRef;
}

export interface StatusRemovalFilter {
  statusCategory?: "Buff" | "Debuff" | "Control" | "DoT" | "Other";
  polarity?: "Beneficial" | "Harmful" | "Neutral";
  statusTag?: string;
}

export type NarrativeGameplayAction =
  | { actionType: "apply_effect" | "restore_resource"; effect: CreationFlowRef; target: GameplayActionTarget }
  | { actionType: "apply_status"; status: CreationFlowRef; target: GameplayActionTarget; stacks?: number; duration?: number }
  | { actionType: "remove_status"; status: CreationFlowRef; target: GameplayActionTarget; removalMode: "cleanse" | "dispel" | "system" }
  | { actionType: "remove_matching_statuses"; filter: StatusRemovalFilter; target: GameplayActionTarget; removalMode: "cleanse" | "dispel" | "system" }
  | { actionType: "grant_currency"; currency: CreationFlowRef; amount: number; target: GameplayActionTarget }
  | { actionType: "take_currency"; currency: CreationFlowRef; amount: number; target: GameplayActionTarget; insufficientPolicy: "block" | "clamp_to_zero" | "fail_action" };

export interface CreationFlowStep {
  id: string;
  kind: CreationFlowStepKind;
  text: string;
  target?: CreationFlowRef;
  timing?: CreationFlowTiming;
  persistence?: "none" | "session" | "permanent";
  repeatPolicy?: CreationFlowRepeatPolicy;
  gameplayAction?: NarrativeGameplayAction;
  payload?: Record<string, unknown>;
  targetResolution: "none" | "unresolved" | "placeholder" | "canonical";
  support: CreationFlowSupport;
}

export interface CreationFlowTransition {
  id: string;
  fromStepId: string;
  toStepId: string;
  trigger: "complete" | "dialogue_choice" | "victory" | "interaction_closed" | "condition" | "fallback";
  sourceRefId?: string;
  requirementId?: string;
  sortOrder: number;
  label?: string;
}

const TRANSITION_TRIGGERS: CreationFlowTransition["trigger"][] = [
  "complete", "dialogue_choice", "victory", "interaction_closed", "condition", "fallback",
];

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
  placeholderId: string;
  start: number;
  end: number;
  text: string;
}

export interface CreationFlowLocalNote {
  id: string;
  text: string;
  mentions?: CreationFlowMention[];
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
  origin?: { ref: CreationFlowRef; subRef?: CreationFlowRef };
  returnStack: CreationFlowReturnFrame[];
  entryStepId?: string;
  steps: CreationFlowStep[];
  transitions: CreationFlowTransition[];
  relations: CreationFlowRelation[];
  placeholders: CreationFlowPlaceholder[];
  localNotes: CreationFlowLocalNote[];
  artifactIds: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface CreationFlowIssue {
  severity: "blocker" | "warning" | "info";
  message: string;
  stepId?: string;
  placeholderId?: string;
}

const TARGET_KINDS = new Set<CreationFlowStepKind>([
  "dialogue", "encounter", "item_reward", "lore_reveal", "teleport", "open_shop",
  "make_available", "quest_assignment", "quest_turn_in", "inventory_objective",
  "join_companion", "activate_location_variant", "activate_character_variant",
  "activate_item_variant", "story_placement",
]);

const RUNTIME_UNVERIFIED_KINDS = new Set<CreationFlowStepKind>([
  "open_shop", "quest_assignment", "quest_turn_in", "inventory_objective", "join_companion",
  "activate_location_variant", "activate_character_variant", "activate_item_variant", "gameplay_effect",
]);

const STEP_KINDS: CreationFlowStepKind[] = [
  "unshaped", "dialogue", "encounter", "item_reward", "numeric_reward", "lore_reveal", "teleport",
  "scripted_moment", "open_shop", "make_available", "quest_assignment", "quest_turn_in",
  "inventory_objective", "join_companion", "persistent_fact", "activate_location_variant",
  "activate_character_variant", "activate_item_variant", "world_state", "gameplay_effect",
  "story_placement", "note", "custom",
];

export const CREATION_FLOW_STEP_KINDS = STEP_KINDS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeRef(value: unknown): CreationFlowRef | undefined {
  if (!isRecord(value)) return undefined;
  const kind = stringValue(value.kind, "custom") as CreationFlowRefKind;
  return {
    kind,
    ...(stringValue(value.canonicalId) ? { canonicalId: stringValue(value.canonicalId) } : {}),
    ...(stringValue(value.draftId) ? { draftId: stringValue(value.draftId) } : {}),
    ...(stringValue(value.label) ? { label: stringValue(value.label) } : {}),
  };
}

export function deriveTargetResolution(target?: CreationFlowRef): CreationFlowStep["targetResolution"] {
  if (!target) return "none";
  if (target.canonicalId) return "canonical";
  if (target.draftId) return "placeholder";
  return "unresolved";
}

export function deriveStepSupport(step: Pick<CreationFlowStep, "kind" | "target" | "targetResolution">): CreationFlowSupport {
  if (step.kind === "unshaped") return "unshaped";
  if (step.kind === "custom") return "unsupported";
  if (step.kind === "note" || step.kind === "story_placement" || step.target?.kind === "story_beat") return "story_only";
  if (TARGET_KINDS.has(step.kind) && step.targetResolution !== "canonical") return "unresolved";
  if (RUNTIME_UNVERIFIED_KINDS.has(step.kind)) return "runtime_unverified";
  return "compilable";
}

export function createCreationFlowStep(text: string, kind: CreationFlowStepKind = "unshaped", target?: CreationFlowRef): CreationFlowStep {
  const targetResolution = deriveTargetResolution(target);
  const step: CreationFlowStep = {
    id: generateUlid(), kind, text: text.trim(), target, targetResolution,
    timing: kind === "story_placement" || kind === "note" ? "story_only" : "after_completion",
    persistence: "none", repeatPolicy: "unspecified", support: "unshaped",
  };
  return { ...step, support: deriveStepSupport(step) };
}

export function createCreationFlowDraft(input: {
  title: string;
  shape?: CreationFlowShape;
  origin?: CreationFlowDraft["origin"];
  returnFrame?: CreationFlowReturnFrame;
  now?: number;
}): CreationFlowDraft {
  const now = input.now ?? Date.now();
  return {
    format: CREATION_FLOW_FORMAT, id: generateUlid(), revision: 1, title: input.title.trim() || "Untitled creation flow",
    shape: input.shape ?? "sequence", origin: input.origin,
    returnStack: input.returnFrame ? [input.returnFrame] : [], steps: [], transitions: [], relations: [],
    placeholders: [], localNotes: [], artifactIds: {}, createdAt: now, updatedAt: now,
  };
}

function normalizeStep(value: unknown): CreationFlowStep | null {
  if (!isRecord(value)) return null;
  const kindRaw = stringValue(value.kind, "unshaped");
  const kind = STEP_KINDS.includes(kindRaw as CreationFlowStepKind) ? kindRaw as CreationFlowStepKind : "custom";
  const target = normalizeRef(value.target);
  const targetResolution = deriveTargetResolution(target);
  const step: CreationFlowStep = {
    id: stringValue(value.id) || generateUlid(), kind, text: stringValue(value.text), target, targetResolution,
    timing: stringValue(value.timing, kind === "note" ? "story_only" : "after_completion") as CreationFlowTiming,
    persistence: stringValue(value.persistence, "none") as CreationFlowStep["persistence"],
    repeatPolicy: stringValue(value.repeatPolicy, "unspecified") as CreationFlowRepeatPolicy,
    ...(isRecord(value.payload) ? { payload: value.payload } : {}),
    ...(isRecord(value.gameplayAction) ? { gameplayAction: value.gameplayAction as unknown as NarrativeGameplayAction } : {}),
    support: "unshaped",
  };
  return { ...step, support: deriveStepSupport(step) };
}

export function normalizeCreationFlowDraft(value: unknown, now = Date.now()): CreationFlowDraft {
  if (!isRecord(value)) throw new Error("Creation Flow import must contain a JSON object.");
  const format = stringValue(value.format);
  if (format && format !== CREATION_FLOW_FORMAT) throw new Error(`Unsupported Creation Flow format '${format}'.`);
  const steps = Array.isArray(value.steps) ? value.steps.map(normalizeStep).filter((step): step is CreationFlowStep => Boolean(step)) : [];
  const stepIds = new Set(steps.map((step) => step.id));
  const transitions = (Array.isArray(value.transitions) ? value.transitions : []).flatMap((row, index): CreationFlowTransition[] => {
    if (!isRecord(row)) return [];
    const fromStepId = stringValue(row.fromStepId); const toStepId = stringValue(row.toStepId);
    if (!stepIds.has(fromStepId) || !stepIds.has(toStepId)) return [];
    const rawTrigger = stringValue(row.trigger, "complete") as CreationFlowTransition["trigger"];
    const trigger = TRANSITION_TRIGGERS.includes(rawTrigger) ? rawTrigger : "complete";
    return [{
      id: stringValue(row.id) || generateUlid(), fromStepId, toStepId, trigger,
      ...(stringValue(row.sourceRefId) ? { sourceRefId: stringValue(row.sourceRefId) } : {}),
      ...(stringValue(row.requirementId) ? { requirementId: stringValue(row.requirementId) } : {}),
      sortOrder: Math.max(0, Math.trunc(numberValue(row.sortOrder, index))),
      ...(stringValue(row.label) ? { label: stringValue(row.label) } : {}),
    }];
  });
  const relations = (Array.isArray(value.relations) ? value.relations : []).flatMap((row): CreationFlowRelation[] => {
    if (!isRecord(row)) return [];
    const fromStepId = stringValue(row.fromStepId); const toStepId = stringValue(row.toStepId);
    if (!stepIds.has(fromStepId) || !stepIds.has(toStepId)) return [];
    return [{ id: stringValue(row.id) || generateUlid(), fromStepId, toStepId, relation: stringValue(row.relation, "relates to"), resolution: stringValue(row.resolution, "local_intent") as CreationFlowRelation["resolution"] }];
  });
  const originValue = isRecord(value.origin) ? value.origin : undefined;
  const originRef = normalizeRef(originValue?.ref);
  const shapeValue = stringValue(value.shape, "sequence");
  const shape: CreationFlowShape = ["sequence", "constellation", "hybrid"].includes(shapeValue) ? shapeValue as CreationFlowShape : "sequence";
  const createdAt = numberValue(value.createdAt, now);
  return {
    format: CREATION_FLOW_FORMAT, id: stringValue(value.id) || generateUlid(), revision: Math.max(1, numberValue(value.revision, 1)),
    title: stringValue(value.title, "Untitled creation flow"), shape,
    ...(originRef ? { origin: { ref: originRef, ...(normalizeRef(originValue?.subRef) ? { subRef: normalizeRef(originValue?.subRef) } : {}) } } : {}),
    returnStack: (Array.isArray(value.returnStack) ? value.returnStack : []).filter(isRecord).map((frame) => ({ workspace: stringValue(frame.workspace, "unknown"), ...(normalizeRef(frame.context) ? { context: normalizeRef(frame.context) } : {}), ...(stringValue(frame.selectedId) ? { selectedId: stringValue(frame.selectedId) } : {}), ...(isRecord(frame.localViewState) ? { localViewState: frame.localViewState } : {}) })),
    ...(stringValue(value.entryStepId) && stepIds.has(stringValue(value.entryStepId)) ? { entryStepId: stringValue(value.entryStepId) } : {}),
    steps, transitions, relations,
    placeholders: (Array.isArray(value.placeholders) ? value.placeholders : []).filter(isRecord).map((placeholder) => ({ id: stringValue(placeholder.id) || generateUlid(), kind: stringValue(placeholder.kind, "custom"), label: stringValue(placeholder.label, "Untitled idea"), ...(stringValue(placeholder.direction) ? { direction: stringValue(placeholder.direction) } : {}), ...(stringValue(placeholder.owningWorkspace) ? { owningWorkspace: stringValue(placeholder.owningWorkspace) } : {}), ...(stringValue(placeholder.promotedCanonicalId) ? { promotedCanonicalId: stringValue(placeholder.promotedCanonicalId) } : {}) })),
    localNotes: (Array.isArray(value.localNotes) ? value.localNotes : []).filter(isRecord).map((note) => ({ id: stringValue(note.id) || generateUlid(), text: stringValue(note.text), mentions: (Array.isArray(note.mentions) ? note.mentions : []).filter(isRecord).map((mention) => ({ id: stringValue(mention.id) || generateUlid(), placeholderId: stringValue(mention.placeholderId), start: numberValue(mention.start, 0), end: numberValue(mention.end, 0), text: stringValue(mention.text) })) })),
    artifactIds: isRecord(value.artifactIds) ? Object.fromEntries(Object.entries(value.artifactIds).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {},
    createdAt, updatedAt: numberValue(value.updatedAt, createdAt),
  };
}

export function touchCreationFlowDraft(draft: CreationFlowDraft, patch: Partial<CreationFlowDraft>, now = Date.now()): CreationFlowDraft {
  return normalizeCreationFlowDraft({ ...draft, ...patch, revision: draft.revision + 1, updatedAt: now }, now);
}

export function addCreationFlowStep(draft: CreationFlowDraft, step: CreationFlowStep, now = Date.now()): CreationFlowDraft {
  return insertCreationFlowStep(draft, step, draft.steps.length, now);
}

function rebuildLinearTransitions(draft: CreationFlowDraft, steps: CreationFlowStep[]): CreationFlowTransition[] {
  const explicitTransitions = draft.transitions.filter((transition) =>
    transition.trigger !== "complete" || Boolean(transition.requirementId || transition.sourceRefId || transition.label),
  );
  if (draft.shape === "constellation") return explicitTransitions;
  const linearTransitions = steps.slice(0, -1).map((step, order): CreationFlowTransition => ({
    id: generateUlid(), fromStepId: step.id, toStepId: steps[order + 1].id,
    trigger: "complete", sortOrder: order,
  }));
  return [...explicitTransitions, ...linearTransitions];
}

export function insertCreationFlowStep(draft: CreationFlowDraft, step: CreationFlowStep, index: number, now = Date.now()): CreationFlowDraft {
  const insertionIndex = Math.max(0, Math.min(Math.trunc(index), draft.steps.length));
  const steps = [...draft.steps];
  steps.splice(insertionIndex, 0, step);
  return touchCreationFlowDraft(draft, {
    steps,
    entryStepId: draft.entryStepId || steps[0]?.id,
    transitions: rebuildLinearTransitions(draft, steps),
  }, now);
}

export function duplicateCreationFlowStep(draft: CreationFlowDraft, stepId: string, now = Date.now()): CreationFlowDraft {
  const index = draft.steps.findIndex((step) => step.id === stepId);
  if (index < 0) return draft;
  const duplicate = normalizeStep({ ...draft.steps[index], id: generateUlid() });
  if (!duplicate) return draft;
  return insertCreationFlowStep(draft, duplicate, index + 1, now);
}

export function patchCreationFlowStep(draft: CreationFlowDraft, stepId: string, patch: Partial<CreationFlowStep>, now = Date.now()): CreationFlowDraft {
  return touchCreationFlowDraft(draft, { steps: draft.steps.map((step) => {
    if (step.id !== stepId) return step;
    const target = Object.prototype.hasOwnProperty.call(patch, "target") ? patch.target : step.target;
    const next = { ...step, ...patch, target, targetResolution: deriveTargetResolution(target) };
    return { ...next, support: deriveStepSupport(next) };
  }) }, now);
}

export function moveCreationFlowStep(draft: CreationFlowDraft, stepId: string, offset: -1 | 1, now = Date.now()): CreationFlowDraft {
  const index = draft.steps.findIndex((step) => step.id === stepId);
  const targetIndex = index + offset;
  if (index < 0 || targetIndex < 0 || targetIndex >= draft.steps.length) return draft;
  const steps = [...draft.steps];
  [steps[index], steps[targetIndex]] = [steps[targetIndex], steps[index]];
  return touchCreationFlowDraft(draft, { steps, entryStepId: steps[0]?.id, transitions: rebuildLinearTransitions(draft, steps) }, now);
}

export function removeCreationFlowStep(draft: CreationFlowDraft, stepId: string, now = Date.now()): CreationFlowDraft {
  const steps = draft.steps.filter((step) => step.id !== stepId);
  const survivingTransitions = draft.transitions.filter((transition) => transition.fromStepId !== stepId && transition.toStepId !== stepId);
  const relations = draft.relations.filter((relation) => relation.fromStepId !== stepId && relation.toStepId !== stepId);
  return touchCreationFlowDraft(
    { ...draft, transitions: survivingTransitions },
    { steps, transitions: rebuildLinearTransitions({ ...draft, transitions: survivingTransitions }, steps), relations, entryStepId: draft.entryStepId === stepId ? steps[0]?.id : draft.entryStepId },
    now,
  );
}

export function getStableArtifactId(draft: CreationFlowDraft, key: string): { draft: CreationFlowDraft; id: string } {
  const existing = draft.artifactIds[key];
  if (existing) return { draft, id: existing };
  const id = generateUlid();
  return { draft: touchCreationFlowDraft(draft, { artifactIds: { ...draft.artifactIds, [key]: id } }), id };
}

export function creationFlowIssues(draft: CreationFlowDraft): CreationFlowIssue[] {
  const issues: CreationFlowIssue[] = [];
  if (!draft.title.trim()) issues.push({ severity: "blocker", message: "Give the flow a title before sharing or compiling it." });
  if (draft.steps.length === 0 && draft.placeholders.length === 0) issues.push({ severity: "info", message: "Capture the first next step or idea card." });
  draft.steps.forEach((step) => {
    if (!step.text.trim()) issues.push({ severity: "warning", stepId: step.id, message: "This step has no author-facing description." });
    if (step.support === "unresolved") issues.push({ severity: "warning", stepId: step.id, message: "This step still needs an existing target or a resolved placeholder." });
    if (step.support === "unsupported") issues.push({ severity: "warning", stepId: step.id, message: "This custom intention is preserved, but no canonical compiler contract exists yet." });
    if (step.support === "runtime_unverified") issues.push({ severity: "info", stepId: step.id, message: "The web/export contract is implemented; consuming runtime execution is not yet verified." });
    if (step.kind === "gameplay_effect" && !step.gameplayAction) issues.push({ severity: "blocker", stepId: step.id, message: "Choose the gameplay action and canonical payload before commit." });
    if (["activate_location_variant", "activate_character_variant", "activate_item_variant"].includes(step.kind) && !String(step.payload?.variantId ?? "").trim()) issues.push({ severity: "blocker", stepId: step.id, message: "Choose the stable variant identity to activate." });
  });
  const fallbackSources = new Set<string>();
  draft.transitions.forEach((transition) => {
    if (transition.trigger === "condition" && !transition.requirementId) issues.push({ severity: "blocker", stepId: transition.fromStepId, message: "A conditional branch needs a canonical requirement." });
    if (transition.trigger === "dialogue_choice" && !transition.sourceRefId) issues.push({ severity: "blocker", stepId: transition.fromStepId, message: "A dialogue-choice branch needs the exact saved choice." });
    if (transition.trigger === "fallback") {
      if (fallbackSources.has(transition.fromStepId)) issues.push({ severity: "blocker", stepId: transition.fromStepId, message: "A step can have only one fallback branch." });
      fallbackSources.add(transition.fromStepId);
    }
  });
  draft.placeholders.filter((placeholder) => !placeholder.promotedCanonicalId).forEach((placeholder) => issues.push({ severity: "blocker", placeholderId: placeholder.id, message: `${placeholder.label} must be linked or promoted before canonical commit.` }));
  return issues;
}

export function reconcileCreationFlowMentions(previousText: string, nextText: string, mentions: CreationFlowMention[] = []): CreationFlowMention[] {
  return mentions.flatMap((mention): CreationFlowMention[] => {
    if (nextText.slice(mention.start, mention.end) === mention.text) return [mention];
    const first = nextText.indexOf(mention.text);
    if (first < 0 || nextText.indexOf(mention.text, first + 1) >= 0) return [];
    const likelyShift = nextText.length - previousText.length;
    const shiftedStart = mention.start + likelyShift;
    const start = nextText.slice(shiftedStart, shiftedStart + mention.text.length) === mention.text
      ? shiftedStart
      : first;
    return [{ ...mention, start, end: start + mention.text.length }];
  });
}

export function originKey(origin?: CreationFlowDraft["origin"]): string {
  if (!origin) return "unscoped";
  const ref = origin.subRef ?? origin.ref;
  return `${ref.kind}:${ref.canonicalId || ref.draftId || ref.label || "unknown"}`;
}
