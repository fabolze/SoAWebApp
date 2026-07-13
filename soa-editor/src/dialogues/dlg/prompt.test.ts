import { describe, expect, it } from "vitest";
import { buildDialoguePrompt } from "./prompt";

describe("dialogue prompt", () => {
  it("includes only selected context and forbids gameplay effects", () => {
    const prompt = buildDialoguePrompt("A quiet warning", [{ id: "1", name: "Mara", description: "Clipped voice" }]);
    expect(prompt).toContain("Mara"); expect(prompt).toContain("Clipped voice"); expect(prompt).toContain("Do not invent or attach requirements");
  });
});
