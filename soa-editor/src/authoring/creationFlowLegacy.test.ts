import { describe, expect, it } from "vitest";
import {
  appendCreationFlowStep,
  classifyCreationFlowStep,
  createCreationFlowDraft,
  createCreationFlowStep,
  moveCreationFlowStep,
  normalizeCreationFlowDraft,
  removeCreationFlowStep,
  updateCreationFlowStep,
  validateCreationFlowDraft,
} from "./creationFlowLegacy";
import {
  exportCreationFlowDraft,
  findCreationFlowDrafts,
  importCreationFlowDraft,
  listCreationFlowDrafts,
  readCreationFlowDraft,
  readCreationFlowSnapshots,
  saveCreationFlowDraft,
  saveCreationFlowSnapshot,
  type StorageLike,
} from "./creationFlowDraftStorageLegacy";
import workflow1 from "./fixtures/creationFlow/workflow1-map-to-quest.json";
import workflow2 from "./fixtures/creationFlow/workflow2-expand-place.json";
import workflow3 from "./fixtures/creationFlow/workflow3-resume-faction.json";

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const origin = {
  ref: { kind: "dialogue" as const, canonicalId: "dialogue-1", label: "Mara" },
  subRef: { kind: "dialogue_node" as const, canonicalId: "node-1", label: "Trade" },
};

describe("Creation Flow draft contract", () => {
  it("creates, appends, reorders, reclassifies, and removes a local sequence", () => {
    let draft = createCreationFlowDraft({ title: "Mara aftermath", origin, now: 10 });
    const trade = createCreationFlowStep("Open Mara's shop now", "open_shop");
    const encounter = createCreationFlowStep("Start the raider encounter", "encounter");
    draft = appendCreationFlowStep(draft, trade, 11);
    draft = appendCreationFlowStep(draft, encounter, 12);

    expect(draft.entryStepId).toBe(trade.id);
    expect(draft.transitions).toEqual([expect.objectContaining({ fromStepId: trade.id, toStepId: encounter.id, trigger: "complete" })]);
    expect(draft.steps[0].support).toBe("runtime_unverified");
    expect(draft.steps[1].support).toBe("compilable");

    draft = moveCreationFlowStep(draft, encounter.id, -1, 13);
    expect(draft.steps.map((step) => step.id)).toEqual([encounter.id, trade.id]);
    expect(draft.transitions[0]).toEqual(expect.objectContaining({ fromStepId: encounter.id, toStepId: trade.id }));

    draft = updateCreationFlowStep(draft, trade.id, { targetResolution: "placeholder" }, 14);
    expect(draft.steps.find((step) => step.id === trade.id)?.support).toBe("unresolved");
    expect(validateCreationFlowDraft(draft)).toContainEqual(expect.objectContaining({ severity: "blocker", path: "steps[1].target" }));

    draft = removeCreationFlowStep(draft, encounter.id, 15);
    expect(draft.steps).toHaveLength(1);
    expect(draft.transitions).toEqual([]);
  });

  it("migrates the legacy capture shape and rejects unknown formats", () => {
    const migrated = normalizeCreationFlowDraft({
      format: "SOA-CREATION-FLOW/0",
      id: "flow-1",
      title: "Legacy",
      shape: "hybrid",
      nodes: [{ id: "step-1", text: "A note", kind: "note", targetResolution: "none" }],
    }, 50);
    expect(migrated.format).toBe("SOA-CREATION-FLOW/1");
    expect(migrated.revision).toBe(1);
    expect(migrated.steps[0]).toEqual(expect.objectContaining({ id: "step-1", support: "story_only" }));
    expect(() => normalizeCreationFlowDraft({ format: "SOA-CREATION-FLOW/99" })).toThrow(/Unsupported Creation Flow format/);
  });

  it("keeps local ideas independent from prose mentions", () => {
    const draft = normalizeCreationFlowDraft({
      ...createCreationFlowDraft({ title: "Place seed", shape: "constellation", now: 1 }),
      placeholders: [{ id: "idea-1", kind: "character", label: "Ash Regent" }],
      localNotes: [{ id: "note-1", text: "The Ash Regent vanished." }],
      mentions: [{ id: "mention-1", ideaId: "idea-1", noteId: "note-1", start: 4, end: 14, quotedText: "Ash Regent" }],
    });
    expect(validateCreationFlowDraft(draft)).toEqual([]);
    const withoutMention = normalizeCreationFlowDraft({ ...draft, mentions: [] });
    expect(withoutMention.placeholders).toEqual([expect.objectContaining({ id: "idea-1" })]);
  });

  it("reports current-record and new-contract support honestly", () => {
    expect(classifyCreationFlowStep({ kind: "story_placement", targetResolution: "none" }).support).toBe("compilable");
    expect(classifyCreationFlowStep({ kind: "gameplay_effect", targetResolution: "none" }).support).toBe("runtime_unverified");
    expect(classifyCreationFlowStep({ kind: "custom", targetResolution: "none" }).support).toBe("unsupported");
  });
});

describe("Creation Flow browser-local storage", () => {
  it("round-trips, searches by origin, exports, imports, and snapshots drafts", () => {
    const storage = new MemoryStorage();
    const draft = createCreationFlowDraft({ title: "Trade flow", origin, now: 100 });
    saveCreationFlowDraft(draft, storage);

    expect(readCreationFlowDraft(draft.id, storage)?.title).toBe("Trade flow");
    expect(listCreationFlowDrafts(storage)).toHaveLength(1);
    expect(findCreationFlowDrafts(origin, storage).map((entry) => entry.id)).toEqual([draft.id]);

    const exported = exportCreationFlowDraft(draft);
    const imported = importCreationFlowDraft(exported, storage);
    expect(imported.format).toBe("SOA-CREATION-FLOW/1");

    saveCreationFlowSnapshot(draft, "Before shaping", storage);
    expect(readCreationFlowSnapshots(draft.id, storage)).toEqual([expect.objectContaining({ name: "Before shaping" })]);
  });

  it("ignores corrupt local entries without losing healthy drafts", () => {
    const storage = new MemoryStorage();
    const draft = createCreationFlowDraft({ title: "Healthy", now: 1 });
    saveCreationFlowDraft(draft, storage);
    storage.setItem("soa.creation-flow.draft.corrupt", "{not-json");
    expect(listCreationFlowDrafts(storage).map((entry) => entry.title)).toEqual(["Healthy"]);
  });
});

describe("Creation Flow golden workflow fixtures", () => {
  it.each([
    ["W1", workflow1, "hybrid"],
    ["W2", workflow2, "constellation"],
    ["W3", workflow3, "hybrid"],
  ])("normalizes %s without losing its creative shape", (_name, fixture, shape) => {
    const draft = normalizeCreationFlowDraft(fixture);
    expect(draft.shape).toBe(shape);
    expect(draft.steps.length).toBeGreaterThan(4);
    expect(draft.origin?.ref.kind).toBe("location");
  });

  it("keeps W1 runtime order, W2 creative relations, and W3 placeholder blockers distinct", () => {
    const w1 = normalizeCreationFlowDraft(workflow1);
    const w2 = normalizeCreationFlowDraft(workflow2);
    const w3 = normalizeCreationFlowDraft(workflow3);
    expect(w1.transitions.length).toBeGreaterThan(4);
    expect(w2.transitions).toEqual([]);
    expect(w2.relations.length).toBeGreaterThan(2);
    expect(validateCreationFlowDraft(w3).filter((issue) => issue.severity === "blocker").length).toBeGreaterThan(0);
  });
});
