import { describe, expect, it } from "vitest";
import { buildQuestWalkthrough } from "./questWalkthrough";

describe("buildQuestWalkthrough", () => {
  it("steps through quest flags and payoff without persistence", () => {
    const model = buildQuestWalkthrough({
      quest: {
        id: "quest-1",
        description: "Find the gate.",
        requirements_id: "req-start",
        objectives: [
          { objective_id: "find-key", description: "Find the key.", requirements_id: "", flags_set: ["has-key"] },
          { objective_id: "open-gate", description: "Open the gate.", requirements_id: "req-key", flags_set: ["gate-open"] },
        ],
        flags_set_on_completion: ["quest-done"],
        xp_reward: 25,
        item_rewards: [{ item_id: "item-1", quantity: 1 }],
        currency_rewards: [],
        reputation_rewards: [],
      },
      requirements: [
        { id: "req-start", slug: "start", required_flags: ["intro-done"], forbidden_flags: [], min_faction_reputation: [] },
        { id: "req-key", slug: "key", required_flags: ["has-key"], forbidden_flags: [], min_faction_reputation: [] },
      ],
    }, ["intro-done"]);

    expect(model.steps).toHaveLength(4);
    expect(model.steps[0].requirement?.satisfied).toBe(true);
    expect(model.steps[1].flagsGained).toEqual(["has-key"]);
    expect(model.steps[2].requirement?.satisfied).toBe(true);
    expect(model.steps[3].flagsAfter).toEqual(["intro-done", "has-key", "gate-open", "quest-done"]);
    expect(model.completionRewards.item_rewards).toEqual([{ item_id: "item-1", quantity: 1 }]);
  });

  it("warns when quest order depends on later-produced state", () => {
    const model = buildQuestWalkthrough({
      quest: {
        id: "quest-1",
        description: "Loop.",
        requirements_id: "req-start",
        objectives: [
          { objective_id: "blocked", description: "Blocked.", requirements_id: "req-later", flags_set: [] },
          { objective_id: "later", description: "Later.", requirements_id: "", flags_set: ["later-flag"] },
        ],
        flags_set_on_completion: ["quest-done"],
      },
      requirements: [
        { id: "req-start", slug: "start", required_flags: ["quest-done"], forbidden_flags: [], min_faction_reputation: [] },
        { id: "req-later", slug: "later", required_flags: ["later-flag"], forbidden_flags: [], min_faction_reputation: [{ faction_id: "faction-1", min: 10 }] },
      ],
    }, []);

    expect(model.warnings).toContain("Quest start requires its own completion flag quest-done.");
    expect(model.warnings).toContain("Objective requires later-flag, which is produced later in this quest.");
    expect(model.warnings).toContain("Reputation gates are shown but not simulated by temporary flag state.");
    expect(model.steps[1].requirement?.satisfied).toBe(false);
  });
});

