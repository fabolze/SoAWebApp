import { describe, expect, it } from "vitest";
import {
  buildConsequenceComposerBundle,
  buildStoryConsequenceLinks,
  defaultStoryConsequenceDraft,
  normalizeConsequenceSource,
} from "./consequenceComposer";
import { defaultPlacementDraft } from "./storyPlacement";

describe("consequence composer helpers", () => {
  it("normalizes event consequence fields into the backend bundle shape", () => {
    const source = {
      id: "event-1",
      slug: "event-1",
      title: "Event",
      type: "Encounter",
      flags_set: ["flag-1"],
      item_rewards: [{ item_id: "item-1", quantity: 1 }],
      currency_rewards: null,
      reputation_rewards: undefined,
      next_event_id: "event-2",
      tags: ["Story"],
    };

    const bundle = buildConsequenceComposerBundle({
      sourceKind: "event",
      sourceDraft: source,
      expectedSource: { ...source, flags_set: [] },
    });

    expect(bundle.events).toEqual([
      expect.objectContaining({
        id: "event-1",
        flags_set: ["flag-1"],
        item_rewards: [{ item_id: "item-1", quantity: 1 }],
        currency_rewards: [],
        reputation_rewards: [],
        next_event_id: "event-2",
        expected_previous: expect.objectContaining({ flags_set: [] }),
      }),
    ]);
    expect(bundle.encounters).toEqual([]);
  });

  it("normalizes encounter and quest outcome containers conservatively", () => {
    expect(normalizeConsequenceSource("encounter", {
      id: "enc-1",
      rewards: { xp: 5, items: [{ item_id: "item-1", quantity: 1 }], flags_set: ["flag-1"] },
      participants: null,
    })).toEqual(expect.objectContaining({
      participants: [],
      rewards: {
        xp: 5,
        items: [{ item_id: "item-1", quantity: 1 }],
        currencies: [],
        reputation: [],
        flags_set: ["flag-1"],
      },
    }));

    expect(normalizeConsequenceSource("quest", {
      id: "quest-1",
      objectives: null,
      flags_set_on_completion: ["flag-1"],
    })).toEqual(expect.objectContaining({
      objectives: [],
      flags_set_on_completion: ["flag-1"],
      item_rewards: [],
      currency_rewards: [],
      reputation_rewards: [],
    }));
  });

  it("builds story consequence links for explicit targets", () => {
    const targetDraft = {
      ...defaultPlacementDraft("target-link", "item", "item-1", "beat-1"),
      role: "reward",
      occurrence_kind: "reward",
      change_type: "obtained",
    } as const;

    const result = buildStoryConsequenceLinks({
      anchorKind: "encounter",
      anchorId: "enc-1",
      anchorLabel: "Ambush",
      targetDraft,
      existingLinks: [],
    });

    expect(result.error).toBe("");
    expect(result.links).toEqual([
      expect.objectContaining({ target_type: "encounter", target_id: "enc-1", role: "runtime" }),
      expect.objectContaining({ target_type: "item", target_id: "item-1", role: "reward" }),
    ]);
  });

  it("creates empty target drafts for supported story consequence targets", () => {
    expect(defaultStoryConsequenceDraft("location", "beat-1")).toEqual(expect.objectContaining({
      adventure_beat_id: "beat-1",
      target_type: "location",
      target_id: "",
    }));
  });
});
