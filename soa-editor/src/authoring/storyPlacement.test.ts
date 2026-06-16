import { describe, expect, it } from "vitest";
import {
  defaultPlacementDraft,
  deriveEntityOccurrences,
  deriveStoryPlacementWarnings,
  filterBackgroundOccurrences,
  parseEntityTrackOccurrences,
} from "./storyPlacement";
import type { EntryRecord } from "../types/editorQol";

const catalogsByKind: Map<string, Map<string, EntryRecord>> = new Map([
  ["locations", new Map<string, EntryRecord>([["loc-1", { id: "loc-1", name: "Old Mill" }]])],
  ["characters", new Map<string, EntryRecord>([["char-1", { id: "char-1", name: "Mira" }]])],
  ["items", new Map<string, EntryRecord>([["item-1", { id: "item-1", name: "Signal Key" }]])],
  ["dialogues", new Map<string, EntryRecord>([["dialogue-1", { id: "dialogue-1", title: "Gate Talk" }]])],
]);

describe("story placement occurrence helpers", () => {
  it("uses conservative lifecycle defaults by entity kind", () => {
    expect(defaultPlacementDraft("draft-1", "character", "char-1")).toEqual(expect.objectContaining({
      role: "cast",
      occurrence_kind: "appearance",
      change_type: "active",
      importance: "minor",
      continuity_group_id: "char-1",
    }));
    expect(defaultPlacementDraft("draft-2", "item", "item-1")).toEqual(expect.objectContaining({
      role: "reward",
      occurrence_kind: "reward",
      change_type: "obtained",
      importance: "major",
    }));
    expect(defaultPlacementDraft("draft-3", "encounter", "enc-1")).toEqual(expect.objectContaining({
      role: "runtime",
      occurrence_kind: "appearance",
      change_type: "active",
      importance: "major",
    }));
    expect(defaultPlacementDraft("draft-4", "dialogue", "dialogue-1")).toEqual(expect.objectContaining({
      role: "runtime",
      occurrence_kind: "appearance",
      change_type: "active",
      importance: "major",
    }));
  });

  it("warns when an important item has no story placement", () => {
    expect(deriveStoryPlacementWarnings({
      entityKind: "item",
      entity: { id: "item-1", name: "Signal Key", type: "Quest", rarity: "Rare", tags: [] },
      occurrences: [],
    })).toEqual([{
      id: "important-item-unplaced",
      severity: "warning",
      message: "Important item has no story placement.",
    }]);

    expect(deriveStoryPlacementWarnings({
      entityKind: "item",
      entity: { id: "item-1", name: "Signal Key", type: "Quest", rarity: "Rare", tags: [] },
      occurrences: [{ id: "occ-1", entity_kind: "item", entity_id: "item-1", label: "Signal Key", timeline_id: "", story_arc_id: "", source_kind: "adventure_beat", source_id: "beat-1", source_label: "Beat", order: 0 }],
    })).toEqual([]);
  });

  it("warns when stateful dialogues and important locations are unplaced", () => {
    expect(deriveStoryPlacementWarnings({
      entityKind: "dialogue",
      entity: { id: "dialogue-1", title: "Gate Talk", nodes: [{ id: "node-1", set_flags: ["gate_open"] }] },
      occurrences: [],
    })).toEqual([{
      id: "stateful-dialogue-unplaced",
      severity: "warning",
      message: "Dialogue changes story state but has no story placement.",
    }]);

    expect(deriveStoryPlacementWarnings({
      entityKind: "location",
      entity: { id: "loc-1", name: "Old Mill", place_kind: "Landmark", tags: [] },
      occurrences: [],
    })).toEqual([{
      id: "important-location-unplaced",
      severity: "warning",
      message: "Important location has no story placement.",
    }]);
  });

  it("parses canonical entity_tracks with lifecycle metadata", () => {
    const occurrences = parseEntityTrackOccurrences({
      entity_tracks: {
        locations: [
          {
            entity_id: "loc-1",
            label: "Old Mill",
            timeline_id: "timeline-1",
            story_arc_id: "arc-1",
            source_id: "beat-1",
            source_label: "Arrival",
            order: 2,
            role: "setting",
            occurrence_kind: "transition",
            change_type: "destroyed",
            state_label: "Ruined",
            importance: "critical",
          },
        ],
      },
    });

    expect(occurrences).toEqual([
      expect.objectContaining({
        entity_kind: "location",
        entity_id: "loc-1",
        source_kind: "adventure_beat",
        occurrence_kind: "transition",
        change_type: "destroyed",
        state_label: "Ruined",
        importance: "critical",
      }),
    ]);
  });

  it("derives occurrences from beat links, runtime events, character beats, and local planning beats", () => {
    const placements = [
      {
        id: "placement-character",
        kind: "character_story_beat",
        entry_id: "character-beat-1",
        label: "Mira Decides",
        timeline_id: "timeline-1",
        story_arc_id: "arc-1",
        order: 1,
        character: { entry_id: "char-1", label: "Mira" },
      },
      {
        id: "placement-adventure",
        kind: "adventure_beat",
        entry_id: "beat-1",
        label: "Find the Key",
        timeline_id: "timeline-1",
        story_arc_id: "arc-1",
        order: 2,
        attachments: [
          {
            id: "link-1",
            target_type: "item",
            target_id: "item-1",
            role: "reward",
            occurrence_kind: "reward",
            change_type: "obtained",
            importance: "major",
          },
          {
            id: "link-dialogue",
            target_type: "dialogue",
            target_id: "dialogue-1",
            role: "runtime",
            occurrence_kind: "appearance",
            change_type: "active",
            importance: "major",
          },
        ],
      },
      {
        id: "placement-event",
        kind: "adventure_beat",
        entry_id: "beat-2",
        label: "Mill Alarm",
        timeline_id: "timeline-1",
        story_arc_id: "arc-2",
        order: 3,
        source: { kind: "event", entry_id: "event-1" },
      },
    ];
    const eventChains = [
      {
        event_id: "event-1",
        label: "Alarm Rings",
        attachments: { location_id: "loc-1", dialogue_id: "dialogue-1" },
      },
    ];
    const localBeats = [
      {
        id: "local-1",
        title: "Draft Cast Moment",
        timeline_id: "timeline-1",
        story_arc_id: "arc-1",
        order: 4,
        attachments: [{ kind: "character", entry_id: "char-1", label: "Mira", role: "cast" }],
      },
    ];

    const occurrences = deriveEntityOccurrences({
      packet: null,
      placements,
      eventChains,
      catalogsByKind,
      localBeats,
    });

    expect(occurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "character-beat:character-beat-1:char-1",
        entity_kind: "character",
        source_kind: "character_story_beat",
        role: "cast",
      }),
      expect.objectContaining({
        entity_kind: "item",
        entity_id: "item-1",
        source_kind: "adventure_beat",
        role: "reward",
        occurrence_kind: "reward",
        change_type: "obtained",
      }),
      expect.objectContaining({
        entity_kind: "dialogue",
        entity_id: "dialogue-1",
        source_kind: "adventure_beat",
        role: "runtime",
      }),
      expect.objectContaining({
        entity_kind: "dialogue",
        entity_id: "dialogue-1",
        source_kind: "event",
        source_id: "event-1",
        story_arc_id: "arc-2",
        role: "runtime",
      }),
      expect.objectContaining({
        entity_kind: "location",
        entity_id: "loc-1",
        source_kind: "event",
        source_id: "event-1",
        story_arc_id: "arc-2",
        role: "runtime",
      }),
      expect.objectContaining({
        entity_kind: "character",
        entity_id: "char-1",
        source_kind: "local_beat",
        source_id: "local-1",
      }),
    ]));
  });

  it("filters background occurrences for navigator summaries", () => {
    const visible = filterBackgroundOccurrences([
      { id: "background", entity_kind: "item", entity_id: "item-1", label: "Signal Key", timeline_id: "", story_arc_id: "", source_kind: "adventure_beat", source_id: "beat-1", source_label: "Beat", order: 0, importance: "background" },
      { id: "major", entity_kind: "quest", entity_id: "quest-1", label: "Signal Quest", timeline_id: "", story_arc_id: "", source_kind: "adventure_beat", source_id: "beat-2", source_label: "Beat", order: 1, importance: "major" },
    ]);

    expect(visible.map((row) => row.id)).toEqual(["major"]);
  });
});
