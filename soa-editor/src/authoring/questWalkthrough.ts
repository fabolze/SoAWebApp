import type { EntryRecord } from "../types/editorQol";

export type QuestWalkthroughStepKind = "invitation" | "objective" | "completion";

export interface RequirementSummary {
  id: string;
  label: string;
  requiredFlags: string[];
  forbiddenFlags: string[];
  reputationGates: Array<{ factionId: string; minimum: number }>;
  missingRequiredFlags: string[];
  presentForbiddenFlags: string[];
  satisfied: boolean;
  hasReputationGates: boolean;
}

export interface QuestWalkthroughStep {
  id: string;
  kind: QuestWalkthroughStepKind;
  title: string;
  description: string;
  requirement?: RequirementSummary;
  flagsBefore: string[];
  flagsGained: string[];
  flagsAfter: string[];
  rewards: EntryRecord;
  warnings: string[];
}

export interface QuestWalkthroughModel {
  steps: QuestWalkthroughStep[];
  warnings: string[];
  producedFlags: string[];
  completionRewards: EntryRecord;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function rows(value: unknown): EntryRecord[] {
  return Array.isArray(value) ? value.filter((row): row is EntryRecord => typeof row === "object" && row !== null && !Array.isArray(row)) : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function requirementLabel(requirement: EntryRecord): string {
  return text(requirement.slug) || text(requirement.id) || "Requirement";
}

export function summarizeRequirement(requirement: EntryRecord | undefined, flags: Set<string>): RequirementSummary | undefined {
  if (!requirement) return undefined;
  const requiredFlags = strings(requirement.required_flags);
  const forbiddenFlags = strings(requirement.forbidden_flags);
  const reputationGates = rows(requirement.min_faction_reputation).map((entry) => ({
    factionId: text(entry.faction_id),
    minimum: Number(entry.min ?? 0),
  })).filter((entry) => entry.factionId);
  const missingRequiredFlags = requiredFlags.filter((flag) => !flags.has(flag));
  const presentForbiddenFlags = forbiddenFlags.filter((flag) => flags.has(flag));
  return {
    id: text(requirement.id),
    label: requirementLabel(requirement),
    requiredFlags,
    forbiddenFlags,
    reputationGates,
    missingRequiredFlags,
    presentForbiddenFlags,
    satisfied: missingRequiredFlags.length === 0 && presentForbiddenFlags.length === 0,
    hasReputationGates: reputationGates.length > 0,
  };
}

export function buildQuestWalkthrough(packet: EntryRecord, initialFlags: string[]): QuestWalkthroughModel {
  const quest = typeof packet.quest === "object" && packet.quest !== null && !Array.isArray(packet.quest) ? packet.quest as EntryRecord : {};
  const requirements = new Map(rows(packet.requirements).map((requirement) => [text(requirement.id), requirement]));
  const objectives = rows(quest.objectives);
  const completionFlags = strings(quest.flags_set_on_completion);
  const objectiveProducedFlags = objectives.flatMap((objective) => strings(objective.flags_set));
  const producedFlags = unique([...objectiveProducedFlags, ...completionFlags]);
  const flags = new Set(initialFlags.filter(Boolean));
  const steps: QuestWalkthroughStep[] = [];
  const modelWarnings: string[] = [];

  const addWarning = (message: string) => {
    if (!modelWarnings.includes(message)) modelWarnings.push(message);
  };

  const questRequirementId = text(quest.requirements_id);
  const questRequirement = summarizeRequirement(requirements.get(questRequirementId), flags);
  const invitationWarnings: string[] = [];
  questRequirement?.requiredFlags.forEach((flag) => {
    if (completionFlags.includes(flag)) invitationWarnings.push(`Quest start requires its own completion flag ${flag}.`);
  });
  questRequirement?.requiredFlags.forEach((flag) => {
    if (objectiveProducedFlags.includes(flag)) invitationWarnings.push(`Quest start requires ${flag}, which is produced later by an objective.`);
  });
  if (questRequirement?.hasReputationGates) invitationWarnings.push("Reputation gates are shown but not simulated by temporary flag state.");
  invitationWarnings.forEach(addWarning);
  steps.push({
    id: "invitation",
    kind: "invitation",
    title: "Invitation",
    description: text(quest.description) || "Quest entry point.",
    requirement: questRequirement,
    flagsBefore: [...flags],
    flagsGained: [],
    flagsAfter: [...flags],
    rewards: {},
    warnings: invitationWarnings,
  });

  objectives.forEach((objective, index) => {
    const before = [...flags];
    const requirement = summarizeRequirement(requirements.get(text(objective.requirements_id)), flags);
    const flagsGained = strings(objective.flags_set);
    const warnings: string[] = [];
    requirement?.requiredFlags.forEach((flag) => {
      if (flagsGained.includes(flag)) warnings.push(`Objective requires ${flag} and also produces it.`);
      const laterObjectiveProducesFlag = objectives.slice(index + 1).some((later) => strings(later.flags_set).includes(flag));
      if (laterObjectiveProducesFlag) warnings.push(`Objective requires ${flag}, which is produced later in this quest.`);
    });
    if (requirement?.hasReputationGates) warnings.push("Reputation gates are shown but not simulated by temporary flag state.");
    flagsGained.forEach((flag) => flags.add(flag));
    warnings.forEach(addWarning);
    steps.push({
      id: text(objective.objective_id) || `objective-${index + 1}`,
      kind: "objective",
      title: `Objective ${index + 1}`,
      description: text(objective.description) || "Describe what the player must accomplish.",
      requirement,
      flagsBefore: before,
      flagsGained,
      flagsAfter: [...flags],
      rewards: {},
      warnings,
    });
  });

  const beforeCompletion = [...flags];
  completionFlags.forEach((flag) => flags.add(flag));
  const completionRewards = {
    xp_reward: quest.xp_reward,
    item_rewards: rows(quest.item_rewards),
    currency_rewards: rows(quest.currency_rewards),
    reputation_rewards: rows(quest.reputation_rewards),
  };
  const completionWarnings: string[] = [];
  if (completionFlags.length === 0) completionWarnings.push("Quest completion sets no flags, so it cannot directly unlock flag-gated content.");
  completionWarnings.forEach(addWarning);
  steps.push({
    id: "completion",
    kind: "completion",
    title: "Completion & Payoff",
    description: "Apply completion flags and quest rewards.",
    flagsBefore: beforeCompletion,
    flagsGained: completionFlags,
    flagsAfter: [...flags],
    rewards: completionRewards,
    warnings: completionWarnings,
  });

  return { steps, warnings: modelWarnings, producedFlags, completionRewards };
}

