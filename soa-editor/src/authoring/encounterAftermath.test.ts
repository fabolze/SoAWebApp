import { describe, expect, it } from "vitest";
import { deriveEncounterAftermathRows } from "./encounterAftermath";

describe("deriveEncounterAftermathRows", () => {
  it("combines draft rewards, participants, and same-beat story consequences", () => {
    const rows = deriveEncounterAftermathRows({
      encounter: {
        id: "enc-1",
        participants: [{ character_id: "char-1", combat_side: "Hostile", contexts: ["Combat"] }],
        rewards: {
          xp: 40,
          items: [{ item_id: "item-1", quantity: 1 }],
          currencies: [{ currency_id: "currency-1", amount: 5 }],
          reputation: [{ faction_id: "faction-1", amount: -2 }],
          flags_set: ["flag-1"],
        },
      },
      characters: [{ id: "char-1", name: "Bandit Captain" }],
      items: [{ id: "item-1", name: "Signal Key" }],
      currencies: [{ id: "currency-1", name: "Gold" }],
      factions: [{ id: "faction-1", name: "City Watch" }],
      flags: [{ id: "flag-1", name: "Bridge Open" }],
      timelinePacket: {
        entity_tracks: {
          encounters: [{
            id: "adventure-link:enc-link",
            link_id: "enc-link",
            entity_kind: "encounter",
            entity_id: "enc-1",
            label: "Road Ambush",
            source_kind: "adventure_beat",
            source_id: "beat-1",
            source_label: "Bridge Fight",
          }],
          locations: [{
            id: "adventure-link:loc-link",
            link_id: "loc-link",
            entity_kind: "location",
            entity_id: "loc-1",
            label: "Bridge",
            source_kind: "adventure_beat",
            source_id: "beat-1",
            source_label: "Bridge Fight",
            role: "state",
            occurrence_kind: "consequence",
            change_type: "destroyed",
            state_label: "Destroyed",
            importance: "critical",
          }],
        },
      },
    });

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: "payoff", label: "XP", detail: "40" }),
      expect.objectContaining({ group: "payoff", label: "Signal Key", route: "/author/items/item-1/ecosystem" }),
      expect.objectContaining({ group: "payoff", label: "Bridge Open", detail: "Flag set" }),
      expect.objectContaining({ group: "participants", label: "Bandit Captain", detail: "Hostile / Combat" }),
      expect.objectContaining({ group: "story", label: "Bridge", detail: "Bridge Fight / Destroyed / critical" }),
    ]));
  });
});
