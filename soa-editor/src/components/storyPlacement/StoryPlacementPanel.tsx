import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CROSS_ENTITY_CONSEQUENCE_TARGET_KINDS,
  buildCrossEntityConsequenceBundle,
  crossEntityConsequenceTargetOptions,
  defaultPlacementDraft,
  deriveEntityOccurrences,
  deriveStoryPlacementWarnings,
  label,
  mergeStoryPlacementWarnings,
  packetStoryPlacementWarnings,
  placementDraftFromCanonicalLink,
  record,
  rows,
  storyPlacementLinkPayload,
  text,
  type CrossEntityConsequenceTargetKind,
  type StoryPlacementDraft,
  type TrackKind,
} from "../../authoring/storyPlacement";
import { CROSS_ENTITY_CONSEQUENCE_PRESETS, applyStoryPlacementPreset, storyPlacementPresetIsActive } from "../../authoring/storyPlacementPresets";
import { apiFetch } from "../../lib/api";
import type { EntryRecord } from "../../types/editorQol";
import { generateUlid } from "../../utils/generateId";
import BundleReview, { type BundleReviewResult } from "../authoring/BundleReview";
import EntityOccurrenceTrack from "./EntityOccurrenceTrack";
import LifecycleFields from "./LifecycleFields";
import PlacementTray from "./PlacementTray";
import StoryContextStrip from "./StoryContextStrip";

interface StoryPlacementPanelProps {
  entityKind: TrackKind;
  entityId: string;
  entityLabel: string;
  entity?: EntryRecord;
  enableCharacterConsequenceActions?: boolean;
}

function catalogsByKind(packet: EntryRecord | null): Map<string, Map<string, EntryRecord>> {
  const catalogs = record(packet?.catalogs);
  const result = new Map<string, Map<string, EntryRecord>>();
  Object.entries(catalogs).forEach(([kind, value]) => {
    result.set(kind, new Map(rows(value).map((entry) => [text(entry.id), entry])));
  });
  return result;
}

type PlacementAction = "create" | "edit" | "remove";
type ReviewMode = PlacementAction | "cross-entity";

