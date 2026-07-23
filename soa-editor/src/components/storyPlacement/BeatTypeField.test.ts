import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ADVENTURE_BEAT_TYPE_INFO,
  adventureBeatTypeDescription,
} from "../../authoring/adventureBeatTypes";
import BeatTypeField from "./BeatTypeField";

describe("BeatTypeField", () => {
  it("keeps guidance for every canonical adventure beat type", () => {
    expect(ADVENTURE_BEAT_TYPE_INFO.map((type) => type.value)).toEqual([
      "Hook",
      "Introduction",
      "Discovery",
      "Decision",
      "Conflict",
      "Revelation",
      "Reversal",
      "Climax",
      "Recovery",
      "Payoff",
      "Other",
    ]);
    expect(ADVENTURE_BEAT_TYPE_INFO.every((type) => type.description.length > 40)).toBe(true);
  });

  it("shows the selected explanation and an expandable comparison guide", () => {
    const markup = renderToStaticMarkup(
      createElement(BeatTypeField, {
        value: "Reversal",
        onChange: () => undefined,
      }),
    );

    expect(markup).toContain(adventureBeatTypeDescription("Reversal"));
    expect(markup).toContain("Compare all beat types");
    expect(markup).toContain("primary narrative job");
    expect(markup.match(/<option/g)).toHaveLength(ADVENTURE_BEAT_TYPE_INFO.length);
  });
});
