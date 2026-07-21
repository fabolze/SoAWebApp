import { describe, expect, it } from "vitest";
import { bossPhase, combatRate, projectedVeteranDuration, riftFracture, TALENT_SKILLS, veteranItemEffects, veteranParty, veteranProfile, VETERAN_BOSS_HP, VETERAN_ENRAGE_SECONDS } from "./bossLabMath";

describe("veteran boss lab tuning", () => {
  it("targets a brisk ninety-to-one-hundred-fifty second clear for representative builds", () => {
    const damageSeconds = projectedVeteranDuration({ role: "damage", spec: "ranger", weaponId: "hunterBow", talents: ["steadyAim", "rapidNocking", "huntersMark"] });
    const healerSeconds = projectedVeteranDuration({ role: "healer", spec: "lifebinder", weaponId: "focusStaff", talents: ["renewingTouch", "livingCurrent", "verdantPulse"] });
    expect(damageSeconds).toBeGreaterThan(90);
    expect(damageSeconds).toBeLessThan(150);
    expect(healerSeconds).toBeGreaterThan(damageSeconds);
    expect(healerSeconds).toBeLessThan(150);
    expect(healerSeconds).toBeLessThan(VETERAN_ENRAGE_SECONDS);
  });

  it("changes weapon range and cadence through high-level talents", () => {
    const profile = veteranProfile({ role: "damage", spec: "ranger", weaponId: "hunterBow", talents: ["steadyAim", "rapidNocking", "twinShot"] });
    expect(profile.attackStyle).toBe("ranged");
    expect(profile.autoRange).toBe(485);
    expect(profile.autoInterval).toBeLessThan(1.6);
  });

  it("applies complete equipment stats and veteran-scaled set bonuses", () => {
    const loadout = { role: "tank" as const, spec: "vanguard" as const, weaponId: "riftwatchSpear", armorId: "fenwatchMantle", charmId: "pathfinderSeal", talents: [] };
    const profile = veteranProfile(loadout);
    const effects = veteranItemEffects(loadout);
    expect(profile.maxHp).toBe(376);
    expect(profile.armor).toBe(14);
    expect(effects.dodgeWard).toBe(45);
    expect(effects.partyWardMultiplier).toBe(1.5);
    expect(effects.damageMultiplier).toBe(1.15);
    expect(effects.labels.some((label) => label.includes("Regalia of the Lost Path (3)"))).toBe(true);
  });

  it("exposes unique powers and stable per-second combat rates", () => {
    expect(veteranItemEffects({ role: "healer", spec: "lifebinder", weaponId: "oathsplitter", armorId: "vowkeepersWrap", charmId: "resonanceCharm", talents: [] })).toMatchObject({ strikeCleave: .55, mendWard: 45, mendDamage: .45, primaryDamageMultiplier: 1.3, riftBoltDamage: 32 });
    expect(combatRate(999, 10)).toBe(100);
    expect(combatRate(50, 0)).toBe(50);
  });

  it("fills missing roles with adaptive companions", () => {
    expect(veteranParty("tank").map((companion) => companion.role)).toEqual(["damage", "healer", "damage"]);
    expect(veteranParty("healer").map((companion) => companion.role)).toContain("tank");
    expect(veteranParty("damage").map((companion) => companion.role)).toEqual(["tank", "healer", "damage"]);
    expect(veteranParty("damage").map((companion) => companion.attackDamage / companion.attackInterval).every((dps) => dps >= 14)).toBe(true);
    expect(veteranParty("damage").reduce((sum, companion) => sum + companion.attackDamage / companion.attackInterval, 0)).toBeGreaterThan(60);
    expect(veteranParty("damage").every((companion) => companion.attackRange >= 190)).toBe(true);
  });

  it("turns every veteran talent into a loadout-ready active skill", () => {
    expect(Object.keys(TALENT_SKILLS)).toHaveLength(24);
    expect(TALENT_SKILLS.dampenRift.detail).toContain("Cancel");
    expect(TALENT_SKILLS.commandingGuard.detail).toContain("party damage");
  });

  it("makes repeated mechanic failures progressively harder to heal through", () => {
    expect(riftFracture(0)).toEqual({ damageMultiplier: 1, healingMultiplier: 1 });
    expect(riftFracture(3).damageMultiplier).toBeCloseTo(1.66);
    expect(riftFracture(3).healingMultiplier).toBeCloseTo(.46);
    expect(riftFracture(6).healingMultiplier).toBe(.25);
  });

  it("advances phases at the intended health thresholds", () => {
    expect(bossPhase(VETERAN_BOSS_HP)).toBe(1);
    expect(bossPhase(VETERAN_BOSS_HP * .7)).toBe(2);
    expect(bossPhase(VETERAN_BOSS_HP * .35)).toBe(3);
  });
});
