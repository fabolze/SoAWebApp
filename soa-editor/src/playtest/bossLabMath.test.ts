import { describe, expect, it } from "vitest";
import { bossPhase, projectedVeteranDuration, veteranParty, veteranProfile, VETERAN_ENRAGE_SECONDS } from "./bossLabMath";

describe("veteran boss lab tuning", () => {
  it("targets a two-to-four minute clear for representative builds", () => {
    const damageSeconds = projectedVeteranDuration({ role: "damage", spec: "ranger", weaponId: "hunterBow", talents: ["steadyAim", "rapidNocking", "huntersMark"] });
    const healerSeconds = projectedVeteranDuration({ role: "healer", spec: "lifebinder", weaponId: "focusStaff", talents: ["renewingTouch", "livingCurrent", "verdantPulse"] });
    expect(damageSeconds).toBeGreaterThan(120);
    expect(healerSeconds).toBeGreaterThan(damageSeconds);
    expect(healerSeconds).toBeLessThan(VETERAN_ENRAGE_SECONDS);
  });

  it("changes weapon range and cadence through high-level talents", () => {
    const profile = veteranProfile({ role: "damage", spec: "ranger", weaponId: "hunterBow", talents: ["steadyAim", "rapidNocking", "twinShot"] });
    expect(profile.attackStyle).toBe("ranged");
    expect(profile.autoRange).toBe(485);
    expect(profile.autoInterval).toBeLessThan(1.6);
  });

  it("fills missing roles with adaptive companions", () => {
    expect(veteranParty("tank").map((companion) => companion.role)).toEqual(["damage", "healer", "damage"]);
    expect(veteranParty("healer").map((companion) => companion.role)).toContain("tank");
    expect(veteranParty("damage").filter((companion) => companion.role === "tank")).toHaveLength(2);
  });

  it("advances phases at the intended health thresholds", () => {
    expect(bossPhase(18_000)).toBe(1);
    expect(bossPhase(12_600)).toBe(2);
    expect(bossPhase(6_300)).toBe(3);
  });
});
