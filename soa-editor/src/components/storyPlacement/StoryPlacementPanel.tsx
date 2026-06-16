import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  defaultPlacementDraft,
  deriveEntityOccurrences,
  deriveStoryPlacementWarnings,
  label,
  record,
  rows,
  text,
  type StoryPlacementDraft,
  type TrackKind,
} from "../../authoring/storyPlacement";
import { apiFetch } from "../../lib/api";
import type { EntryRecord } from "../../types/editorQol";
import { generateUlid } from "../../utils/generateId";
import EntityOccurrenceTrack from "./EntityOccurrenceTrack";
import LifecycleFields from "./LifecycleFields";
import PlacementTray from "./PlacementTray";
import StoryContextStrip from "./StoryContextStrip";

interface StoryPlacementPanelProps {
  entityKind: TrackKind;
  entityId: string;
  entityLabel: string;
  entity?: EntryRecord;
}

function catalogsByKind(packet: EntryRecord | null): Map<string, Map<string, EntryRecord>> {
  const catalogs = record(packet?.catalogs);
  const result = new Map<string, Map<string, EntryRecord>>();
  Object.entries(catalogs).forEach(([kind, value]) => {
    result.set(kind, new Map(rows(value).map((entry) => [text(entry.id), entry])));
  });
  return result;
}

function blockers(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item : text(record(item).message, text(record(item).id))).filter(Boolean)
    : [];
}

