import type { EntryRecord } from "../types/editorQol";
import type { StoryOccurrence } from "./storyPlacement";

export type QuestStoryMilestoneKind = "start" | "escalation" | "branch" | "resolution" | "other";
export type QuestBranchDiagnosticSeverity = "warning" | "info";

export interface QuestJourneyStep {
  id: string;
  label: string;
  description: string;
  kind: "invitation" | "objective" | "completion";
  flagsSet: string[];
  requirementId: string;
}

export interface QuestStoryMilestone {
  id: string;
  kind: QuestStoryMilestoneKind;
  label: string;
  beatId: string;
  beatLabel: string;
  storyArcId: string;
  timelineId: string;
  order: number;
  lifecycle: string;
  importance: string;
}

export interface QuestBranchRow {
  id: string;
  conditionFlag: string;
  nextQuestId: string;
  nextQuestLabel: string;
  targetOrder: number | null;
}

export interface QuestBranchDiagnostic {
  id: string;
  severity: QuestBranchDiagnosticSeverity;
  message: string;
}

export interface QuestJourneyAnalysis {
  steps: QuestJourneyStep[];
  milestones: QuestStoryMilestone[];
  branches: QuestBranchRow[];
  diagnostics: QuestBranchDiagnostic[];
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function rows(value: unknown): EntryRecord[] {
  return Array.isArray(value)
    ? value.filter((row): row is EntryRecord => typeof row === "object" && row !== null && !Array.isArray(row))
    : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function label(row: EntryRecord | undefined, fallback: string): string {
  if (!row) return fallback;
  return text(row.title) || text(row.name) || text(row.slug) || text(row.id) || fallback;
}

function milestoneKind(occurrence: StoryOccurrence, beat?: EntryRecord): QuestStoryMilestoneKind {
  const state = text(occurrence.state_label).toLowerCase();
  const change = text(occurrence.change_type).toLowerCase();
  const kind = text(occurrence.occurrence_kind).toLowerCase();
  const beatType = text(beat?.beat_type).toLowerCase();
  if (change === "introduced" || beatType === "hook" || beatType === "introduction") return "start";
  if (state.includes("branch") || beatType === "decision") return "branch";
  if (kind === "consequence" || state.includes("resolved") || beatType === "payoff" || beatType === "recovery") return "resolution";
  if (change === "changed" || state.includes("escalated") || ["conflict", "reversal", "climax"].includes(beatType)) return "escalation";
  return "other";
}

function lifecycleLabel(occurrence: StoryOccurrence): string {
  return occurrence.state_label || occurrence.change_type || occurrence.occurrence_kind || occurrence.role || "active";
}

function questProducedFlagsById(quests: EntryRecord[]): Map<string, Set<string>> {
  return new Map(quests.map((quest) => [
    text(quest.id),
    new Set([
      ...strings(quest.flags_set_on_completion),
      ...rows(quest.objectives).flatMap((objective) => strings(objective.flags_set)),
    ]),
  ]));
}

export function buildQuestJourneyAnalysis({
  packet,
  storyPacket,
  questId,
  occurrences,
}: {
  packet: EntryRecord;
  storyPacket: EntryRecord | null | undefined;
  questId: string;
  occurrences: StoryOccurrence[];
}): QuestJourneyAnalysis {
  const quest = typeof packet.quest === "object" && packet.quest !== null && !Array.isArray(packet.quest) ? packet.quest as EntryRecord : {};
  const questRows = rows(packet.quests);
  const arc = typeof packet.arc === "object" && packet.arc !== null && !Array.isArray(packet.arc) ? packet.arc as EntryRecord : {};
  const storyArcId = text(arc.story_arc_id) || text(quest.story_arc_id);
  const orderedQuestIds = strings(arc.related_quests);
  const currentOrder = orderedQuestIds.indexOf(questId);
  const questLabels = new Map(questRows.map((row) => [text(row.id), label(row, text(row.id))]));
  questLabels.set(questId, label(quest, questId));
  const producedFlags = questProducedFlagsById([...questRows, quest]);
  const beatCatalog = new Map(rows((storyPacket?.catalogs as EntryRecord | undefined)?.adventure_beats).map((beat) => [text(beat.id), beat]));

  const steps: QuestJourneyStep[] = [
    {
      id: "invitation",
      label: "Invitation",
      description: text(quest.description) || "Quest entry point.",
      kind: "invitation",
      flagsSet: [],
      requirementId: text(quest.requirements_id),
    },
    ...rows(quest.objectives).map((objective, index) => ({
      id: text(objective.objective_id) || `objective-${index + 1}`,
      label: `Objective ${index + 1}`,
      description: text(objective.description) || "Describe what the player must accomplish.",
      kind: "objective" as const,
      flagsSet: strings(objective.flags_set),
      requirementId: text(objective.requirements_id),
    })),
    {
      id: "completion",
      label: "Completion",
      description: "Completion flags and payoff.",
      kind: "completion",
      flagsSet: strings(quest.flags_set_on_completion),
      requirementId: "",
    },
  ];

  const milestones = occurrences
    .map((occurrence) => {
      const beat = beatCatalog.get(occurrence.source_id);
      return {
        id: occurrence.id,
        kind: milestoneKind(occurrence, beat),
        label: occurrence.source_label || occurrence.label || text(beat?.title) || "Story beat",
        beatId: occurrence.source_id,
        beatLabel: occurrence.source_label || text(beat?.title) || occurrence.source_id,
        storyArcId: occurrence.story_arc_id,
        timelineId: occurrence.timeline_id,
        order: occurrence.order,
        lifecycle: lifecycleLabel(occurrence),
        importance: occurrence.importance || "major",
      };
    })
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));

