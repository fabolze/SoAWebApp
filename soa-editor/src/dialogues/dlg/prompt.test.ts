import { describe, expect, it } from "vitest";
import { buildDialoguePrompt } from "./prompt";

describe("dialogue prompt", () => {
  it("includes only selected context and forbids gameplay effects", () => {
    const prompt = buildDialoguePrompt("A quiet warning", [{ id: "1", name: "Mara", description: "Clipped voice" }]);
    expect(prompt).toContain("Mara"); expect(prompt).toContain("Clipped voice"); expect(prompt).toContain("Do not invent or attach requirements");
  });

  it("spells out the exact DLG/1 choice syntax and includes a valid example", () => {
    const prompt = buildDialoguePrompt("Choose whether to leave", [], "prose");
    expect(prompt).toContain('each written exactly ? "CHOICE TEXT" -> TARGET_LABEL');
    expect(prompt).toContain("Never add characters after ?, such as ?s.");
    expect(prompt).toContain("```dlg\n!DLG 1");
    expect(prompt).toContain('? "Leave" -> ending');
    expect(prompt.trimEnd().endsWith("every referenced label exists.")).toBe(true);
  });

  it("does not add DLG/1 syntax instructions to the outline phase", () => {
    const prompt = buildDialoguePrompt("Choose whether to leave", [], "outline");
    expect(prompt).not.toContain("```dlg");
    expect(prompt).not.toContain("CHOICE TEXT");
  });
});
