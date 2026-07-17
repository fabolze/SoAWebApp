import { describe, expect, it } from "vitest";
import {
  addCreationFlowStep, changeCreationFlowShape, createCreationFlowDraft, createCreationFlowStep, creationFlowIssues,
  deriveStepSupport, duplicateCreationFlowStep, getStableArtifactId, insertCreationFlowStep,
  moveCreationFlowStep, normalizeCreationFlowDraft, patchCreationFlowStep,
  reconcileCreationFlowMentions, removeCreationFlowPlaceholder, removeCreationFlowStep,
  resolveCreationFlowPlaceholder,
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

  it("inserts and duplicates ideas without breaking the remaining linear sequence", () => {
    const first = createCreationFlowStep("First", "scripted_moment");
    const last = createCreationFlowStep("Last", "scripted_moment");
    const inserted = createCreationFlowStep("Inserted", "item_reward", { kind: "item", canonicalId: "item-1" });
    let draft = addCreationFlowStep(addCreationFlowStep(createCreationFlowDraft({ title: "Editable sequence" }), first), last);
    draft = insertCreationFlowStep(draft, inserted, 1, 100);
    expect(draft.steps.map((step) => step.text)).toEqual(["First", "Inserted", "Last"]);
    expect(draft.transitions.map((transition) => [transition.fromStepId, transition.toStepId])).toEqual([
      [first.id, inserted.id], [inserted.id, last.id],
    ]);
    draft = normalizeCreationFlowDraft({
      ...draft,
      transitions: [...draft.transitions, {
        id: "surviving-branch", fromStepId: first.id, toStepId: last.id,
        trigger: "condition", requirementId: "requirement-1", label: "Take the shortcut", sortOrder: 10,
      }],
    });

    draft = duplicateCreationFlowStep(draft, inserted.id, 110);
    expect(draft.steps.map((step) => step.text)).toEqual(["First", "Inserted", "Inserted", "Last"]);
    expect(draft.steps[2].id).not.toBe(inserted.id);
    expect(draft.steps[2].target).toEqual(inserted.target);

    const duplicateId = draft.steps[2].id;
    draft = removeCreationFlowStep(draft, inserted.id, 120);
    expect(draft.transitions.some((transition) => transition.fromStepId === first.id && transition.toStepId === duplicateId)).toBe(true);
    expect(draft.transitions).toContainEqual(expect.objectContaining({ id: "surviving-branch", requirementId: "requirement-1" }));
    expect(draft.transitions.some((transition) => transition.fromStepId === inserted.id || transition.toStepId === inserted.id)).toBe(false);
  });

  it("converts composition shapes without leaking or losing execution topology", () => {
    const first = createCreationFlowStep("First", "scripted_moment");
    const second = createCreationFlowStep("Second", "scripted_moment");
    const third = createCreationFlowStep("Third", "scripted_moment");
    let draft = addCreationFlowStep(addCreationFlowStep(addCreationFlowStep(
      createCreationFlowDraft({ title: "Shape conversion" }), first,
    ), second), third);
    draft = normalizeCreationFlowDraft({
      ...draft,
      transitions: [...draft.transitions, {
        id: "authored-outcome", fromStepId: first.id, toStepId: third.id,
        trigger: "condition", requirementId: "requirement-1", label: "Take the shortcut", sortOrder: 10,
      }],
    });

    draft = changeCreationFlowShape(draft, "constellation", 100);
    expect(draft.entryStepId).toBeUndefined();
    expect(draft.transitions).toEqual([expect.objectContaining({ id: "authored-outcome" })]);

    draft = changeCreationFlowShape(draft, "hybrid", 110);
    expect(draft.entryStepId).toBe(first.id);
    expect(draft.transitions).toContainEqual(expect.objectContaining({ id: "authored-outcome" }));
    expect(draft.transitions.filter((transition) => transition.trigger === "complete" && !transition.label)
      .map((transition) => [transition.fromStepId, transition.toStepId])).toEqual([
      [first.id, second.id], [second.id, third.id],
    ]);
  });

  it("promotes and safely removes a prose-linked idea identity", () => {
    const idea = createCreationFlowStep("Idea: Ashblade", "note", { kind: "item", draftId: "idea-1", label: "Ashblade" });
    idea.payload = { ideaPlaceholderId: "idea-1" };
    const relatedIdea = createCreationFlowStep("Idea: Old hero", "note", { kind: "character", draftId: "idea-2", label: "Old hero" });
    relatedIdea.payload = { ideaPlaceholderId: "idea-2" };
    const reward = createCreationFlowStep("Give the Ashblade", "item_reward", { kind: "item", draftId: "idea-1", label: "Ashblade" });
    let draft = normalizeCreationFlowDraft({
      ...createCreationFlowDraft({ title: "Linked ideas", shape: "constellation" }),
      steps: [idea, relatedIdea, reward],
      placeholders: [
        { id: "idea-1", kind: "item", label: "Ashblade" },
        { id: "idea-2", kind: "character", label: "Old hero" },
      ],
      relations: [{ id: "relation-1", fromStepId: idea.id, toStepId: relatedIdea.id, relation: "was carried by", resolution: "local_intent" }],
      localNotes: [{ id: "note-1", text: "The Ashblade vanished.", mentions: [{ id: "mention-1", placeholderId: "idea-1", start: 4, end: 12, text: "Ashblade" }] }],
    });

    draft = resolveCreationFlowPlaceholder(draft, "idea-1", { kind: "item", canonicalId: "item-1", label: "Tower Key" }, 100);
    expect(draft.placeholders[0].promotedCanonicalId).toBe("item-1");
    expect(draft.steps.filter((step) => step.target?.draftId === "idea-1").every((step) => step.target?.canonicalId === "item-1")).toBe(true);
    expect(creationFlowIssues(draft).filter((issue) => issue.placeholderId === "idea-1")).toEqual([]);

    draft = removeCreationFlowPlaceholder(draft, "idea-1", 110);
    expect(draft.placeholders.map((placeholder) => placeholder.id)).toEqual(["idea-2"]);
    expect(draft.steps.some((step) => step.id === idea.id)).toBe(false);
    expect(draft.steps.find((step) => step.id === reward.id)).toEqual(expect.objectContaining({ target: undefined, support: "unresolved" }));
    expect(draft.localNotes[0].mentions).toEqual([]);
    expect(draft.relations).toEqual([]);
  });

  it("keeps artifact ids stable and localizes unresolved issues", () => {
    const base = addCreationFlowStep(createCreationFlowDraft({ title: "Flow" }), createCreationFlowStep("Open it", "open_shop"));
    const first = getStableArtifactId(base, "step:shop:event");
    const second = getStableArtifactId(first.draft, "step:shop:event");
    expect(second.id).toBe(first.id);
    expect(creationFlowIssues(base).some((issue) => issue.stepId === base.steps[0].id && issue.severity === "warning")).toBe(true);
  });

  it("preserves typed gameplay actions and requires variant payload identity", () => {
    const actionStep = createCreationFlowStep("Cleanse the party", "gameplay_effect");
    actionStep.gameplayAction = {
      actionType: "remove_matching_statuses", target: { scope: "party" },
      removalMode: "cleanse", filter: { polarity: "Harmful", statusTag: "curse" },
    };
    const variantStep = createCreationFlowStep("Show the damaged gate", "activate_location_variant", { kind: "location", canonicalId: "gate" });
    let draft = addCreationFlowStep(createCreationFlowDraft({ title: "Typed state" }), actionStep);
    draft = addCreationFlowStep(draft, variantStep);
    const normalized = normalizeCreationFlowDraft(JSON.parse(JSON.stringify(draft)));
    expect(normalized.steps[0].gameplayAction).toEqual(actionStep.gameplayAction);
    expect(normalized.steps[0].support).toBe("runtime_unverified");
    expect(creationFlowIssues(normalized).some((issue) => issue.stepId === variantStep.id && issue.severity === "blocker")).toBe(true);
  });

  it("preserves typed transition ownership through normalization and reordering", () => {
    const first = createCreationFlowStep("Offer terms", "scripted_moment");
    const second = createCreationFlowStep("Accept terms", "scripted_moment");
    let draft = addCreationFlowStep(addCreationFlowStep(createCreationFlowDraft({ title: "Terms" }), first), second);
    draft = normalizeCreationFlowDraft({
      ...draft,
      transitions: [{
        id: "conditional", fromStepId: first.id, toStepId: second.id, trigger: "condition",
        requirementId: "requirement-1", sourceRefId: "choice-1", label: "Accept", sortOrder: 4,
      }],
    });
    expect(draft.transitions[0]).toMatchObject({ requirementId: "requirement-1", sourceRefId: "choice-1", label: "Accept", sortOrder: 4 });
    draft = moveCreationFlowStep(draft, second.id, -1);
    expect(draft.transitions.some((transition) => transition.id === "conditional")).toBe(true);
  });

  it("reports missing typed transition owners before canonical preview", () => {
    const first = createCreationFlowStep("Choose", "scripted_moment");
    const second = createCreationFlowStep("Continue", "scripted_moment");
    const base = addCreationFlowStep(addCreationFlowStep(createCreationFlowDraft({ title: "Branch" }), first), second);
    const conditionDraft = normalizeCreationFlowDraft({ ...base, transitions: [{ id: "condition", fromStepId: first.id, toStepId: second.id, trigger: "condition", sortOrder: 0 }] });
    expect(creationFlowIssues(conditionDraft)).toContainEqual(expect.objectContaining({ severity: "blocker", stepId: first.id, message: expect.stringContaining("canonical requirement") }));
    const choiceDraft = normalizeCreationFlowDraft({ ...base, transitions: [{ id: "choice", fromStepId: first.id, toStepId: second.id, trigger: "dialogue_choice", sortOrder: 0 }] });
    expect(creationFlowIssues(choiceDraft)).toContainEqual(expect.objectContaining({ severity: "blocker", stepId: first.id, message: expect.stringContaining("exact saved choice") }));
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
