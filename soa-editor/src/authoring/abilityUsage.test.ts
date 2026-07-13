import { describe, expect, it } from "vitest";
import { buildAbilityRhythmSegments, buildAbilityUsageModel } from "./abilityUsage";

describe("ability usage authoring helpers", () => {
  it("separates persisted usage from draft combat profile assignment", () => {
    const model = buildAbilityUsageModel({
      ability: { id: "ability-1", name: "Finisher", tags: ["signature"] },
      usage: {
        combat_profiles: [{ id: "profile-old", name: "Persisted User" }],
        characterclasses: [{ id: "class-1", name: "Duelist" }],
        talent_nodes: [],
      },
      assignedProfileIds: ["profile-new"],
      profiles: [
        { id: "profile-old", character_id: "char-old", character: { id: "char-old", name: "Old User" }, custom_abilities: ["ability-1"] },
        { id: "profile-new", character_id: "char-new", character: { id: "char-new", name: "New User" }, custom_abilities: [] },
      ],
      encounters: [],
    });

    expect(model.persistedUsageCount).toBe(2);
    expect(model.draftAssignmentCount).toBe(1);
    expect(model.profileRows.find((row) => row.profileId === "profile-old")?.changed).toBe(true);
    expect(model.profileRows.find((row) => row.profileId === "profile-new")?.changed).toBe(true);
    expect(model.warnings).toEqual([]);
  });

  it("maps encounter participants to combat profile assignment context without mutating encounters", () => {
    const model = buildAbilityUsageModel({
      ability: { id: "ability-1", name: "Howl" },
      usage: { combat_profiles: [], characterclasses: [], talent_nodes: [] },
      assignedProfileIds: ["profile-wolf"],
      profiles: [
        { id: "profile-wolf", character_id: "char-wolf", character: { id: "char-wolf", name: "Wolf" }, custom_abilities: [] },
      ],
      encounters: [
        {
          id: "encounter-1",
          name: "Forest Ambush",
          participants: [{ character_id: "char-wolf", combat_side: "Hostile", contexts: ["Combat"] }],
        },
      ],
    });

    expect(model.profileRows[0].assigned).toBe(true);
    expect(model.profileRows[0].encounterContexts).toEqual([
      { encounterId: "encounter-1", encounterLabel: "Forest Ambush", combatSide: "Hostile", contexts: ["Combat"] },
    ]);
    expect(model.encounterRoleRows[0]).toEqual(expect.objectContaining({
      encounterId: "encounter-1",
      encounterLabel: "Forest Ambush",
      characterId: "char-wolf",
      characterLabel: "Wolf",
      profileId: "profile-wolf",
      assigned: true,
      missingProfile: false,
    }));
  });

  it("flags encounter roles that cannot save through a combat profile", () => {
    const model = buildAbilityUsageModel({
      ability: { id: "ability-1", name: "Howl", tags: ["signature"] },
      usage: { combat_profiles: [], characterclasses: [], talent_nodes: [] },
      assignedProfileIds: [],
      profiles: [],
      encounters: [
        {
          id: "encounter-1",
          name: "Forest Ambush",
          participants: [{ character_id: "char-wolf", combat_side: "Hostile", contexts: ["Combat"] }],
        },
      ],
    });

    expect(model.encounterRoleRows[0]).toEqual(expect.objectContaining({
      characterId: "char-wolf",
      missingProfile: true,
      profileId: "",
      signatureAbility: true,
    }));
    expect(model.warnings).toContain("Some encounter participants cannot receive this ability because they have no combat profile.");
  });

  it("marks boss-like encounter roles for signature ability review", () => {
    const model = buildAbilityUsageModel({
      ability: { id: "ability-1", name: "Finale", tags: ["signature"] },
      usage: { combat_profiles: [], characterclasses: [], talent_nodes: [] },
      assignedProfileIds: ["profile-boss"],
      profiles: [
        { id: "profile-boss", character_id: "char-boss", character: { id: "char-boss", name: "Gate Tyrant" }, enemy_type: "boss", custom_abilities: [] },
      ],
      encounters: [
        {
          id: "encounter-1",
          name: "Gate Duel",
          participants: [{ character_id: "char-boss", combat_side: "Hostile", contexts: ["Boss"] }],
        },
      ],
    });

    expect(model.encounterRoleRows[0]).toEqual(expect.objectContaining({
      bossLike: true,
      signatureAbility: true,
      assigned: true,
    }));
  });

  it("warns when a signature ability has no profile assignment", () => {
    const model = buildAbilityUsageModel({
      ability: { id: "ability-1", name: "Howl", tags: ["signature"] },
      usage: { combat_profiles: [], characterclasses: [], talent_nodes: [] },
      assignedProfileIds: [],
      profiles: [],
      encounters: [],
    });

    expect(model.warnings).toContain("Ability is unused by combat profiles, classes, and talent nodes.");
    expect(model.warnings).toContain("Signature ability is not assigned to any combat profile.");
  });

  it("validates assigned targeting against modeled encounter sides", () => {
    const model = buildAbilityUsageModel({
      ability: { id: "ability-1", name: "Volley", targeting: "Enemies" },
      usage: { combat_profiles: [], characterclasses: [], talent_nodes: [] },
      assignedProfileIds: ["profile-archer"],
      profiles: [{ id: "profile-archer", character_id: "char-archer", character: { name: "Archer" }, custom_abilities: [] }],
      encounters: [{ id: "encounter-1", name: "Empty Range", participants: [{ character_id: "char-archer", combat_side: "Friendly", contexts: ["Combat"] }] }],
    });

    expect(model.encounterRoleRows[0].tacticalWarnings).toContain("No modeled opposing-side participant for this enemy-targeted ability.");
    expect(model.warnings).toContain("Empty Range / Archer: No modeled opposing-side participant for this enemy-targeted ability.");
  });

  it("warns when a signature ability misses a present boss role", () => {
    const model = buildAbilityUsageModel({
      ability: { id: "ability-1", name: "Finale", tags: ["signature"], targeting: "Self" },
      usage: { combat_profiles: [], characterclasses: [], talent_nodes: [] },
      assignedProfileIds: ["profile-minion"],
      profiles: [
        { id: "profile-boss", character_id: "char-boss", character: { name: "Boss" }, enemy_type: "boss", custom_abilities: [] },
        { id: "profile-minion", character_id: "char-minion", character: { name: "Minion" }, custom_abilities: [] },
      ],
      encounters: [{ id: "encounter-1", name: "Finale", participants: [{ character_id: "char-boss", combat_side: "Hostile" }, { character_id: "char-minion", combat_side: "Hostile" }] }],
    });

    expect(model.warnings).toContain("A boss-like encounter role exists, but this signature ability is not assigned to that role.");
  });
});

