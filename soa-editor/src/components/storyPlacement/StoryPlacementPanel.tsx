import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  defaultPlacementDraft,
  label,
  placementDraftFromCanonicalLink,
  record,
  storyPlacementLinkPayload,
  text,
  type StoryPlacementDraft,
  type TrackKind,
} from "../../authoring/storyPlacement";
import { apiFetch } from "../../lib/api";
import type { EntryRecord } from "../../types/editorQol";
import { generateUlid } from "../../utils/generateId";
import BundleReview, { type BundleReviewResult } from "../authoring/BundleReview";
import ConsequenceComposer from "../authoring/ConsequenceComposer";
import EntityOccurrenceTrack from "./EntityOccurrenceTrack";
import LifecycleFields from "./LifecycleFields";
import PlacementTray from "./PlacementTray";
import StoryContextStrip from "./StoryContextStrip";
import { useEntityStoryPlacement } from "./useEntityStoryPlacement";

interface StoryPlacementPanelProps {
  entityKind: TrackKind;
  entityId: string;
  entityLabel: string;
  entity?: EntryRecord;
  enableCharacterConsequenceActions?: boolean;
  enableCrossEntityConsequenceActions?: boolean;
  storyPacket?: EntryRecord | null;
  onStoryPacketChange?: (packet: EntryRecord) => void;
}

type PlacementAction = "create" | "edit" | "remove";
type ReviewMode = PlacementAction;