function title(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function StoryPlacementPanel({ entityKind, entityId, entityLabel, entity, enableCharacterConsequenceActions = false }: StoryPlacementPanelProps) {
  const [packet, setPacket] = useState<EntryRecord | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [createDraft, setCreateDraft] = useState<StoryPlacementDraft>(() => defaultPlacementDraft(generateUlid(), entityKind, entityId));
  const [editDraft, setEditDraft] = useState<StoryPlacementDraft | null>(null);
  const [originalLink, setOriginalLink] = useState<EntryRecord | null>(null);
  const [consequenceKind, setConsequenceKind] = useState<CrossEntityConsequenceTargetKind>("character");
  const [consequenceDraft, setConsequenceDraft] = useState<StoryPlacementDraft>(() => defaultPlacementDraft(generateUlid(), "character", ""));
  const [review, setReview] = useState<BundleReviewResult | null>(null);
  const [reviewAction, setReviewAction] = useState<ReviewMode | null>(null);
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
    setCreateDraft(defaultPlacementDraft(generateUlid(), entityKind, entityId));
    setEditDraft(null);
    setOriginalLink(null);
    setConsequenceKind("character");
    setConsequenceDraft(defaultPlacementDraft(generateUlid(), "character", ""));
    setReview(null);
    setReviewAction(null);
    setMutationError("");
  }, [entityId, entityKind]);

  const context = useMemo(() => {
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
      localBeats: [],
    }).filter((occurrence) => occurrence.entity_kind === entityKind && occurrence.entity_id === entityId);
    const warnings = mergeStoryPlacementWarnings(
      deriveStoryPlacementWarnings({ entityKind, entity, occurrences }),
      packetStoryPlacementWarnings(packet, entityKind, entityId),
    );
    return { timelines, arcs, beatOptions: [...beatsById.values()], catalogs, existingLinks, canonicalLinks, occurrences, warnings };
  }, [entity, entityId, entityKind, packet]);

  useEffect(() => {
    if (!createDraft.adventure_beat_id && context.beatOptions.length > 0) {
      setCreateDraft((current) => ({ ...current, adventure_beat_id: text(context.beatOptions[0].id) }));
    }
  }, [context.beatOptions, createDraft.adventure_beat_id]);

  useEffect(() => {
    if (!consequenceDraft.adventure_beat_id && context.beatOptions.length > 0) {
      setConsequenceDraft((current) => ({ ...current, adventure_beat_id: text(context.beatOptions[0].id) }));
    }
  }, [context.beatOptions, consequenceDraft.adventure_beat_id]);

  const activeDraft = editDraft || createDraft;
  const editing = Boolean(editDraft && originalLink);

  useEffect(() => {
    if (activeDraft.adventure_beat_id && consequenceDraft.adventure_beat_id !== activeDraft.adventure_beat_id) {
      setConsequenceDraft((current) => ({ ...current, adventure_beat_id: activeDraft.adventure_beat_id }));
    }
  }, [activeDraft.adventure_beat_id, consequenceDraft.adventure_beat_id]);

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

  const buildConsequenceBundle = () => buildCrossEntityConsequenceBundle({
    selectedCharacterId: entityId,
    selectedCharacterLabel: entityLabel,
    targetDraft: consequenceDraft,
    existingLinks: context.existingLinks,
    makeId: generateUlid,
  });

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
        setPacket(record(record(payload).packet));
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

  const submitConsequence = async (commit: boolean) => {
    const { bundle, error: bundleError } = buildConsequenceBundle();
    if (bundleError) {
      setMutationError(bundleError);
      setReview(null);
      setReviewAction("cross-entity");
      return;
    }
    setSaving(true);
    setMutationError("");
    try {
      const response = await apiFetch(`/api/ui/adventure-timeline/${commit ? "bundle" : "preview"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(text(record(payload).message, "Unable to save story consequence."));
      if (commit) {
        setPacket(record(record(payload).packet));
        setConsequenceDraft(defaultPlacementDraft(generateUlid(), consequenceKind, ""));
        setReview(null);
        setReviewAction(null);
      } else {
        setReview(payload as BundleReviewResult);
        setReviewAction("cross-entity");
      }
    } catch (reason: unknown) {
      setMutationError(reason instanceof Error ? reason.message : "Unable to save story consequence.");
    } finally {
      setSaving(false);
    }
  };

  const consequenceTargets = crossEntityConsequenceTargetOptions(consequenceKind, context.catalogs, entityId);
  const consequenceActionLabel = reviewAction === "cross-entity" ? "Consequence" : reviewAction === "remove" ? "Removal" : reviewAction === "edit" ? "Changes" : "Placement";
  const consequenceSectionEnabled = enableCharacterConsequenceActions && entityKind === "character";

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
        <label className="mt-3 block text-[10px] font-semibold uppercase text-slate-500">Adventure Beat
          <select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs normal-case dark:border-slate-700 dark:bg-slate-950" value={activeDraft.adventure_beat_id} onChange={(event) => updateActiveDraft({ ...activeDraft, adventure_beat_id: event.target.value })}>
            {context.beatOptions.map((beat) => <option key={text(beat.id)} value={text(beat.id)}>{label(beat)}</option>)}
          </select>
        </label>
        <div className="mt-3">
          <PlacementTray value={activeDraft} entityLabel={entityLabel} onChange={updateActiveDraft} />
        </div>
        <div className="mt-3">
          <LifecycleFields value={activeDraft} beatOptions={context.beatOptions} onChange={updateActiveDraft} />
        </div>
        {consequenceSectionEnabled && !editing && <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950" data-testid="cross-entity-consequence">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Cross-Entity Consequence</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">Place {entityLabel} in this beat and apply the consequence to a second explicit target.</p>
            </div>
            <button type="button" className="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-semibold disabled:opacity-40 dark:border-amber-800 dark:bg-slate-950" disabled={saving || !consequenceDraft.adventure_beat_id || !consequenceDraft.target_id} onClick={() => void submitConsequence(false)}>Preview Consequence</button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="block text-[10px] font-semibold uppercase text-slate-500">Target Type
              <select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs normal-case dark:border-slate-700 dark:bg-slate-950" value={consequenceKind} onChange={(event) => {
                const nextKind = event.target.value as CrossEntityConsequenceTargetKind;
                setConsequenceKind(nextKind);
                setConsequenceDraft(defaultPlacementDraft(generateUlid(), nextKind, "", consequenceDraft.adventure_beat_id));
                clearReview();
              }}>
                {CROSS_ENTITY_CONSEQUENCE_TARGET_KINDS.map((kind) => <option key={kind} value={kind}>{title(kind)}</option>)}
              </select>
            </label>
            <label className="block text-[10px] font-semibold uppercase text-slate-500 sm:col-span-2">Explicit Target
              <select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs normal-case dark:border-slate-700 dark:bg-slate-950" value={consequenceDraft.target_id} onChange={(event) => {
                setConsequenceDraft({ ...consequenceDraft, target_id: event.target.value, continuity_group_id: event.target.value });
                clearReview();
              }}>
                <option value="">Choose target</option>
                {consequenceTargets.map((target) => <option key={text(target.id)} value={text(target.id)}>{label(target)}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CROSS_ENTITY_CONSEQUENCE_PRESETS[consequenceKind].map((preset) => {
              const activePreset = storyPlacementPresetIsActive(consequenceDraft, preset);
              return <button
                key={preset.id}
                type="button"
                className={`rounded border p-2 text-left text-xs transition ${activePreset ? "border-amber-600 bg-white text-amber-950 ring-2 ring-amber-200 dark:bg-slate-950 dark:text-amber-100 dark:ring-amber-900" : "border-amber-200 bg-white hover:border-amber-400 dark:border-amber-900 dark:bg-slate-950"}`}
                onClick={() => {
                  setConsequenceDraft(applyStoryPlacementPreset(consequenceDraft, preset));
                  clearReview();
                }}
                data-testid={`cross-entity-preset-${preset.id}`}
              >
                <span className="block font-semibold">{preset.label}</span>
                <span className="mt-1 block text-[10px] text-slate-500">{preset.note}</span>
              </button>;
            })}
          </div>
          <div className="mt-3">
            <LifecycleFields value={consequenceDraft} beatOptions={context.beatOptions} onChange={(value) => { setConsequenceDraft(value); clearReview(); }} />
          </div>
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
          onCommit={() => reviewAction === "cross-entity" ? void submitConsequence(true) : reviewAction && void submitPlacement(reviewAction, true)}
        /></div>}
        {context.beatOptions.length === 0 && <p className="mt-3 rounded border border-dashed border-slate-300 p-2 text-xs text-slate-500 dark:border-slate-700">Create an adventure beat in the Story Timeline before placing this record.</p>}
      </div>
    </div>}
  </section>;
}