  const branches = rows(arc.branches).map((branch, index) => {
    const nextQuestId = text(branch.next_quest_id);
    const targetOrder = orderedQuestIds.indexOf(nextQuestId);
    return {
      id: `branch-${index}-${text(branch.condition_flag)}-${nextQuestId}`,
      conditionFlag: text(branch.condition_flag),
      nextQuestId,
      nextQuestLabel: questLabels.get(nextQuestId) || nextQuestId || "Missing quest",
      targetOrder: targetOrder >= 0 ? targetOrder : null,
    };
  });

  const diagnostics: QuestBranchDiagnostic[] = [];
  const addDiagnostic = (id: string, severity: QuestBranchDiagnosticSeverity, message: string) => {
    if (!diagnostics.some((diagnostic) => diagnostic.id === id)) diagnostics.push({ id, severity, message });
  };

  if (storyArcId && currentOrder < 0) {
    addDiagnostic("quest-missing-from-arc-order", "warning", "Quest belongs to an arc but is not present in the arc quest order.");
  }

  branches.forEach((branch) => {
    if (!branch.conditionFlag) {
      addDiagnostic(`${branch.id}:missing-condition`, "warning", "Branch has no condition flag.");
    }
    if (!branch.nextQuestId) {
      addDiagnostic(`${branch.id}:missing-target`, "warning", "Branch has no target quest.");
      return;
    }
    if (branch.nextQuestId === questId) {
      addDiagnostic(`${branch.id}:self-target`, "warning", "Branch points back to this quest.");
    }
    if (branch.targetOrder === null) {
      addDiagnostic(`${branch.id}:target-outside-order`, "warning", `Branch target ${branch.nextQuestLabel} is not in this arc's ordered quest list.`);
    } else if (currentOrder >= 0 && branch.targetOrder <= currentOrder) {
      addDiagnostic(`${branch.id}:backward-target`, "warning", `Branch target ${branch.nextQuestLabel} is not after this quest in the arc order.`);
    }
    if (branch.conditionFlag && currentOrder >= 0) {
      const producerOrder = orderedQuestIds.findIndex((candidateId) => producedFlags.get(candidateId)?.has(branch.conditionFlag));
      if (producerOrder < 0) {
        addDiagnostic(`${branch.id}:flag-no-producer`, "info", `Condition flag ${branch.conditionFlag} has no known quest producer in this arc.`);
      } else if (producerOrder > currentOrder) {
        addDiagnostic(`${branch.id}:flag-produced-later`, "warning", `Condition flag ${branch.conditionFlag} is first produced by a later arc quest.`);
      }
    }
  });

  return { steps, milestones, branches, diagnostics };
}
