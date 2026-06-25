import { useEffect, useMemo, useState } from "react";
import {
  deriveEntityOccurrences,
  deriveStoryPlacementWarnings,
  mergeStoryPlacementWarnings,
  packetStoryPlacementWarnings,
  record,
  rows,
  text,
  type StoryOccurrence,
  type StoryPlacementWarning,
  type TrackKind,
} from "../../authoring/storyPlacement";
import { apiFetch } from "../../lib/api";
import type { EntryRecord } from "../../types/editorQol";

function catalogsByKind(packet: EntryRecord | null): Map<string, Map<string, EntryRecord>> {
  const catalogs = record(packet?.catalogs);
  const result = new Map<string, Map<string, EntryRecord>>();
  Object.entries(catalogs).forEach(([kind, value]) => {
    result.set(kind, new Map(rows(value).map((entry) => [text(entry.id), entry])));
  });
  return result;
}

export interface EntityStoryPlacementContext {
  timelines: Map<string, EntryRecord>;
  arcs: Map<string, EntryRecord>;
  beatOptions: EntryRecord[];
  catalogs: EntryRecord;
  existingLinks: EntryRecord[];
  canonicalLinks: Map<string, EntryRecord>;
  occurrences: StoryOccurrence[];
  warnings: StoryPlacementWarning[];
}

export function deriveEntityStoryPlacementContext({
  packet,
  entityKind,
  entityId,
  entity,
  localBeats = [],
}: {
  packet: EntryRecord | null;
  entityKind: TrackKind;
  entityId: string;
  entity?: EntryRecord;
  localBeats?: Parameters<typeof deriveEntityOccurrences>[0]["localBeats"];
}): EntityStoryPlacementContext {
  const timelines = new Map(rows(packet?.timelines).map((entry) => [text(entry.id), entry]));
  const arcs = new Map(rows(packet?.story_arcs).map((entry) => [text(entry.id), entry]));
  const beatOptions = rows(record(packet?.catalogs).adventure_beats);
  const catalogs = record(packet?.catalogs);
  const placementBeats = rows(packet?.placements)
    .filter((placement) => text(placement.kind) === "adventure_beat")
    .map((placement) => ({
      id: text(placement.entry_id),
      title: text(placement.label),
      timeline_id: text(placement.timeline_id),
      story_arc_id: text(placement.story_arc_id),
    }));
  const beatsById = new Map([...beatOptions, ...placementBeats].map((beat) => [text(beat.id), beat]));
  const existingLinks = rows(catalogs.adventure_beat_links);
  const canonicalLinks = new Map(existingLinks.map((link) => [text(link.id), link]));
  const occurrences = deriveEntityOccurrences({
    packet,
    placements: rows(packet?.placements),
    eventChains: rows(packet?.event_chains),
    catalogsByKind: catalogsByKind(packet),
    localBeats,
  }).filter((occurrence) => occurrence.entity_kind === entityKind && occurrence.entity_id === entityId);
  const warnings = mergeStoryPlacementWarnings(
    deriveStoryPlacementWarnings({ entityKind, entity, occurrences }),
    packetStoryPlacementWarnings(packet, entityKind, entityId),
  );
  return { timelines, arcs, beatOptions: [...beatsById.values()], catalogs, existingLinks, canonicalLinks, occurrences, warnings };
}

export function useEntityStoryPlacement({
  entityKind,
  entityId,
  entity,
  externalPacket,
  localBeats,
}: {
  entityKind: TrackKind;
  entityId: string;
  entity?: EntryRecord;
  externalPacket?: EntryRecord | null;
  localBeats?: Parameters<typeof deriveEntityOccurrences>[0]["localBeats"];
}) {
  const [internalPacket, setInternalPacket] = useState<EntryRecord | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!externalPacket);
  const packet = externalPacket === undefined ? internalPacket : externalPacket;

  useEffect(() => {
    if (externalPacket !== undefined) {
      setLoading(false);
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch("/api/ui/adventure-timeline")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(text(record(payload).message, "Unable to load story placements."));
        if (!cancelled) setInternalPacket(record(payload));
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load story placements.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [externalPacket]);

  const context = useMemo(() => deriveEntityStoryPlacementContext({
    packet,
    entityKind,
    entityId,
    entity,
    localBeats,
  }), [entity, entityId, entityKind, localBeats, packet]);

  return {
    packet,
    setPacket: setInternalPacket,
    error,
    loading,
    context,
  };
}
