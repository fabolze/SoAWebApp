import { describe, expect, it } from "vitest";
import {
  addCreationFlowStep, createCreationFlowDraft, createCreationFlowStep, creationFlowIssues,
  deriveStepSupport, getStableArtifactId, moveCreationFlowStep, normalizeCreationFlowDraft,
  patchCreationFlowStep, reconcileCreationFlowMentions, removeCreationFlowStep,
} from "./creationFlow";
import {
  draftsForOrigin, exportCreationFlowDraft, importCreationFlowDraft, listCreationFlowDrafts,
  loadCreationFlowDraft, readCreationFlowSnapshots, saveCreationFlowDraft, saveCreationFlowSnapshot,
} from "./creationFlowDraftStorage";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const origin = { ref: { kind: "dialogue" as const, canonicalId: "dialogue-1", label: "Mara" }, subRef: { kind: "dialogue_choice" as const, draftId: "node-1:choice:0", label: "Trade" } };

describe("Creation Flow draft", () => {
  it("creates, normalizes, and orders a versioned sequence", () => {
    let draft = createCreationFlowDraft({ title: "Trade then fight", origin, now: 10 });
    const shop = createCreationFlowStep("Open Mara's shop", "open_shop", { kind: "shop", canonicalId: "shop-1", label: "Mara's shop" });
    const fight = createCreationFlowStep("Start Portal Raiders", "encounter", { kind: "encounter", draftId: "placeholder-1", label: "Portal Raiders" });
    draft = addCreationFlowStep(draft, shop, 20);
    draft = addCreationFlowStep(draft, fight, 30);

    expect(draft.format).toBe("SOA-CREATION-FLOW/1");
    expect(draft.entryStepId).toBe(shop.id);
    expect(draft.transitions).toMatchObject([{ fromStepId: shop.id, toStepId: fight.id, trigger: "complete" }]);
    expect(draft.steps[0].support).toBe("runtime_unverified");
    expect(draft.steps[1].support).toBe("unresolved");
    expect(normalizeCreationFlowDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });

  it("re-derives support instead of trusting imported support", () => {
    const step = createCreationFlowStep("Do something", "unshaped");
    const draft = createCreationFlowDraft({ title: "Draft" });
    const normalized = normalizeCreationFlowDraft({ ...draft, steps: [{ ...step, kind: "custom", support: "compilable" }] });
    expect(normalized.steps[0].support).toBe("unsupported");
    expect(deriveStepSupport(normalized.steps[0])).toBe("unsupported");
  });

  it("patches targets, reorders linear transitions, and cleans removed links", () => {
    let draft = createCreationFlowDraft({ title: "Sequence" });
    const first = createCreationFlowStep("First", "dialogue");
    const second = createCreationFlowStep("Second", "note");
    draft = addCreationFlowStep(addCreationFlowStep(draft, first), second);
    draft = patchCreationFlowStep(draft, first.id, { target: { kind: "dialogue", canonicalId: "dlg" } });
    expect(draft.steps[0].support).toBe("compilable");
    draft = moveCreationFlowStep(draft, second.id, -1);
    expect(draft.steps.map((step) => step.id)).toEqual([second.id, first.id]);
    expect(draft.transitions[0]).toMatchObject({ fromStepId: second.id, toStepId: first.id });
    draft = removeCreationFlowStep(draft, second.id);
    expect(draft.transitions).toEqual([]);
    expect(draft.entryStepId).toBe(first.id);
  });

  it("keeps artifact ids stable and localizes unresolved issues", () => {
    const base = addCreationFlowStep(createCreationFlowDraft({ title: "Flow" }), createCreationFlowStep("Open it", "open_shop"));
    const first = getStableArtifactId(base, "step:shop:event");
    const second = getStableArtifactId(first.draft, "step:shop:event");
    expect(second.id).toBe(first.id);
    expect(creationFlowIssues(base).some((issue) => issue.stepId === base.steps[0].id && issue.severity === "warning")).toBe(true);
  });

  it("keeps prose mentions linked when unambiguous edits move them", () => {
    const mention = { id: "mention", placeholderId: "idea", start: 4, end: 14, text: "Ash Regent" };
    expect(reconcileCreationFlowMentions("The Ash Regent rose", "Long ago, the Ash Regent rose", [mention]))
      .toEqual([{ ...mention, start: 14, end: 24 }]);
    expect(reconcileCreationFlowMentions("The Ash Regent rose", "Nothing remains", [mention])).toEqual([]);
    expect(reconcileCreationFlowMentions("The Ash Regent rose", "Ash Regent met Ash Regent", [mention])).toEqual([]);
  });
});

describe("Creation Flow local persistence", () => {
  it("indexes drafts by origin and recovers snapshots", () => {
    const storage = new MemoryStorage();
    const first = createCreationFlowDraft({ title: "Mara follow-up", origin, now: 100 });
    const other = createCreationFlowDraft({ title: "Other", now: 200 });
    saveCreationFlowDraft(first, storage);
    saveCreationFlowDraft(other, storage);
    expect(listCreationFlowDrafts(storage).map((row) => row.title)).toEqual(["Other", "Mara follow-up"]);
    expect(draftsForOrigin(origin, storage).map((row) => row.id)).toEqual([first.id]);
    expect(loadCreationFlowDraft(first.id, storage)?.title).toBe("Mara follow-up");

    saveCreationFlowSnapshot({ id: "snap-1", name: "Before shaping", createdAt: 300, draft: first }, storage);
    expect(readCreationFlowSnapshots(first.id, storage)[0].name).toBe("Before shaping");
  });

  it("round-trips recovery JSON and rejects malformed imports", () => {
    const draft = createCreationFlowDraft({ title: "Recovery" });
    expect(importCreationFlowDraft(exportCreationFlowDraft(draft))).toEqual(draft);
    expect(() => importCreationFlowDraft("not json")).toThrow("not valid JSON");
    expect(() => importCreationFlowDraft('{"format":"SOA-CREATION-FLOW/99"}')).toThrow("Unsupported");
  });
});
