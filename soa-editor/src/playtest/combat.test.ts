import { describe, expect, it } from "vitest";
import { mechanicSequence, pointInSector, pointToSegmentDistance, rayToArenaEdge } from "./combatMath";

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
        expect(mechanic.duration).toBeGreaterThanOrEqual(2.1);
        expect(mechanic.damage).toBeGreaterThan(0);
        expect(mechanic.instruction.length).toBeGreaterThan(10);
      }
    }
  });

  it("extends line telegraphs to the same arena edge used for collision", () => {
    expect(rayToArenaEdge({ x: 700, y: 250 }, { x: 300, y: 250 }, 900, 500, 8)).toEqual({ x: 8, y: 250 });
    const diagonal = rayToArenaEdge({ x: 450, y: 250 }, { x: 900, y: 500 }, 900, 500);
    expect(diagonal.x).toBe(900);
    expect(diagonal.y).toBe(500);
  });

  it("resolves a cleave as a directional sector rather than a full circle", () => {
    const origin = { x: 400, y: 250 };
    expect(pointInSector({ x: 500, y: 250 }, origin, 0, 140, Math.PI / 3)).toBe(true);
    expect(pointInSector({ x: 300, y: 250 }, origin, 0, 140, Math.PI / 3)).toBe(false);
    expect(pointInSector({ x: 560, y: 250 }, origin, 0, 140, Math.PI / 3)).toBe(false);
  });
});