describe("ability rhythm authoring helpers", () => {
  it("derives cast, effect timing, status ticks, recovery, and cooldown", () => {
    const segments = buildAbilityRhythmSegments(
      {
        id: "ability-1",
        name: "Burning Shot",
        type: "Active",
        cast_time: 1,
        recovery_time: 2,
        cooldown: 3,
        effect_links: [
          { effect_id: "burn", phase: "Impact", turn_offset: 0 },
          { effect_id: "after", phase: "Aftermath", turn_offset: 1 },
        ],
      },
      [
        { id: "burn", name: "Burn", type: "Status", duration: 3, tick_interval: 1 },
        { id: "after", name: "Aftershock", type: "Damage" },
      ],
      [],
    );

    expect(segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "cast", kind: "cast", start: 0, end: 1 }),
      expect.objectContaining({ id: "effect-burn", kind: "effect", start: 1 }),
      expect.objectContaining({ id: "status-burn", kind: "status", start: 1, end: 4 }),
      expect.objectContaining({ id: "tick-burn-2", kind: "tick", start: 2 }),
      expect.objectContaining({ id: "effect-after", kind: "effect", start: 4 }),
      expect.objectContaining({ id: "recovery", kind: "recovery", start: 1, end: 3 }),
      expect.objectContaining({ id: "cooldown", kind: "cooldown", start: 3, end: 6 }),
    ]));
  });

  it("shows toggle upkeep and deactivate payloads", () => {
    const segments = buildAbilityRhythmSegments(
      {
        id: "ability-1",
        name: "Aura",
        type: "Toggle",
        upkeep_cost: 4,
        cooldown: 2,
        effect_links: [{ effect_id: "end", phase: "Deactivate", turn_offset: 0 }],
      },
      [{ id: "end", name: "Ending Pulse", type: "Damage" }],
      [],
    );

    expect(segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "upkeep", kind: "upkeep", label: "Upkeep 4 / turn" }),
      expect.objectContaining({ id: "effect-end", kind: "deactivate", phase: "Deactivate" }),
    ]));
  });
});
