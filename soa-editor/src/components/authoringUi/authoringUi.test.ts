import { describe, expect, it } from "vitest";
import { coerceNumberDraft, numberInputValue, textInputValue } from "./index";

describe("authoringUi field policies", () => {
  it("preserves text values exactly", () => {
    expect(textInputValue("First ")).toBe("First ");
    expect(textInputValue("  padded")).toBe("  padded");
    expect(textInputValue(null)).toBe("");
  });

  it("formats number input values without trimming or coercing blanks to zero", () => {
    expect(numberInputValue("1.")).toBe("1.");
    expect(numberInputValue(null)).toBe("");
    expect(numberInputValue("")).toBe("");
    expect(numberInputValue(0)).toBe("0");
  });

  it("commits cleared number drafts using the configured empty policy", () => {
    expect(coerceNumberDraft("", "zero")).toEqual({ shouldCommit: true, value: 0 });
    expect(coerceNumberDraft("", "null")).toEqual({ shouldCommit: true, value: null });
    expect(coerceNumberDraft("", "empty-string")).toEqual({ shouldCommit: true, value: "" });
  });

  it("commits valid number drafts and ignores invalid drafts", () => {
    expect(coerceNumberDraft("12.5", "zero")).toEqual({ shouldCommit: true, value: 12.5 });
    expect(coerceNumberDraft("12,5", "zero")).toEqual({ shouldCommit: true, value: 12.5 });
    expect(coerceNumberDraft("-", "zero")).toEqual({ shouldCommit: false, value: null });
  });
});