export default function StoryPlacementPanel({ entityKind, entityId, entityLabel, entity, enableCharacterConsequenceActions = false, enableCrossEntityConsequenceActions = false, storyPacket, onStoryPacketChange }: StoryPlacementPanelProps) {
  const [createDraft, setCreateDraft] = useState<StoryPlacementDraft>(() => defaultPlacementDraft(generateUlid(), entityKind, entityId));
  const [editDraft, setEditDraft] = useState<StoryPlacementDraft | null>(null);
  const [originalLink, setOriginalLink] = useState<EntryRecord | null>(null);
  const [review, setReview] = useState<BundleReviewResult | null>(null);
  const [reviewAction, setReviewAction] = useState<ReviewMode | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showLifecycleFields, setShowLifecycleFields] = useState(false);
  const { packet, setPacket, error, loading, context } = useEntityStoryPlacement({ entityKind, entityId, entity, externalPacket: storyPacket });

  useEffect(() => {
    setCreateDraft(defaultPlacementDraft(generateUlid(), entityKind, entityId));
    setEditDraft(null);
    setOriginalLink(null);
    setReview(null);
    setReviewAction(null);
    setMutationError("");
    setShowLifecycleFields(false);
  }, [entityId, entityKind]);

  useEffect(() => {
    if (!createDraft.adventure_beat_id && context.beatOptions.length > 0) {
      setCreateDraft((current) => ({ ...current, adventure_beat_id: text(context.beatOptions[0].id) }));
    }
  }, [context.beatOptions, createDraft.adventure_beat_id]);

  const activeDraft = editDraft || createDraft;
  const editing = Boolean(editDraft && originalLink);

  const clearReview = () => {
    setReview(null);
    setReviewAction(null);
    setMutationError("");
  };

  const updateActiveDraft = (value: StoryPlacementDraft) => {
    if (editing) setEditDraft(value);
    else setCreateDraft(value);
    clearReview();
  };

  const beginEditing = (linkId: string) => {
    const link = context.canonicalLinks.get(linkId);
    if (!link || text(link.target_type) !== entityKind || text(link.target_id) !== entityId) return;
    const nextDraft = placementDraftFromCanonicalLink(link);
    if (!nextDraft) return;
    setOriginalLink(link);
    setEditDraft(nextDraft);
    setMutationError("");
    clearReview();
  };

  const cancelEditing = () => {
    setOriginalLink(null);
    setEditDraft(null);
    setMutationError("");
    clearReview();
  };

  const buildBundle = (candidate: StoryPlacementDraft, action: PlacementAction) => {
    if (action === "remove") {
      return {
        adventure_beats: [],
        adventure_beat_links: [],
        deletions: { adventure_beats: [], adventure_beat_links: originalLink ? [text(originalLink.id)] : [] },
      };
    }
    const payload = storyPlacementLinkPayload(candidate, action === "edit" ? originalLink || undefined : undefined);
    return {
      adventure_beats: [],
      adventure_beat_links: [{
        ...payload,
        ...(action === "edit" && originalLink ? { expected_previous: originalLink } : {}),
      }],
      deletions: { adventure_beats: [], adventure_beat_links: [] },
    };
  };

  const submitPlacement = async (action: PlacementAction, commit: boolean) => {
    const candidate = action === "create" ? createDraft : editDraft;
    if (!candidate || (action !== "create" && !originalLink)) return;
    setSaving(true);
    setMutationError("");
    try {
      const response = await apiFetch(`/api/ui/adventure-timeline/${commit ? "bundle" : "preview"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBundle(candidate, action)),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(text(record(payload).message, "Unable to save story placement."));
      if (commit) {
        const nextPacket = record(record(payload).packet);
        setPacket(nextPacket);
        onStoryPacketChange?.(nextPacket);
        if (action === "create") setCreateDraft(defaultPlacementDraft(generateUlid(), entityKind, entityId));
        setEditDraft(null);
        setOriginalLink(null);
        setReview(null);
        setReviewAction(null);
      } else {
        setReview(payload as BundleReviewResult);
        setReviewAction(action);
      }
    } catch (reason: unknown) {
      setMutationError(reason instanceof Error ? reason.message : "Unable to save story placement.");
    } finally {
      setSaving(false);
    }
  };

  const consequenceActionLabel = reviewAction === "remove" ? "Removal" : reviewAction === "edit" ? "Changes" : "Placement";
  const consequenceSectionEnabled = (enableCrossEntityConsequenceActions || (enableCharacterConsequenceActions && entityKind === "character"))
    && (entityKind === "character" || entityKind === "dialogue" || entityKind === "encounter");

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
      <EntityOccurrenceTrack occurrences={context.occurrences} timelines={context.timelines} arcs={context.arcs} entityKind={entityKind} onEditCanonicalLink={beginEditing} />
      <div className="mt-4 rounded border border-slate-200 p-3 dark:border-slate-800" data-testid={editing ? "story-placement-edit" : "story-placement-create"}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{editing ? "Edit Story Placement" : "Place In Story"}</h3>
            <p className="text-xs text-slate-500">{editing ? "Update this canonical beat link without changing the linked record." : "Attach this record to an existing adventure beat with lifecycle metadata."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {editing && <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-40 dark:border-slate-700" disabled={saving} onClick={cancelEditing}>Cancel Editing</button>}
            <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-40 dark:border-slate-700" disabled={!activeDraft.adventure_beat_id || saving} onClick={() => void submitPlacement(editing ? "edit" : "create", false)}>{editing ? "Preview Changes" : "Preview Placement"}</button>
          </div>
        </div>
        <BeatSelector
          value={activeDraft.adventure_beat_id}
          beatOptions={context.beatOptions}
          timelines={context.timelines}
          arcs={context.arcs}
          onChange={(adventure_beat_id) => updateActiveDraft({ ...activeDraft, adventure_beat_id })}
        />
        <div className="mt-3">
          <PlacementTray value={activeDraft} entityLabel={entityLabel} onChange={updateActiveDraft} />
        </div>
        <div className="mt-3">
          <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold dark:border-slate-700" onClick={() => setShowLifecycleFields((current) => !current)}>
            {showLifecycleFields ? "Hide Lifecycle Details" : "Edit Lifecycle Details"}
          </button>
          {showLifecycleFields && <div className="mt-3 rounded border border-slate-200 p-3 dark:border-slate-800">
            <LifecycleFields value={activeDraft} beatOptions={context.beatOptions} onChange={updateActiveDraft} />
          </div>}
        </div>
        {consequenceSectionEnabled && !editing && <div className="mt-4" data-testid="cross-entity-consequence">
          <ConsequenceComposer
            enableSourceConsequences={false}
            enableStoryConsequences
            storyAnchorKind={entityKind as "character" | "dialogue" | "encounter"}
            storyAnchorId={entityId}
            storyAnchorLabel={entityLabel}
            title="Cross-Entity Consequence"
            subtitle={`Place ${entityLabel} in a story beat and apply the consequence to a second explicit target.`}
            storyPacket={packet}
            onStoryPacketChange={(nextPacket) => {
              setPacket(nextPacket);
              onStoryPacketChange?.(nextPacket);
            }}
          />
        </div>}
        {editing && <button type="button" className="mt-3 rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-40 dark:border-red-900 dark:text-red-200" disabled={saving} onClick={() => void submitPlacement("remove", false)}>Preview Removal</button>}
        {(review || mutationError) && <div className="mt-3"><BundleReview
          result={review}
          title="Story Placement Review"
          description="Preview validates this canonical beat link without writing it."
          variant="inline"
          commitLabel={`Commit ${consequenceActionLabel}`}
          cancelLabel="Close Review"
          saving={saving}
          error={mutationError}
          testId="story-placement-review"
          onCancel={clearReview}
          onCommit={() => reviewAction && void submitPlacement(reviewAction, true)}
        /></div>}
        {context.beatOptions.length === 0 && <p className="mt-3 rounded border border-dashed border-slate-300 p-2 text-xs text-slate-500 dark:border-slate-700">Create or commit an adventure beat in the Story Timeline before placing this record.</p>}
      </div>
    </div>}
  </section>;
}

function BeatSelector({
  value,
  beatOptions,
  timelines,
  arcs,
  onChange,
}: {
  value: string;
  beatOptions: EntryRecord[];
  timelines: Map<string, EntryRecord>;
  arcs: Map<string, EntryRecord>;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedBeat = beatOptions.find((beat) => text(beat.id) === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return beatOptions
      .filter((beat) => {
        if (!needle) return true;
        const arc = arcs.get(text(beat.story_arc_id));
        const timeline = timelines.get(text(beat.timeline_id));
        return [label(beat), label(arc, ""), label(timeline, ""), text(beat.id)]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((left, right) =>
        text(left.timeline_id).localeCompare(text(right.timeline_id))
        || text(left.story_arc_id).localeCompare(text(right.story_arc_id))
        || Number(left.sort_order ?? left.order ?? 0) - Number(right.sort_order ?? right.order ?? 0)
        || label(left).localeCompare(label(right))
      );
  }, [arcs, beatOptions, query, timelines]);
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; rows: EntryRecord[] }>();
    filtered.forEach((beat) => {
      const timeline = timelines.get(text(beat.timeline_id));
      const arc = arcs.get(text(beat.story_arc_id));
      const key = `${text(beat.timeline_id) || "unassigned"}:${text(beat.story_arc_id) || "unassigned"}`;
      const group = map.get(key) || {
        label: `${label(timeline, "Unassigned timeline")} / ${label(arc, "Unassigned arc")}`,
        rows: [],
      };
      group.rows.push(beat);
      map.set(key, group);
    });
    return [...map.entries()];
  }, [arcs, filtered, timelines]);

  return <div className="mt-3 rounded border border-slate-200 p-3 dark:border-slate-800" data-testid="story-beat-selector">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <div className="text-[10px] font-semibold uppercase text-slate-500">Adventure Beat</div>
        <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          {selectedBeat ? label(selectedBeat) : "Choose where this record matters."}
        </div>
      </div>
      <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{filtered.length} shown</span>
    </div>
    <input
      className="mt-3 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
      value={query}
      placeholder="Search beat, timeline, or arc..."
      onChange={(event) => setQuery(event.target.value)}
      aria-label="Search adventure beats"
    />
    <div className="mt-3 max-h-52 space-y-3 overflow-auto">
      {groups.map(([groupKey, group]) => <div key={groupKey}>
        <div className="mb-1 text-[10px] font-semibold uppercase text-slate-500">{group.label}</div>
        <div className="space-y-1">
          {group.rows.map((beat) => {
            const id = text(beat.id);
            const selected = id === value;
            return <button
              key={id}
              type="button"
              className={`block w-full rounded border px-2 py-1.5 text-left text-xs ${selected ? "border-blue-500 bg-blue-50 text-blue-950 dark:bg-blue-950 dark:text-blue-100" : "border-slate-200 hover:border-blue-300 dark:border-slate-800"}`}
              onClick={() => onChange(id)}
            >
              <span className="block font-semibold">{label(beat)}</span>
              {text(beat.summary, text(beat.description)) && <span className="mt-0.5 block truncate text-[10px] text-slate-500">{text(beat.summary, text(beat.description))}</span>}
            </button>;
          })}
        </div>
      </div>)}
      {filtered.length === 0 && <p className="rounded border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">No beats match this search.</p>}
    </div>
  </div>;
}
