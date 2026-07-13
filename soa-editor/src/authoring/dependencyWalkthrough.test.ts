import { describe, expect, it } from "vitest";
import { buildDependencyWalkthrough, buildReachableTriggerSequence } from "./dependencyWalkthrough";

const index = {
  nodes: [
    { id: "flag:intro-done", kind: "flag", entry_id: "intro-done", label: "Intro Done", schema_name: "flags" },
    { id: "flag:has-key", kind: "flag", entry_id: "has-key", label: "Has Key", schema_name: "flags" },
    { id: "flag:alarm-raised", kind: "flag", entry_id: "alarm-raised", label: "Alarm Raised", schema_name: "flags" },
    { id: "requirement:req-start", kind: "requirement", entry_id: "req-start", label: "Start Ready", schema_name: "requirements" },
    { id: "requirement:req-key", kind: "requirement", entry_id: "req-key", label: "Key Ready", schema_name: "requirements" },
    { id: "quests:quest-1", kind: "quests", entry_id: "quest-1", label: "Find The Key", schema_name: "quests" },
    { id: "events:event-1", kind: "events", entry_id: "event-1", label: "Open Gate Event", schema_name: "events" },
    { id: "events:event-2", kind: "events", entry_id: "event-2", label: "Alarm Event", schema_name: "events" },
  ],
  edges: [
    { id: "flag:intro-done>required_by>requirement:req-start", source: "flag:intro-done", target: "requirement:req-start", relation: "required_by", explicit: true, path: "required_flags" },
    { id: "requirement:req-start>gates>quests:quest-1", source: "requirement:req-start", target: "quests:quest-1", relation: "gates", explicit: true, path: "requirements_id" },
    { id: "quests:quest-1>sets>flag:has-key", source: "quests:quest-1", target: "flag:has-key", relation: "sets", explicit: true, path: "flags_set_on_completion" },
    { id: "flag:has-key>required_by>requirement:req-key", source: "flag:has-key", target: "requirement:req-key", relation: "required_by", explicit: true, path: "required_flags" },
    { id: "flag:alarm-raised>forbidden_by>requirement:req-key", source: "flag:alarm-raised", target: "requirement:req-key", relation: "forbidden_by", explicit: true, path: "forbidden_flags" },
    { id: "requirement:req-key>gates>events:event-1", source: "requirement:req-key", target: "events:event-1", relation: "gates", explicit: true, path: "requirements_id" },
    { id: "events:event-2>sets>flag:alarm-raised", source: "events:event-2", target: "flag:alarm-raised", relation: "sets", explicit: true, path: "flags_set" },
  ],
  health: {},
};

describe("buildDependencyWalkthrough", () => {
  it("starts with no flags and reports blocked gates", () => {
    const model = buildDependencyWalkthrough(index, [], []);

    expect(model.triggers.map((trigger) => trigger.id)).toEqual(["events:event-2", "quests:quest-1"]);
    expect(model.steps).toHaveLength(1);
    expect(model.steps[0].blockedGates.map((gate) => gate.content.id)).toEqual(["quests:quest-1", "events:event-1"]);
    expect(model.steps[0].blockedGates[1].missingRequiredFlags).toContain("flag:has-key");
  });

  it("respects selected initial flags and opens matching gates", () => {
    const model = buildDependencyWalkthrough(index, ["flag:intro-done"], []);

    expect(model.steps[0].openGates.map((gate) => gate.content.id)).toEqual(["quests:quest-1"]);
    expect(model.steps[0].newlyOpenGates.map((gate) => gate.content.id)).toEqual(["quests:quest-1"]);
  });

  it("applies trigger sources in order and shows newly opened content", () => {
    const model = buildDependencyWalkthrough(index, ["flag:intro-done"], ["quests:quest-1"]);
    const triggerStep = model.steps[1];

    expect(triggerStep.flagsBefore).toEqual(["flag:intro-done"]);
    expect(triggerStep.flagsGained).toEqual(["flag:has-key"]);
    expect(triggerStep.flagsAfter).toEqual(["flag:intro-done", "flag:has-key"]);
    expect(triggerStep.newlyOpenGates.map((gate) => gate.content.id)).toEqual(["events:event-1"]);
  });

  it("blocks content when a forbidden flag is present", () => {
    const model = buildDependencyWalkthrough(index, ["flag:intro-done"], ["quests:quest-1", "events:event-2"]);
    const blockedGate = model.steps[2].blockedGates.find((gate) => gate.content.id === "events:event-1");

    expect(blockedGate?.presentForbiddenFlags).toEqual(["flag:alarm-raised"]);
    expect(blockedGate?.open).toBe(false);
  });

  it("auto-steps only sources reachable from the current temporary state", () => {
    expect(buildReachableTriggerSequence(index, [])).toEqual(["events:event-2"]);
    expect(buildReachableTriggerSequence(index, ["flag:intro-done"])).toEqual(["events:event-2", "quests:quest-1"]);
  });

  it("applies reputation rewards and opens reputation gates", () => {
    const reputationIndex = {
      ...index,
      nodes: [
        ...index.nodes,
        { id: "faction_reputation:wardens", kind: "faction_reputation", entry_id: "wardens", label: "Wardens", schema_name: "factions" },
        { id: "requirement:req-trusted", kind: "requirement", entry_id: "req-trusted", label: "Trusted", schema_name: "requirements" },
        { id: "events:event-3", kind: "events", entry_id: "event-3", label: "Warden Vault", schema_name: "events" },
      ],
      edges: [
        ...index.edges,
        { id: "quest-reputation", source: "quests:quest-1", target: "faction_reputation:wardens", relation: "grants_reputation", explicit: true, path: "reputation_rewards[0]", metadata: { faction_id: "wardens", amount: 12 } },
        { id: "reputation-gate", source: "faction_reputation:wardens", target: "requirement:req-trusted", relation: "reputation_required_by", explicit: true, path: "min_faction_reputation", metadata: { faction_id: "wardens", minimum: 10 } },
        { id: "trusted-event", source: "requirement:req-trusted", target: "events:event-3", relation: "gates", explicit: true, path: "requirements_id" },
      ],
    };

    const model = buildDependencyWalkthrough(reputationIndex, ["flag:intro-done"], ["quests:quest-1"]);

    expect(model.finalReputation).toEqual({ wardens: 12 });
    expect(model.steps[1].reputationGained[0]).toMatchObject({ factionId: "wardens", amount: 12 });
    expect(model.gates.find((gate) => gate.content.id === "events:event-3")?.open).toBe(true);
  });
});