export default function StoryPlacementPanel({ entityKind, entityId, entityLabel, entity }: StoryPlacementPanelProps) {
  const [packet, setPacket] = useState<EntryRecord | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<StoryPlacementDraft>(() => defaultPlacementDraft(generateUlid(), entityKind, entityId));
  const [review, setReview] = useState<EntryRecord | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch("/api/ui/adventure-timeline")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(text(record(payload).message, "Unable to load story placements."));
        if (!cancelled) setPacket(record(payload));
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
  }, []);

  useEffect(() => {
    setDraft(defaultPlacementDraft(generateUlid(), entityKind, entityId));
    setReview(null);
    setMutationError("");
  }, [entityId, entityKind]);

  const context = useMemo(() => {
    const timelines = new Map(rows(packet?.timelines).map((entry) => [text(entry.id), entry]));
    const arcs = new Map(rows(packet?.story_arcs).map((entry) => [text(entry.id), entry]));
    const beatOptions = rows(record(packet?.catalogs).adventure_beats);
    const placementBeats = rows(packet?.placements)
      .filter((placement) => text(placement.kind) === "adventure_beat")
      .map((placement) => ({
        id: text(placement.entry_id),
        title: text(placement.label),
        timeline_id: text(placement.timeline_id),
        story_arc_id: text(placement.story_arc_id),
      }));
    const beatsById = new Map([...beatOptions, ...placementBeats].map((beat) => [text(beat.id), beat]));
    const occurrences = deriveEntityOccurrences({
      packet,
      placements: rows(packet?.placements),
      eventChains: rows(packet?.event_chains),
      catalogsByKind: catalogsByKind(packet),
      localBeats: [],
    }).filter((occurrence) => occurrence.entity_kind === entityKind && occurrence.entity_id === entityId && occurrence.importance !== "background");
    const warnings = deriveStoryPlacementWarnings({ entityKind, entity, occurrences });
    return { timelines, arcs, beatOptions: [...beatsById.values()], occurrences, warnings };
  }, [entity, entityId, entityKind, packet]);

  useEffect(() => {
    if (!draft.adventure_beat_id && context.beatOptions.length > 0) {
      setDraft((current) => ({ ...current, adventure_beat_id: text(context.beatOptions[0].id) }));
    }
  }, [context.beatOptions, draft.adventure_beat_id]);

  const buildBundle = (candidate: StoryPlacementDraft) => ({
    adventure_beats: [],
    adventure_beat_links: [{
      ...candidate,
      state_label: candidate.state_label || "",
      starts_at_beat_id: candidate.starts_at_beat_id || "",
      ends_at_beat_id: candidate.ends_at_beat_id || "",
      continuity_group_id: candidate.continuity_group_id || "",
      notes: candidate.notes || "",
      tags: candidate.tags || [],
    }],
    deletions: { adventure_beats: [], adventure_beat_links: [] },
  });

  const submitPlacement = async (commit: boolean) => {
    setSaving(true);
    setMutationError("");
    try {
      const response = await apiFetch(`/api/ui/adventure-timeline/${commit ? "bundle" : "preview"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBundle(draft)),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(text(record(payload).message, "Unable to save story placement."));
      if (commit) {
        setPacket(record(record(payload).packet));
        setDraft(defaultPlacementDraft(generateUlid(), entityKind, entityId));
        setReview(null);
      } else {
        setReview(record(payload));
      }
    } catch (reason: unknown) {
      setMutationError(reason instanceof Error ? reason.message : "Unable to save story placement.");
    } finally {
      setSaving(false);
    }
  };

  const reviewBlockers = blockers(review?.blockers);
  const reviewWarnings = rows(review?.warnings);

  return <section className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900" data-testid="story-placement-panel">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="font-semibold">Story Placement</h2>
        <p className="text-xs text-slate-500">{entityLabel} across adventure beats, runtime events, and character beats.</p>
      </div>
      <Link className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold dark:border-slate-700" to={`/author/story-timeline?track=${encodeURIComponent(entityKind)}&entity=${encodeURIComponent(entityId)}`}>Open Timeline</Link>
    </div>
    {loading && <p className="mt-3 text-xs text-slate-500">Loading story placements...</p>}
    {error && <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">{error}</p>}
    {!loading && !error && <div className="mt-3 space-y-2">
      <StoryContextStrip packet={packet} entityKind={entityKind} entityId={entityId} occurrences={context.occurrences} warnings={context.warnings} />
      {context.warnings.map((warning) => <p key={warning.id} className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">{warning.message}</p>)}
      <EntityOccurrenceTrack occurrences={context.occurrences} timelines={context.timelines} arcs={context.arcs} entityKind={entityKind} />
      <div className="mt-4 rounded border border-slate-200 p-3 dark:border-slate-800" data-testid="story-placement-create">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Place In Story</h3>
            <p className="text-xs text-slate-500">Attach this record to an existing adventure beat with lifecycle metadata.</p>
          </div>
          <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-40 dark:border-slate-700" disabled={!draft.adventure_beat_id || saving} onClick={() => void submitPlacement(false)}>Preview Placement</button>
        </div>
        <label className="mt-3 block text-[10px] font-semibold uppercase text-slate-500">Adventure Beat
          <select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs normal-case dark:border-slate-700 dark:bg-slate-950" value={draft.adventure_beat_id} onChange={(event) => { setDraft((current) => ({ ...current, adventure_beat_id: event.target.value })); setReview(null); }}>
            {context.beatOptions.map((beat) => <option key={text(beat.id)} value={text(beat.id)}>{label(beat)}</option>)}
          </select>
        </label>
        <div className="mt-3">
          <PlacementTray value={draft} entityLabel={entityLabel} onChange={(value) => { setDraft(value); setReview(null); }} />
        </div>
        <div className="mt-3">
          <LifecycleFields value={draft} beatOptions={context.beatOptions} onChange={(value) => { setDraft(value); setReview(null); }} />
        </div>
        {mutationError && <p className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">{mutationError}</p>}
        {review && <div className="mt-3 rounded border border-fuchsia-300 bg-fuchsia-50 p-2 text-xs text-fuchsia-900 dark:border-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-100" data-testid="story-placement-review">
          <div className="font-semibold">Preview Ready</div>
          <div className="mt-1">{rows(record(review.review).created).length} created / {rows(record(review.review).changed).length} changed / {reviewWarnings.length} warning(s)</div>
          {reviewWarnings.map((warning) => <p key={`${text(warning.code)}:${text(warning.id)}`} className="mt-1">{text(warning.message)}</p>)}
          {reviewBlockers.map((blocker) => <p key={blocker} className="mt-1 text-red-700 dark:text-red-200">{blocker}</p>)}
          <button type="button" className="mt-2 rounded bg-fuchsia-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40" disabled={saving || reviewBlockers.length > 0} onClick={() => void submitPlacement(true)}>Commit Placement</button>
        </div>}
        {context.beatOptions.length === 0 && <p className="mt-3 rounded border border-dashed border-slate-300 p-2 text-xs text-slate-500 dark:border-slate-700">Create an adventure beat in the Story Timeline before placing this record.</p>}
      </div>
    </div>}
  </section>;
}
