import { describe, expect, it } from "vitest";
import { buildItemJourneyModel } from "./itemJourney";

const storyPacket = {
  timelines: [{ id: "timeline-1", title: "Main Timeline" }],
  story_arcs: [{ id: "arc-1", title: "Gate Arc" }],
  entity_tracks: {
    items: [
      {
        id: "item-required",
        entity_kind: "item",
        entity_id: "item-1",
        label: "Signal Key",
        timeline_id: "timeline-1",
        story_arc_id: "arc-1",
        source_kind: "adventure_beat",
        source_id: "beat-1",
        source_label: "Gate Locked",
        order: 1,
        role: "requirement",
        occurrence_kind: "requirement",
        change_type: "active",
        importance: "major",
      },
      {
        id: "item-obtained",
        entity_kind: "item",
        entity_id: "item-1",
        label: "Signal Key",
        timeline_id: "timeline-1",
        story_arc_id: "arc-1",
        source_kind: "adventure_beat",
        source_id: "beat-3",
        source_label: "Chest Opened",
        order: 3,
        role: "reward",
        occurrence_kind: "reward",
        change_type: "obtained",
        importance: "major",
      },
    ],
    quests: [
      {
        id: "quest-start",
        entity_kind: "quest",
        entity_id: "quest-1",
        label: "Find The Key",
        timeline_id: "timeline-1",
        story_arc_id: "arc-1",
        source_kind: "adventure_beat",
        source_id: "beat-2",
        source_label: "Search Begins",
        order: 2,
        role: "player_journey",
        occurrence_kind: "appearance",
        change_type: "active",
        importance: "major",
      },
    ],
  },
};

describe("buildItemJourneyModel", () => {
  it("combines item lifecycle occurrences with acquisition sources", () => {
    const model = buildItemJourneyModel({
      item: { id: "item-1", name: "Signal Key", type: "Quest", rarity: "Rare", tags: [] },
      sources: {
        shop_inventory: [],
        combat_loot: [],
        quest_rewards: [{ owner_id: "quest-1", entry: { item_id: "item-1", quantity: 1 } }],
        encounter_rewards: [],
        event_rewards: [],
        poi_ids: [],
      },
      catalogs: {
        quests: [{ id: "quest-1", title: "Find The Key" }],
      },
    }, storyPacket);

    expect(model.storyOccurrenceCount).toBe(2);
    expect(model.sourceCount).toBe(1);
    expect(model.rows.map((row) => row.ownerLabel)).toContain("Find The Key");
    expect(model.rows.find((row) => row.sourceKind === "Quest Reward")?.placed).toBe(true);
  });

  it("warns when same-lane requirement appears before acquisition", () => {
    const model = buildItemJourneyModel({
      item: { id: "item-1", name: "Signal Key", type: "Quest", rarity: "Rare", tags: [] },
      sources: {
        shop_inventory: [],
        combat_loot: [],
        quest_rewards: [{ owner_id: "quest-1", entry: { item_id: "item-1", quantity: 1 } }],
        encounter_rewards: [],
        event_rewards: [],
        poi_ids: [],
      },
      catalogs: {
        quests: [{ id: "quest-1", title: "Find The Key" }],
      },
    }, storyPacket);

    expect(model.warnings).toContain("Gate Locked requires this item before any same-lane acquisition is visible.");
  });

  it("marks source owners without story context as unplaced", () => {
    const model = buildItemJourneyModel({
      item: { id: "item-1", name: "Signal Key", type: "Quest", rarity: "Rare", tags: [] },
      sources: {
        shop_inventory: [{ shop_id: "shop-1", item_id: "item-1", stock: 2 }],
        combat_loot: [],
        quest_rewards: [],
        encounter_rewards: [],
        event_rewards: [],
        poi_ids: [],
      },
      catalogs: {
        shops: [{ id: "shop-1", name: "Forge" }],
      },
    }, storyPacket);

    expect(model.unplacedSourceCount).toBe(1);
    expect(model.rows.find((row) => row.sourceKind === "Shop Inventory")).toEqual(expect.objectContaining({
      ownerLabel: "Forge",
      placed: false,
      lifecycle: "Unplaced",
    }));
    expect(model.warnings).toContain("1 acquisition source(s) are not placed in story context.");
  });

  it("estimates unplaced combat loot order from the linked character level", () => {
    const model = buildItemJourneyModel({
      item: { id: "item-1", name: "Signal Key", type: "Quest", rarity: "Rare", tags: [] },
      sources: {
        shop_inventory: [],
        combat_loot: [{ owner_id: "combat-1", entry: { item_id: "item-1", quantity: 1, drop_chance: 40 } }],
        quest_rewards: [],
        encounter_rewards: [],
        event_rewards: [],
        poi_ids: [],
      },
      catalogs: {
        combat_profiles: [{ id: "combat-1", character_id: "char-1", label: { name: "Gate Guard" } }],
        characters: [{ id: "char-1", name: "Gate Guard", level: 7 }],
      },
    }, storyPacket);

    const row = model.rows.find((entry) => entry.sourceKind === "Combat Loot");
    expect(row).toEqual(expect.objectContaining({
      placed: false,
      orderKind: "estimated",
      estimatedOrder: 7,
      progressionLabel: "Estimated character level 7",
    }));
    expect(row?.progressionHints).toContain("Character level 7");
    expect(model.estimatedSourceCount).toBe(1);
  });

  it("labels gated sources without treating them as ordered", () => {
    const model = buildItemJourneyModel({
      item: { id: "item-1", name: "Signal Key", type: "Quest", rarity: "Rare", tags: [] },
      sources: {
        shop_inventory: [{ shop_id: "shop-1", item_id: "item-1", requirements_id: "req-key", stock: 1 }],
        combat_loot: [],
        quest_rewards: [],
        encounter_rewards: [],
        event_rewards: [],
        poi_ids: [],
      },
      catalogs: {
        shops: [{ id: "shop-1", name: "Hidden Shop" }],
        requirements: [{ id: "req-key", slug: "requires-key" }],
      },
    }, storyPacket);

    const row = model.rows.find((entry) => entry.sourceKind === "Shop Inventory");
    expect(row).toEqual(expect.objectContaining({
      orderKind: "unknown",
      progressionLabel: "Gated source",
      gated: true,
    }));
    expect(row?.progressionHints).toContain("Gated by requires-key");
    expect(model.gatedSourceCount).toBe(1);
  });

  it("uses canonical owner story order before estimated source order", () => {
    const model = buildItemJourneyModel({
      item: { id: "item-1", name: "Signal Key", type: "Quest", rarity: "Rare", tags: [] },
      sources: {
        shop_inventory: [],
        combat_loot: [],
        quest_rewards: [{ owner_id: "quest-1", entry: { item_id: "item-1", quantity: 1 } }],
        encounter_rewards: [],
        event_rewards: [],
        poi_ids: [],
      },
      catalogs: {
        quests: [{ id: "quest-1", title: "Find The Key", requirements_id: "req-key" }],
        requirements: [{ id: "req-key", slug: "requires-key" }],
      },
    }, storyPacket);

    const row = model.rows.find((entry) => entry.sourceKind === "Quest Reward");
    expect(row).toEqual(expect.objectContaining({
      placed: true,
      orderKind: "canonical",
      order: 2,
      estimatedOrder: null,
      progressionLabel: "Canonical story order 2",
      gated: true,
    }));
  });
});
