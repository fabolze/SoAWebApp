import { describe, expect, it } from "vitest";
import { creationFlowReturnRoute } from "./draftInventory";

describe("creationFlowReturnRoute", () => {
  it("returns real authoring routes instead of internal workspace IDs", () => {
    expect(creationFlowReturnRoute({ workspace: "creation-flow" })).toBe("/author/creation-flow");
    expect(creationFlowReturnRoute({
      workspace: "dialogue-flow",
      context: { kind: "dialogue", canonicalId: "dlg/arrival" },
    })).toBe("/author/dialogues/dlg%2Farrival");
    expect(creationFlowReturnRoute({
      workspace: "world-builder",
      selectedId: "location:harbor",
    })).toBe("/author/world?selected=location%3Aharbor");
  });

  it("falls back safely when an older draft contains an unknown workspace", () => {
    expect(creationFlowReturnRoute({ workspace: "legacy-workspace" })).toBe("/author/creation-flow");
  });
});
