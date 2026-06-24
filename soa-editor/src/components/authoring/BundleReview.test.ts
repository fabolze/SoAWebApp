import { describe, expect, it } from "vitest";
import { normalizeBundleReview } from "./bundleReviewModel";

describe("normalizeBundleReview", () => {
  it("normalizes all supported change groups and optional details", () => {
    const result = normalizeBundleReview({
      review: {
        created: [{ table: "abilities", id: "ability-1" }],
        changed: [{ table: "combat_profiles", id: "profile-1", details: { abilities: { from: [], to: ["ability-1"] } } }],
        deleted: [],
        unlinked: [{ table: "character_story_beats", id: "beat-1" }],
      },
      warnings: [{ id: "warning-1", message: "Review this change." }],
      health_warnings: ["Coverage is incomplete."],
      blockers: [{ message: "A required field is missing." }],
    });

    expect(result.changes.created).toHaveLength(1);
    expect(result.changes.changed[0].details).toEqual({ abilities: { from: [], to: ["ability-1"] } });
    expect(result.changes.unlinked).toHaveLength(1);
    expect(result.warnings).toEqual([{ id: "warning-1", message: "Review this change." }]);
    expect(result.healthWarnings).toEqual(["Coverage is incomplete."]);
    expect(result.blockers).toEqual(["A required field is missing."]);
  });

  it("generates stable local identifiers for advisory warnings without ids", () => {
    const result = normalizeBundleReview({
      review: {},
      warnings: [{ code: "missing_intro", entry_id: "char-1", message: "No introduction." }],
    });

    expect(result.warnings).toEqual([{ id: "missing_intro:char-1:0", message: "No introduction." }]);
  });
});
