import { describe, expect, it } from "vitest";
import { mechanicSequence, pointToSegmentDistance } from "./combatMath";

describe("party combat mechanics", () => {
  it("resolves line telegraphs against the finite attack lane", () => {
    const start = { x: 100, y: 100 };
    const end = { x: 500, y: 100 };
    expect(pointToSegmentDistance({ x: 280, y: 120 }, start, end)).toBe(20);
    expect(pointToSegmentDistance({ x: 280, y: 180 }, start, end)).toBe(80);
    expect(pointToSegmentDistance({ x: 600, y: 100 }, start, end)).toBe(100);
  });

  it("gives every encounter readable avoidable mechanics", () => {
    expect(mechanicSequence("forest").map((entry) => entry.kind)).toEqual(["line", "circle"]);
    expect(mechanicSequence("swamp").some((entry) => entry.kind === "raidwide")).toBe(true);
    expect(mechanicSequence("ruins").map((entry) => entry.kind)).toEqual(["line", "circle", "raidwide", "cleave"]);
    for (const location of ["forest", "swamp", "ruins"] as const) {
      for (const mechanic of mechanicSequence(location)) {
        expect(mechanic.duration).toBeGreaterThanOrEqual(1.8);
        expect(mechanic.damage).toBeGreaterThan(0);
      }
    }
  });
});
