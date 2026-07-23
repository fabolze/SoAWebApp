import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthoringFilterBar, AuthoringHealthSummary, AuthoringPageShell, AuthoringPanel, AuthoringStatusChip, EmptyState, coerceNumberDraft, numberInputValue, textInputValue } from "./index";

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

  it("renders panel help, status, and collapsed summaries", () => {
    const markup = renderToStaticMarkup(
      createElement(
        AuthoringPanel,
        {
          title: "Story Placement",
          subtitle: "Timeline context",
          help: "Explains when this story beat matters.",
          status: createElement(AuthoringStatusChip, { tone: "warning" }, "1 warning"),
          collapsible: true,
          defaultCollapsed: true,
          collapsedSummary: "Runtime encounter placed after the intro.",
        },
        createElement("div", null, "Hidden detail"),
      ),
    );

    expect(markup).toContain("Story Placement");
    expect(markup).toContain("Timeline context");
    expect(markup).toContain("1 warning");
    expect(markup).toContain("Runtime encounter placed after the intro.");
    expect(markup).not.toContain("Hidden detail");
  });

  it("renders the shared full-width page shell", () => {
    const markup = renderToStaticMarkup(createElement(AuthoringPageShell, null, createElement("div", null, "Workspace")));

    expect(markup).toContain("min-h-full");
    expect(markup).toContain("w-full space-y-4");
    expect(markup).toContain("Workspace");
  });

  it("renders structured empty states with next-action copy", () => {
    const markup = renderToStaticMarkup(
      createElement(
        EmptyState,
        { title: "No story placement yet.", action: createElement("button", null, "Add Placement") },
        "That is fine while drafting; add one when timeline order matters.",
      ),
    );

    expect(markup).toContain("No story placement yet.");
    expect(markup).toContain("timeline order matters");
    expect(markup).toContain("Add Placement");
  });

  it("renders a consistent health summary with issue counts", () => {
    const markup = renderToStaticMarkup(createElement(AuthoringHealthSummary, { blockers: 2, warnings: 1, dirty: true }));
    expect(markup).toContain("Draft saved locally");
    expect(markup).toContain("2 blockers");
    expect(markup).toContain("1 warning");
    expect(markup).toContain("Authoring status");
  });

  it("renders issue and changed view filters with counts", () => {
    const markup = renderToStaticMarkup(createElement(AuthoringFilterBar, { value: "issues", issueCount: 3, changedCount: 4, onChange: () => undefined }));
    expect(markup).toContain("Show Issues (3)");
    expect(markup).toContain("Show Changed (4)");
    expect(markup).toContain('aria-pressed="true"');
  });
});
