import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  creationFlowProvisionalItems,
  reorderCreationFlowProvisionalItems,
  setCreationFlowProvisionalPlacement,
  type CreationFlowDraft,
  type CreationFlowProvisionalItem,
  type CreationFlowProvisionalPlacement,
} from "../authoring/creationFlow";
import {
  listCreationFlowDrafts,
  loadCreationFlowDraft,
  saveCreationFlowDraft,
} from "../authoring/creationFlowDraftStorage";
import {
  deriveEntityOccurrences,
  filterBackgroundOccurrences,
  isTrackKind,
  label,
  placementDraftFromCanonicalLink,
  record,
  rows,
  singular,
  storyPlacementLinkPayload,
  STORY_TRACK_KINDS,
  text,
  type StoryOccurrence,
  type StoryPlacementDraft,
  type TrackKind,
} from "../authoring/storyPlacement";
import BundleReview, { type BundleReviewResult } from "../components/authoring/BundleReview";
import { AuthoringFilterBar, AuthoringHealthSummary, AuthoringPageShell, AuthoringPanel, EmptyState, StatusNotice, type AuthoringFilterMode } from "../components/authoringUi";
import BeatTypeField from "../components/storyPlacement/BeatTypeField";
import LifecycleFields from "../components/storyPlacement/LifecycleFields";
import { apiFetch } from "../lib/api";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import type { EntryRecord } from "../types/editorQol";
import { generateSlug, generateUlid } from "../utils/generateId";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950";
const PLAN_STORAGE_KEY = "soa.story-timeline.local-plan.v1";
const preferBeatCollision: CollisionDetection = (args) => {
  return pointerWithin(args).sort((left, right) => {
    const leftIsCard = String(left.id).startsWith("beat:") || String(left.id).startsWith("provisional:");
    const rightIsCard = String(right.id).startsWith("beat:") || String(right.id).startsWith("provisional:");
    return leftIsCard === rightIsCard ? 0 : leftIsCard ? -1 : 1;
  });
};

type Lens = "story" | "cast" | "locations" | "quests" | "runtime" | "state" | "issues";
type Selection = { kind: "placement" | "local-beat" | "provisional-idea" | "event" | "library"; id: string; libraryKind?: string } | null;

interface ProvisionalTimelineNode extends CreationFlowProvisionalItem {
  id: string;
  flowTitle: string;
  target: CreationFlowProvisionalPlacement["target"];
}

interface LocalAttachment {
  kind: string;
  entry_id: string;
  label: string;
  role: string;
}

interface LocalBeat {
  id: string;
  title: string;
  summary: string;
  beat_type: string;
  timeline_id: string;
  story_arc_id: string;
  order: number;
  attachments: LocalAttachment[];
}

interface LocalPlan {
  beats: LocalBeat[];
}

interface CanonicalLinkEdit {
  draft: StoryPlacementDraft;
  original: EntryRecord;
}

function loadProvisionalDrafts(): CreationFlowDraft[] {
  return listCreationFlowDrafts().flatMap((summary): CreationFlowDraft[] => {
    const draft = loadCreationFlowDraft(summary.id);
    return draft?.provisionalPlacement ? [draft] : [];
  });
}

function loadPlan(): LocalPlan {
  try {
    const value = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || "");
    if (value && Array.isArray(value.beats)) {
      return {
        beats: value.beats.map((beat: LocalBeat) => ({
          ...beat,
          beat_type: beat.beat_type || "Other",
          attachments: Array.isArray(beat.attachments) ? beat.attachments : [],
        })),
      };
    }
  } catch {
    // Invalid browser-local planning state is ignored.
  }
  return { beats: [] };
}

function entityRoute(kind: string, id: string): string {
  const encoded = encodeURIComponent(id);
  const authorRoutes: Record<string, string> = {
    quest: `/author/quests/${encoded}`,
    event: `/events?selected=${encoded}`,
    character: `/author/characters/${encoded}`,
    location: `/author/locations/${encoded}`,
    dialogue: `/author/dialogues/${encoded}`,
    encounter: `/author/encounters/${encoded}`,
    story_arc: `/story-arcs?selected=${encoded}`,
    timeline: `/timelines?selected=${encoded}`,
    character_story_beat: `/character-story-beats?selected=${encoded}`,
    adventure_beat: `/adventure-beats?selected=${encoded}`,
    lore_entry: `/lore-entries?selected=${encoded}`,
    item: `/author/items/${encoded}`,
    faction: `/factions?selected=${encoded}`,
  };
  return authorRoutes[kind] || "";
}

function attachmentRole(kind: string): string {
  const values: Record<string, string> = {
    location: "setting",
    character: "cast",
    quest: "player_journey",
    event: "runtime",
    dialogue: "runtime",
    encounter: "runtime",
    lore_entry: "reference",
    item: "reward",
    faction: "state",
  };
  return values[kind] || "reference";
}

function roleMatchesLens(role: string, lens: Lens): boolean {
  if (lens === "story" || lens === "issues") return true;
  if (lens === "cast") return role === "cast";
  if (lens === "locations") return role === "setting";
  if (lens === "quests") return role === "player_journey";
  if (lens === "runtime") return role === "runtime";
  if (lens === "state") return role === "state" || role === "reward";
  return false;
}

function placementMatchesLens(placement: EntryRecord, lens: Lens): boolean {
  const kind = text(placement.kind);
  if (lens === "story" || lens === "issues") return true;
  if (kind === "adventure_beat") {
    if (lens === "state") return true;
    return rows(placement.attachments).some((attachment) => roleMatchesLens(text(attachment.role), lens));
  }
  if (lens === "quests") return kind === "quest";
  if (lens === "cast") return kind === "character_story_beat";
  if (lens === "state") return kind === "quest" || kind === "character_story_beat";
  return false;
}

function localBeatMatchesLens(beat: LocalBeat, lens: Lens): boolean {
  if (lens === "story" || lens === "issues") return true;
  return beat.attachments.some((attachment) => roleMatchesLens(attachment.role, lens));
}

function provisionalIdeaMatchesLens(idea: ProvisionalTimelineNode, lens: Lens): boolean {
  if (lens === "story" || lens === "issues") return true;
  if (lens === "cast") return idea.kind === "character";
  if (lens === "locations") return idea.kind === "location" || idea.kind === "location_poi";
  if (lens === "quests") return idea.kind === "quest" || idea.kind === "quest_assignment" || idea.kind === "quest_turn_in";
  if (lens === "runtime") return ["dialogue", "encounter", "event", "open_shop", "gameplay_effect"].includes(idea.kind);
  return ["faction", "item", "world_state", "persistent_fact", "numeric_reward", "item_reward"].includes(idea.kind);
}

function toneForKind(kind: string): string {
  const values: Record<string, string> = {
    quest: "border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40",
    character_story_beat: "border-violet-300 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40",
    adventure_beat: "border-fuchsia-300 bg-fuchsia-50 dark:border-fuchsia-900 dark:bg-fuchsia-950/40",
    event: "border-orange-300 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/40",
    location: "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
    local: "border-dashed border-fuchsia-400 bg-fuchsia-50 dark:border-fuchsia-800 dark:bg-fuchsia-950/40",
  };
  return values[kind] || "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950";
}

export default function StoryTimelinePage() {
  const [searchParams] = useSearchParams();
  const requestedTrack = searchParams.get("track") || "";
  const requestedEntity = searchParams.get("entity") || "";
  const [packet, setPacket] = useState<EntryRecord | null>(null);
  const [error, setError] = useState("");
  const [lens, setLens] = useState<Lens>("story");
  const [trackKind, setTrackKind] = useState<TrackKind>("location");
  const [focusedEntityId, setFocusedEntityId] = useState("");
  const [search, setSearch] = useState("");
  const [timelineFocus, setTimelineFocus] = useState("");
  const [arcFocus, setArcFocus] = useState("");
  const [libraryKind, setLibraryKind] = useState("locations");
  const [selection, setSelection] = useState<Selection>(null);
  const [plan, setPlan] = useState<LocalPlan>(loadPlan);
  const [provisionalDrafts, setProvisionalDrafts] = useState<CreationFlowDraft[]>(loadProvisionalDrafts);
  const [review, setReview] = useState<BundleReviewResult | null>(null);
  const [previewBundle, setPreviewBundle] = useState<EntryRecord | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [saving, setSaving] = useState(false);
  const [filterMode, setFilterMode] = useState<AuthoringFilterMode>("all");
  const [canonicalLinkEdit, setCanonicalLinkEdit] = useState<CanonicalLinkEdit | null>(null);
  const [compareLeft, setCompareLeft] = useState("");
  const [compareRight, setCompareRight] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    apiFetch("/api/ui/adventure-timeline")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(text(payload.message, "Unable to load Story Timeline."));
        setPacket(payload);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load Story Timeline."));
  }, []);

  useEffect(() => {
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
    setReview(null);
    setPreviewBundle(null);
    setMutationError("");
  }, [plan]);

  useEffect(() => {
    const refresh = () => setProvisionalDrafts(loadProvisionalDrafts());
    window.addEventListener("soa:creation-flow-drafts-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("soa:creation-flow-drafts-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    setReview(null);
    setPreviewBundle(null);
    setMutationError("");
  }, [canonicalLinkEdit]);

  useEffect(() => {
    if (isTrackKind(requestedTrack)) {
      setTrackKind(requestedTrack);
      setFocusedEntityId(requestedEntity);
    } else {
      setFocusedEntityId("");
    }
  }, [requestedEntity, requestedTrack]);

  const timelines = useMemo(() => rows(packet?.timelines), [packet]);
  const arcs = useMemo(() => rows(packet?.story_arcs), [packet]);
  const placements = useMemo(() => rows(packet?.placements), [packet]);
  const eventChains = useMemo(() => rows(packet?.event_chains), [packet]);
  const relationships = useMemo(() => rows(packet?.relationships), [packet]);
  const dependencyEdges = useMemo(() => rows(record(packet?.dependency_index).edges), [packet]);
  const warnings = useMemo(() => rows(record(packet?.health).warnings), [packet]);
  const catalogs = useMemo(() => record(packet?.catalogs), [packet]);
  const canonicalBeats = useMemo(() => rows(catalogs.adventure_beats), [catalogs]);
  const canonicalLinks = useMemo(() => rows(catalogs.adventure_beat_links), [catalogs]);
  const query = search.trim().toLowerCase();

  const arcById = useMemo(() => new Map(arcs.map((arc) => [text(arc.id), arc])), [arcs]);
  const timelineById = useMemo(() => new Map(timelines.map((timeline) => [text(timeline.id), timeline])), [timelines]);
  const provisionalNodes = useMemo(() => provisionalDrafts.flatMap((draft) => {
    const target = draft.provisionalPlacement?.target;
    if (!target) return [];
    return creationFlowProvisionalItems(draft).map((item): ProvisionalTimelineNode => ({
      ...item,
      id: `${draft.id}:${item.key}`,
      flowTitle: draft.title,
      target,
    }));
  }), [provisionalDrafts]);
  const provisionalNodeByDropId = useMemo(() => new Map(provisionalNodes.map((node) => [
    `provisional:${node.draftId}:${node.sourceKind}:${node.sourceId}`,
    node,
  ])), [provisionalNodes]);
  const orphanedProvisionalDrafts = useMemo(() => provisionalDrafts.filter((draft) => {
    const target = draft.provisionalPlacement?.target;
    if (!target) return false;
    return target.kind === "timeline"
      ? !timelineById.has(target.canonicalId)
      : !arcById.has(target.canonicalId);
  }), [arcById, provisionalDrafts, timelineById]);
  const catalogsByKind = useMemo(() => {
    const result = new Map<string, Map<string, EntryRecord>>();
    Object.entries(catalogs).forEach(([kind, value]) => result.set(kind, new Map(rows(value).map((entry) => [text(entry.id), entry]))));
    return result;
  }, [catalogs]);

  const libraryRows = useMemo(() => {
    return rows(catalogs[libraryKind]).filter((entry) => !query || label(entry).toLowerCase().includes(query));
  }, [catalogs, libraryKind, query]);

  const updateBeat = (beatId: string, patch: Partial<LocalBeat>) => {
    setPlan((current) => ({ beats: current.beats.map((beat) => beat.id === beatId ? { ...beat, ...patch } : beat) }));
  };

  const addBeat = (storyArcId: string, attachment?: LocalAttachment) => {
    const arc = arcById.get(storyArcId);
    const sameLane = plan.beats.filter((beat) => beat.story_arc_id === storyArcId);
    const beat: LocalBeat = {
      id: generateUlid(),
      title: attachment?.label || "New Planning Beat",
      summary: attachment ? `Placed from ${attachment.kind.replace(/_/g, " ")} library.` : "",
      beat_type: "Other",
      timeline_id: text(arc?.timeline_id),
      story_arc_id: storyArcId,
      order: sameLane.length,
      attachments: attachment ? [attachment] : [],
    };
    setPlan((current) => ({ beats: [...current.beats, beat] }));
    setSelection({ kind: "local-beat", id: beat.id });
  };

  const attachToBeat = (beatId: string, attachment: LocalAttachment) => {
    setPlan((current) => ({
      beats: current.beats.map((beat) => {
        if (beat.id !== beatId || beat.attachments.some((row) => row.kind === attachment.kind && row.entry_id === attachment.entry_id)) return beat;
        return { ...beat, attachments: [...beat.attachments, attachment] };
      }),
    }));
    setSelection({ kind: "local-beat", id: beatId });
  };

  const moveBeat = (beatId: string, storyArcId: string, beforeBeatId?: string) => {
    const arc = arcById.get(storyArcId);
    setPlan((current) => {
      const moving = current.beats.find((beat) => beat.id === beatId);
      if (!moving) return current;
      const targetLane = current.beats
        .filter((beat) => beat.story_arc_id === storyArcId && beat.id !== beatId)
        .sort((left, right) => left.order - right.order);
      const targetIndex = beforeBeatId ? targetLane.findIndex((beat) => beat.id === beforeBeatId) : -1;
      targetLane.splice(targetIndex >= 0 ? targetIndex : targetLane.length, 0, {
        ...moving,
        story_arc_id: storyArcId,
        timeline_id: text(arc?.timeline_id),
      });
      const normalized = new Map(targetLane.map((beat, order) => [beat.id, { ...beat, order }]));
      return {
        beats: current.beats.map((beat) => normalized.get(beat.id) || beat),
      };
    });
  };

  const moveProvisionalIdea = (
    draftId: string,
    itemKey: string,
    target: CreationFlowProvisionalPlacement["target"],
    beforeKey?: string,
  ) => {
    const stored = loadCreationFlowDraft(draftId);
    if (!stored) return;
    const placed = stored.provisionalPlacement?.target.kind === target.kind
      && stored.provisionalPlacement.target.canonicalId === target.canonicalId
      ? stored
      : setCreationFlowProvisionalPlacement(stored, target);
    const reordered = reorderCreationFlowProvisionalItems(placed, itemKey, beforeKey);
    saveCreationFlowDraft(reordered);
    setProvisionalDrafts(loadProvisionalDrafts());
    setSelection({ kind: "provisional-idea", id: `${draftId}:${itemKey}` });
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over) return;
    const data = event.active.data.current || {};
    const overId = String(event.over.id);
    if (data.dragType === "library") {
      const attachment: LocalAttachment = {
        kind: text(data.kind),
        entry_id: text(data.entryId),
        label: text(data.label),
        role: attachmentRole(text(data.kind)),
      };
      if (overId.startsWith("beat:")) attachToBeat(overId.slice(5), attachment);
      if (overId.startsWith("lane:")) addBeat(overId.slice(5) === "unassigned" ? "" : overId.slice(5), attachment);
    }
    if (data.dragType === "local-beat" && overId.startsWith("beat:")) {
      const target = plan.beats.find((beat) => beat.id === overId.slice(5));
      if (target) moveBeat(text(data.beatId), target.story_arc_id, target.id);
    } else if (data.dragType === "local-beat" && overId.startsWith("lane:")) {
      moveBeat(text(data.beatId), overId.slice(5) === "unassigned" ? "" : overId.slice(5));
    }
    if (data.dragType === "provisional-idea") {
      const draftId = text(data.draftId);
      const itemKey = text(data.itemKey);
      const overNode = provisionalNodeByDropId.get(overId);
      if (overNode) {
        moveProvisionalIdea(draftId, itemKey, overNode.target, overNode.draftId === draftId ? overNode.key : undefined);
      } else if (overId.startsWith("lane:")) {
        const storyArcId = overId.slice(5);
        const arc = arcById.get(storyArcId);
        if (arc) moveProvisionalIdea(draftId, itemKey, { kind: "story_arc", canonicalId: storyArcId, label: label(arc) });
      } else if (overId.startsWith("timeline-lane:")) {
        const timelineId = overId.slice("timeline-lane:".length);
        const timeline = timelineById.get(timelineId);
        if (timeline) moveProvisionalIdea(draftId, itemKey, { kind: "timeline", canonicalId: timelineId, label: label(timeline) });
      }
    }
  };

  const buildPlanBundle = () => ({
    adventure_beats: plan.beats.map((beat) => ({
      id: beat.id,
      slug: `${generateSlug(beat.title) || "adventure-beat"}-${beat.id.slice(-6).toLowerCase()}`,
      title: beat.title,
      summary: beat.summary,
      beat_type: beat.beat_type || "Other",
      timeline_id: beat.timeline_id || null,
      story_arc_id: beat.story_arc_id || null,
      sort_order: beat.order,
      intent: beat.summary,
      required_flags: [],
      forbidden_flags: [],
      expected_output_flags: [],
      tags: [],
    })),
    adventure_beat_links: [
      ...plan.beats.flatMap((beat) => beat.attachments.map((attachment, index) => ({
      id: `beat-link:${beat.id}:${attachment.kind}:${attachment.entry_id}:${attachment.role}`,
      adventure_beat_id: beat.id,
      target_type: attachment.kind,
      target_id: attachment.entry_id,
      role: attachment.role,
      occurrence_kind: attachment.role === "reward" ? "reward" : "appearance",
      change_type: attachment.role === "reward" && attachment.kind === "item" ? "obtained" : "active",
      state_label: "",
      starts_at_beat_id: "",
      ends_at_beat_id: "",
      continuity_group_id: attachment.entry_id,
      importance: attachment.kind === "item" || attachment.role === "reward" ? "major" : "minor",
      sort_order: index,
      notes: "",
      tags: [],
      }))),
      ...(canonicalLinkEdit ? [{
        ...storyPlacementLinkPayload(canonicalLinkEdit.draft, canonicalLinkEdit.original),
        expected_previous: canonicalLinkEdit.original,
      }] : []),
    ],
    deletions: { adventure_beats: [], adventure_beat_links: [] },
  });

  const submitPlan = async (commit: boolean) => {
    const bundle = commit ? previewBundle : buildPlanBundle();
    if (!bundle) return;
    setSaving(true);
    setMutationError("");
    try {
      const response = await apiFetch(`/api/ui/adventure-timeline/${commit ? "bundle" : "preview"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(text(payload.message, "Unable to save Story Timeline plan."));
      if (commit) {
        setPacket(record(payload.packet));
        setPlan({ beats: [] });
        setCanonicalLinkEdit(null);
        setSelection(null);
        setReview(null);
        setPreviewBundle(null);
      } else {
        setReview(payload as BundleReviewResult);
        setPreviewBundle(bundle);
      }
    } catch (reason: unknown) {
      setMutationError(reason instanceof Error ? reason.message : "Unable to save Story Timeline plan.");
    } finally {
      setSaving(false);
    }
  };

  const visibleTimelines = timelines.filter((timeline) => !timelineFocus || text(timeline.id) === timelineFocus);
  const unassignedArcs = arcs.filter((arc) => !text(arc.timeline_id));
  const showUnassigned = !timelineFocus || timelineFocus === "__unassigned";
  const selectedLocalBeat = selection?.kind === "local-beat" ? plan.beats.find((beat) => beat.id === selection.id) : undefined;
  const selectedProvisionalIdea = selection?.kind === "provisional-idea" ? provisionalNodes.find((node) => node.id === selection.id) : undefined;
  const selectedPlacement = selection?.kind === "placement" ? placements.find((placement) => text(placement.id) === selection.id) : undefined;
  const selectedEvent = selection?.kind === "event" ? eventChains.find((event) => text(event.event_id) === selection.id) : undefined;
  const selectedLibrary = selection?.kind === "library"
    ? catalogsByKind.get(selection.libraryKind || "")?.get(selection.id)
    : undefined;
  const entityOccurrences = useMemo(() => deriveEntityOccurrences({
    packet,
    placements,
    eventChains,
    catalogsByKind,
    localBeats: plan.beats,
  }), [catalogsByKind, eventChains, packet, placements, plan.beats]);

  if (error) return <AuthoringPageShell><StatusNotice tone="error" action={<button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => window.location.reload()}>Try Again</button>}>{error} Refresh the workspace after the service is available.</StatusNotice></AuthoringPageShell>;
  if (!packet) return <AuthoringPageShell><StatusNotice>Loading Story Timeline...</StatusNotice></AuthoringPageShell>;

  return (
    <DndContext sensors={sensors} collisionDetection={preferBeatCollision} onDragEnd={onDragEnd}>
      <AuthoringPageShell>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-fuchsia-700 dark:text-fuchsia-300">Story room</div>
            <h1 className="text-2xl font-semibold">Shape the Story</h1>
            <p className="text-sm text-slate-500">Arrange moments into arcs, see where characters and quests reappear, and keep alternate paths honest.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Metric value={placements.length} label="canonical placements" />
            <Metric value={plan.beats.length} label="local planning beats" />
            <Metric value={provisionalNodes.length} label="provisional ideas" />
            <AuthoringHealthSummary blockers={0} warnings={warnings.length} dirty={plan.beats.length > 0 || Boolean(canonicalLinkEdit)} saving={saving} />
            <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={(!plan.beats.length && !canonicalLinkEdit) || saving} onClick={() => submitPlan(false)}>Review & save</button>
            {plan.beats.length > 0 && <button type="button" className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.sm}`} onClick={() => { if (window.confirm("Delete every local planning beat? This cannot be undone.")) { setPlan({ beats: [] }); setSelection(null); } }}>Delete local plan</button>}
          </div>
        </header>

        {(review || mutationError) && <BundleReview result={review} title="Save story plan to project" description="Review the beats and story links that will be added or changed." variant="inline" commitLabel="Save plan" cancelLabel="Keep editing" saving={saving} error={mutationError} testId="story-timeline-plan-review" onCommit={() => void submitPlan(true)} onCancel={() => { setReview(null); setPreviewBundle(null); setMutationError(""); }} />}

        <div className="space-y-4">
        <AuthoringPanel
          id="timeline-filters"
          title="Timeline Lenses And Filters"
          subtitle="Narrow the board without changing saved story order."
          help="Use these controls to focus the canvas by text, timeline, arc, or lens. Filters only change what is visible on this page; they do not save anything."
          helpExample="Search for a character name, then switch to Issues to inspect only warnings and broken dependency context."
          collapsible
          defaultCollapsed
          storageKey="soa.story-timeline.filters.collapsed"
          collapsedSummary={search || timelineFocus || arcFocus ? "Filters are active" : "Showing the full story"}
        >
          <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
            <label className="block text-xs font-semibold uppercase text-slate-500">Find Content<input className={`${inputClass} mt-1`} value={search} placeholder="Search the board and library..." onChange={(event) => setSearch(event.target.value)} /></label>
            <label className="block text-xs font-semibold uppercase text-slate-500">Timeline Focus<select className={`${inputClass} mt-1`} value={timelineFocus} onChange={(event) => { setTimelineFocus(event.target.value); setArcFocus(""); }}><option value="">All timelines</option>{timelines.map((timeline) => <option key={text(timeline.id)} value={text(timeline.id)}>{label(timeline)}</option>)}<option value="__unassigned">Unassigned story space</option></select></label>
            <label className="block text-xs font-semibold uppercase text-slate-500">Arc Focus<select className={`${inputClass} mt-1`} value={arcFocus} onChange={(event) => setArcFocus(event.target.value)}><option value="">All visible arcs</option>{arcs.filter((arc) => !timelineFocus || timelineFocus === "__unassigned" ? !text(arc.timeline_id) : text(arc.timeline_id) === timelineFocus).map((arc) => <option key={text(arc.id)} value={text(arc.id)}>{label(arc)}</option>)}</select></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["story", "cast", "locations", "quests", "runtime", "state", "issues"] as Lens[]).map((value) => <button key={value} type="button" className={`rounded-full border px-3 py-1 text-xs font-semibold ${lens === value ? "border-fuchsia-600 bg-fuchsia-600 text-white" : "border-slate-300 dark:border-slate-700"}`} onClick={() => setLens(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
          </div>
          <AuthoringFilterBar value={filterMode} onChange={setFilterMode} issueCount={warnings.length} changedCount={plan.beats.length + provisionalNodes.length} className="mt-3" />
        </AuthoringPanel>

        <div className="space-y-4">
          {filterMode === "issues" ? <aside className="space-y-4"><IssueSection warnings={warnings} dependencyHealth={record(record(packet.health).dependency)} /></aside> : <aside className="space-y-4">
            <AuthoringPanel
              id="timeline-library"
              title="Content Library"
              subtitle="Drag content onto an arc lane to sketch a local beat, or onto an existing local beat to attach it."
              help="Library cards reference saved records. Dragging them creates or updates browser-local planning beats until you review and commit the plan."
              collapsible
              defaultCollapsed
              storageKey="soa.story-timeline.content-library.collapsed"
              collapsedSummary={`${libraryRows.length} visible ${libraryKind.replace(/_/g, " ")}`}
            >
              <select className={`${inputClass} mt-3`} value={libraryKind} onChange={(event) => setLibraryKind(event.target.value)}>
                {["locations", "characters", "quests", "events", "dialogues", "encounters", "lore_entries", "items", "factions"].map((kind) => <option key={kind} value={kind}>{kind.replace(/_/g, " ")}</option>)}
              </select>
              <div className="mt-3 grid max-h-[30rem] gap-2 overflow-auto md:grid-cols-2 xl:grid-cols-4">
                {libraryRows.map((entry) => {
                  const kind = singular(libraryKind);
                  const attachment = { kind, entry_id: text(entry.id), label: label(entry), role: attachmentRole(kind) };
                  return <LibraryCard key={text(entry.id)} kind={kind} entry={entry} onSelect={() => setSelection({ kind: "library", id: text(entry.id), libraryKind })} onAttach={selectedLocalBeat ? () => attachToBeat(selectedLocalBeat.id, attachment) : undefined} />;
                })}
                {!libraryRows.length && <EmptyState variant="compact" title={`No matching ${libraryKind.replace(/_/g, " ")}.`}>Adjust the search text or switch library type to find content to place on the board.</EmptyState>}
              </div>
            </AuthoringPanel>
            <UnplacedSummary unplaced={record(packet.unplaced)} />
          </aside>}

          <main className="min-w-0 space-y-4" data-testid="story-timeline-canvas">
            {filterMode === "issues" && <EmptyState variant="compact" title="Issue-only view">The board is filtered to warnings and dependency issues. Switch to Show All to continue arranging content.</EmptyState>}
            {filterMode === "changed" && <TimelineBand timeline={{ id: "", name: "Changed Local Plan", description: "Browser-local beats changed in this workspace." }} arcs={[]} placements={[]} localBeats={plan.beats} provisionalNodes={[]} lens="story" query={query} onSelect={setSelection} onAddBeat={addBeat} unassigned />}
            {filterMode === "changed" && provisionalNodes.length > 0 && <AuthoringPanel title="Idea Studio provisional placements" subtitle={`${provisionalNodes.length} linked local card${provisionalNodes.length === 1 ? "" : "s"}`} help="These cards remain on their chosen timeline or story-arc lanes so their visual order keeps its scope."><button type="button" className={`${BUTTON_CLASSES.violet} ${BUTTON_SIZES.sm}`} onClick={() => setFilterMode("all")}>Show on timeline lanes</button></AuthoringPanel>}
            {filterMode === "changed" && plan.beats.length === 0 && provisionalNodes.length === 0 && <EmptyState title="No changed story beats">The current timeline matches saved content. Add a local planning beat or place an Idea Studio draft provisionally to see it here.</EmptyState>}
            {filterMode === "all" && <>
            {visibleTimelines.map((timeline) => {
              const timelineArcs = arcs.filter((arc) => text(arc.timeline_id) === text(timeline.id) && (!arcFocus || text(arc.id) === arcFocus));
              return <TimelineBand key={text(timeline.id)} timeline={timeline} arcs={timelineArcs} placements={placements} localBeats={plan.beats} provisionalNodes={provisionalNodes} lens={lens} query={query} onSelect={setSelection} onAddBeat={addBeat} />;
            })}
            {showUnassigned && (!arcFocus || unassignedArcs.some((arc) => text(arc.id) === arcFocus)) && <TimelineBand timeline={{ id: "", name: "Unassigned Story Space", description: "Content without a modeled timeline or arc." }} arcs={unassignedArcs.filter((arc) => !arcFocus || text(arc.id) === arcFocus)} placements={placements} localBeats={plan.beats} provisionalNodes={provisionalNodes} lens={lens} query={query} onSelect={setSelection} onAddBeat={addBeat} unassigned />}
            {lens === "runtime" && <EventChainSection events={eventChains} query={query} onSelect={(id) => setSelection({ kind: "event", id })} />}
            {lens === "state" && <RelationshipSection title="State & Dependency Context" relationships={dependencyEdges} />}
            {lens === "issues" && <IssueSection warnings={warnings} dependencyHealth={record(record(packet.health).dependency)} />}
            {orphanedProvisionalDrafts.length > 0 && <StatusNotice tone="warning">{orphanedProvisionalDrafts.length} provisional Idea Studio placement{orphanedProvisionalDrafts.length === 1 ? "" : "s"} point to a timeline or arc that no longer exists. Open the linked draft from Idea Studio and choose a new placement.</StatusNotice>}
            {!timelines.length && !arcs.length && placements.length === 0 && plan.beats.length === 0 && provisionalNodes.length === 0 && <EmptyState title="The story space is empty." className="text-center">Create timelines and story arcs, or drag library content into Unassigned Story Space to begin a browser-local plan.</EmptyState>}
            </>}
          </main>

          {selectedProvisionalIdea && <ProvisionalIdeaContextDock idea={selectedProvisionalIdea} />}
          {selection && !selectedProvisionalIdea && <ContextDock
            selection={selection}
            localBeat={selectedLocalBeat}
            placement={selectedPlacement}
            event={selectedEvent}
            libraryEntry={selectedLibrary}
            libraryKind={selection?.libraryKind || ""}
            relationships={[...relationships, ...dependencyEdges]}
            warnings={warnings}
            canonicalBeats={canonicalBeats}
            canonicalLinks={canonicalLinks}
            canonicalLinkEdit={canonicalLinkEdit}
            onBeginCanonicalLinkEdit={(linkId) => {
              const original = canonicalLinks.find((link) => text(link.id) === linkId);
              const draft = original ? placementDraftFromCanonicalLink(original) : null;
              if (original && draft) setCanonicalLinkEdit({ original, draft });
            }}
            onCanonicalLinkEditChange={(draft) => setCanonicalLinkEdit((current) => current ? { ...current, draft } : null)}
            onCancelCanonicalLinkEdit={() => setCanonicalLinkEdit(null)}
            onUpdateBeat={updateBeat}
            onDeleteBeat={(beatId) => { setPlan((current) => ({ beats: current.beats.filter((beat) => beat.id !== beatId) })); setSelection(null); }}
            onRemoveAttachment={(beatId, attachment) => updateBeat(beatId, { attachments: selectedLocalBeat?.attachments.filter((row) => row !== attachment) || [] })}
          />}
        </div>
        {filterMode !== "issues" && <TimelineNavigator
          timelines={timelines}
          arcs={arcs}
          placements={placements}
          localBeats={plan.beats}
          entityOccurrences={entityOccurrences}
          trackKind={trackKind}
          focusedEntityId={focusedEntityId}
          onTrackKindChange={(kind) => { setTrackKind(kind); setFocusedEntityId(""); }}
          onEntityFocus={setFocusedEntityId}
          timelineFocus={timelineFocus}
          arcFocus={arcFocus}
          onFocus={(nextTimelineId, nextArcId = "") => {
            setTimelineFocus(nextTimelineId);
            setArcFocus(nextArcId);
            setLens(nextArcId || nextTimelineId ? lens : "story");
          }}
        />}

        {filterMode !== "issues" && <ScopedPathComparison
          timelines={timelines}
          arcs={arcs}
          placements={placements}
          localBeats={plan.beats}
          leftScope={compareLeft}
          rightScope={compareRight}
          onLeftScope={setCompareLeft}
          onRightScope={setCompareRight}
        />}
          </div>
      </AuthoringPageShell>
    </DndContext>
  );
}

function Metric({ value, label: metricLabel, warning = false }: { value: number; label: string; warning?: boolean }) {
  return <span className={`rounded-full px-3 py-2 font-semibold ${warning ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>{value} {metricLabel}</span>;
}

function TimelineNavigator({ timelines, arcs, placements, localBeats, entityOccurrences, trackKind, focusedEntityId, onTrackKindChange, onEntityFocus, timelineFocus, arcFocus, onFocus }: { timelines: EntryRecord[]; arcs: EntryRecord[]; placements: EntryRecord[]; localBeats: LocalBeat[]; entityOccurrences: StoryOccurrence[]; trackKind: TrackKind; focusedEntityId: string; onTrackKindChange: (kind: TrackKind) => void; onEntityFocus: (entityId: string) => void; timelineFocus: string; arcFocus: string; onFocus: (timelineId: string, arcId?: string) => void }) {
  const focusedGroupRef = useRef<HTMLButtonElement | null>(null);
  const arcsByTimeline = useMemo(() => {
    const result = new Map<string, EntryRecord[]>();
    arcs.forEach((arc) => {
      const timelineId = text(arc.timeline_id);
      result.set(timelineId, [...(result.get(timelineId) || []), arc]);
    });
    return result;
  }, [arcs]);
  const arcStats = useMemo(() => {
    const result = new Map<string, { canonical: number; local: number; tracked: number }>();
    arcs.forEach((arc) => {
      const arcId = text(arc.id);
      result.set(arcId, {
        canonical: placements.filter((placement) => text(placement.story_arc_id) === arcId).length,
        local: localBeats.filter((beat) => beat.story_arc_id === arcId).length,
        tracked: new Set(filterBackgroundOccurrences(entityOccurrences).filter((row) => row.entity_kind === trackKind && row.story_arc_id === arcId).map((row) => row.entity_id)).size,
      });
    });
    return result;
  }, [arcs, entityOccurrences, localBeats, placements, trackKind]);
  const trackRows = useMemo(() => filterBackgroundOccurrences(entityOccurrences).filter((row) => row.entity_kind === trackKind), [entityOccurrences, trackKind]);
  const trackGroups = useMemo(() => {
    const groups = new Map<string, { label: string; rows: StoryOccurrence[] }>();
    trackRows.forEach((row) => {
      const current = groups.get(row.entity_id) || { label: row.label, rows: [] };
      current.rows.push(row);
      groups.set(row.entity_id, current);
    });
    return [...groups.entries()]
      .map(([entryId, group]) => ({ entryId, ...group }))
      .sort((left, right) => right.rows.length - left.rows.length || left.label.localeCompare(right.label));
  }, [trackRows]);
  const trackLabels: Record<TrackKind, string> = {
    location: "Locations",
    character: "Characters",
    quest: "Quests",
    event: "Events",
    dialogue: "Dialogues",
    encounter: "Encounters",
    lore_entry: "Lore",
    item: "Important Items",
    faction: "Factions",
    story_arc: "Story Arcs",
  };

  useEffect(() => {
    if (focusedEntityId && trackGroups.some((group) => group.entryId === focusedEntityId)) {
      focusedGroupRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedEntityId, trackGroups]);

  return <AuthoringPanel
    id="timeline-navigator"
    title="Story Navigator"
    subtitle="Jump by arc, then inspect repeated entity appearances and state changes without scrolling through every card."
    help="Use this as the wide overview. Timeline and arc buttons change the visible board; entity occurrence buttons focus the first matching appearance for the selected track."
    testId="story-navigator"
    collapsible
    defaultCollapsed
    storageKey="soa.story-timeline.navigator.collapsed"
    collapsedSummary={timelineFocus || arcFocus || focusedEntityId ? "A story focus is active" : "Jump between arcs and recurring characters"}
  >
    <div className="flex flex-wrap items-start justify-end gap-3">
      <button type="button" className="rounded border px-3 py-1 text-xs font-semibold" onClick={() => { onFocus(""); onEntityFocus(""); }}>Show All</button>
    </div>
    <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
      <div className="space-y-2">
        {timelines.map((timeline) => {
          const timelineId = text(timeline.id);
          const timelineArcs = arcsByTimeline.get(timelineId) || [];
          return <div key={timelineId} className={`rounded-lg border p-2 ${timelineFocus === timelineId ? "border-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-950/30" : "border-slate-200 dark:border-slate-800"}`}>
            <button type="button" className="text-left text-xs font-semibold" onClick={() => onFocus(timelineId)}>{label(timeline)}</button>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {timelineArcs.map((arc) => {
                const arcId = text(arc.id);
                const stats = arcStats.get(arcId) || { canonical: 0, local: 0, tracked: 0 };
                return <button key={arcId} type="button" className={`min-w-44 rounded-md border px-2 py-2 text-left text-[11px] ${arcFocus === arcId ? "border-fuchsia-500 bg-white shadow-sm dark:bg-slate-900" : "border-slate-200 dark:border-slate-800"}`} onClick={() => onFocus(timelineId, arcId)}>
                  <span className="block truncate font-semibold">{label(arc)}</span>
                  <span className="mt-1 block text-slate-500">{stats.canonical} canonical / {stats.local} local / {stats.tracked} {trackKind}s</span>
                </button>;
              })}
              {!timelineArcs.length && <EmptyState variant="compact" title="No arcs in this timeline.">Create an arc or use the unassigned story space for local planning.</EmptyState>}
            </div>
          </div>;
        })}
        {!timelines.length && <EmptyState variant="compact" title="No timelines yet.">Use the unassigned lane for local planning, or create a timeline before committing ordered story beats.</EmptyState>}
      </div>
      <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase text-slate-500">Entity Occurrences</h3>
          <span className="text-[10px] text-slate-400">{trackRows.length} visible</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1">
          {STORY_TRACK_KINDS.map((kind) => <button key={kind} type="button" aria-pressed={trackKind === kind} className={`rounded border px-2 py-1 text-[10px] font-semibold ${trackKind === kind ? "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200" : "border-slate-200 dark:border-slate-800"}`} onClick={() => onTrackKindChange(kind)}>{trackLabels[kind]}</button>)}
        </div>
        <div className="mt-2 max-h-64 space-y-2 overflow-auto">
          {trackGroups.map((group) => {
            const first = group.rows[0];
            const states = [...new Set(group.rows.map((row) => row.state_label || row.change_type || row.role).filter(Boolean))];
            const focused = focusedEntityId === group.entryId;
            return <button key={group.entryId} ref={focused ? focusedGroupRef : undefined} type="button" data-testid={`entity-occurrence-${trackKind}-${group.entryId}`} data-focused={focused ? "true" : "false"} className={`block w-full rounded-md border px-2 py-2 text-left text-xs hover:border-fuchsia-300 dark:border-slate-800 ${focused ? "border-fuchsia-500 bg-fuchsia-50 ring-2 ring-fuchsia-200 dark:bg-fuchsia-950/40 dark:ring-fuchsia-900" : ""}`} onClick={() => { onEntityFocus(group.entryId); onFocus(first.timeline_id, first.story_arc_id); }}>
              <span className="block font-semibold">{group.label}</span>
              <span className="mt-1 block text-[10px] text-slate-500">{group.rows.length} occurrence(s){states.length ? `: ${states.join(", ")}` : ""}</span>
              <span className="mt-1 block truncate text-[10px] text-slate-400">First: {first.source_label || "Unplaced"}</span>
            </button>;
          })}
          {!trackGroups.length && <EmptyState variant="compact" title={`No ${trackLabels[trackKind].toLowerCase()} attached yet.`}>Attach this kind of content to story beats when you want the navigator to track appearances across the board.</EmptyState>}
        </div>
      </div>
    </div>
  </AuthoringPanel>;
}

function ScopedPathComparison({ timelines, arcs, placements, localBeats, leftScope, rightScope, onLeftScope, onRightScope }: { timelines: EntryRecord[]; arcs: EntryRecord[]; placements: EntryRecord[]; localBeats: LocalBeat[]; leftScope: string; rightScope: string; onLeftScope: (scope: string) => void; onRightScope: (scope: string) => void }) {
  const options = [
    ...arcs.map((arc) => ({ id: `arc:${text(arc.id)}`, label: `Arc: ${label(arc)}` })),
    ...timelines.map((timeline) => ({ id: `timeline:${text(timeline.id)}`, label: `Timeline-level: ${label(timeline)}` })),
    { id: "unassigned", label: "Unassigned story space" },
  ];
  const scopedRows = (scope: string) => {
    const [kind, id = ""] = scope.split(":", 2);
    const canonical = placements.filter((placement) => {
      if (kind === "arc") return text(placement.story_arc_id) === id;
      if (kind === "timeline") return !text(placement.story_arc_id) && text(placement.timeline_id) === id;
      return scope === "unassigned" && !text(placement.story_arc_id) && !text(placement.timeline_id);
    }).map((placement) => ({
      id: `canonical:${text(placement.kind)}:${text(placement.entry_id)}`,
      label: text(placement.label),
      order: Number(placement.order),
      origin: "canonical",
    }));
    const local = localBeats.filter((beat) => {
      if (kind === "arc") return beat.story_arc_id === id;
      if (kind === "timeline") return !beat.story_arc_id && beat.timeline_id === id;
      return scope === "unassigned" && !beat.story_arc_id && !beat.timeline_id;
    }).map((beat) => ({ id: `local:${beat.id}`, label: beat.title, order: beat.order, origin: "local" }));
    return [...canonical, ...local].sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));
  };
  const leftRows = scopedRows(leftScope);
  const rightRows = scopedRows(rightScope);
  const leftLabels = new Set(leftRows.map((row) => row.label.toLowerCase()));
  const rightLabels = new Set(rightRows.map((row) => row.label.toLowerCase()));
  const shared = [...leftLabels].filter((value) => rightLabels.has(value)).length;
  const renderPath = (pathRows: ReturnType<typeof scopedRows>, opposite: Set<string>) => <div className="min-h-24 rounded-md border border-dashed border-slate-200 p-2 dark:border-slate-800">
    <div className="flex gap-2 overflow-x-auto pb-1">
      {pathRows.map((row, index) => <div key={row.id} className={`w-40 shrink-0 rounded border p-2 text-xs ${opposite.has(row.label.toLowerCase()) ? "border-fuchsia-300 bg-fuchsia-50 dark:bg-fuchsia-950/30" : "border-slate-200 dark:border-slate-800"}`}>
        <div className="text-[9px] font-semibold uppercase text-slate-500">{index + 1} / {row.origin}</div>
        <div className="mt-1 font-semibold">{row.label}</div>
      </div>)}
      {!pathRows.length && <EmptyState variant="compact" title="No scoped beats.">Choose a populated lane to compare its authored order.</EmptyState>}
    </div>
  </div>;
  return <AuthoringPanel
    title="Scoped Path Comparison"
    subtitle="Compare two authored lane snapshots without declaring either one a canonical player path."
    help="Each side preserves only the order modeled inside its selected arc, timeline-level lane, or unassigned scope. Matching labels are highlighted; cross-lane order is never inferred or saved."
    collapsible
    defaultCollapsed
    storageKey="soa.story-timeline.path-comparison.collapsed"
    collapsedSummary={leftScope && rightScope ? `${shared} shared beat label(s)` : "Choose two scoped lanes"}
    testId="story-timeline-path-comparison"
  >
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <label className="block text-xs font-semibold uppercase text-slate-500">Left scope<select className={`${inputClass} mt-1 normal-case`} value={leftScope} onChange={(event) => onLeftScope(event.target.value)}><option value="">Choose a lane...</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <label className="block text-xs font-semibold uppercase text-slate-500">Right scope<select className={`${inputClass} mt-1 normal-case`} value={rightScope} onChange={(event) => onRightScope(event.target.value)}><option value="">Choose a lane...</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <div>{renderPath(leftRows, rightLabels)}</div>
      <div>{renderPath(rightRows, leftLabels)}</div>
    </div>
    {leftScope && rightScope && <p className="mt-2 text-xs text-slate-500">{shared} shared label(s); {leftRows.length - shared} left-only and {rightRows.length - shared} right-only positions. This is a browser-local comparison and creates no canonical path record.</p>}
  </AuthoringPanel>;
}

function LibraryCard({ kind, entry, onSelect, onAttach }: { kind: string; entry: EntryRecord; onSelect: () => void; onAttach?: () => void }) {
  const drag = useDraggable({ id: `library:${kind}:${text(entry.id)}`, data: { dragType: "library", kind, entryId: text(entry.id), label: label(entry) } });
  return <article ref={drag.setNodeRef} className={`rounded-md border p-2 text-xs ${drag.isDragging ? "opacity-40" : ""}`}>
    <button type="button" className="block w-full text-left" onClick={onSelect}><span className="block text-[10px] font-semibold uppercase text-slate-500">{kind.replace(/_/g, " ")}</span><span className="block truncate font-semibold">{label(entry)}</span></button>
    <div className="mt-2 flex flex-wrap gap-1"><button type="button" className="cursor-grab rounded border px-2 py-1 text-[10px] font-semibold" {...drag.attributes} {...drag.listeners}>Drag to timeline</button>{onAttach && <button type="button" className="rounded border border-fuchsia-300 px-2 py-1 text-[10px] font-semibold text-fuchsia-700 dark:text-fuchsia-300" onClick={onAttach}>Attach to Selected Beat</button>}</div>
  </article>;
}

function TimelineBand({ timeline, arcs, placements, localBeats, provisionalNodes, lens, query, onSelect, onAddBeat, unassigned = false }: { timeline: EntryRecord; arcs: EntryRecord[]; placements: EntryRecord[]; localBeats: LocalBeat[]; provisionalNodes: ProvisionalTimelineNode[]; lens: Lens; query: string; onSelect: (selection: Selection) => void; onAddBeat: (arcId: string) => void; unassigned?: boolean }) {
  const timelineId = text(timeline.id);
  const timelinePlacements = placements
    .filter((placement) => !text(placement.story_arc_id) && text(placement.timeline_id) === timelineId)
    .filter((placement) => placementMatchesLens(placement, lens) && (!query || text(placement.label).toLowerCase().includes(query)))
    .sort((left, right) => Number(left.order) - Number(right.order));
  const unassignedPlacements = placements.filter((placement) => !text(placement.story_arc_id) && !text(placement.timeline_id));
  const unassignedBeats = localBeats.filter((beat) => !beat.story_arc_id);
  const timelineProvisional = provisionalNodes.filter((node) =>
    node.target.kind === "timeline" && node.target.canonicalId === timelineId,
  );
  const arcIds = new Set(arcs.map((arc) => text(arc.id)));
  const arcContentCount = placements.filter((placement) => arcIds.has(text(placement.story_arc_id))).length
    + localBeats.filter((beat) => arcIds.has(beat.story_arc_id)).length
    + provisionalNodes.filter((node) => node.target.kind === "story_arc" && arcIds.has(node.target.canonicalId)).length;
  const bandContentCount = unassigned
    ? unassignedPlacements.length + unassignedBeats.length
    : timelinePlacements.length + timelineProvisional.length + arcContentCount;
  return <AuthoringPanel
    title={label(timeline)}
    subtitle={text(timeline.description, "Arc order inside a timeline is not modeled; lanes are shown without implying sequence.")}
    help={unassigned ? "Use this planning space for content that does not have a saved timeline or arc yet." : "This band groups saved arcs and placements for one timeline. Arc lanes are for navigation and planning; they do not imply global order beyond saved placement data."}
    actions={!unassigned && <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} to={entityRoute("timeline", timelineId)}>Inspect Timeline Record</Link>}
    testId={`timeline-band-${timelineId || "unassigned"}`}
    collapsible
    defaultCollapsed={bandContentCount === 0}
    collapsedSummary={bandContentCount > 0 ? `${bandContentCount} story moment${bandContentCount === 1 ? "" : "s"}` : "Empty — open when you are ready to shape this timeline"}
  >
    <div className="space-y-3">
      {!unassigned && timelinePlacements.length > 0 && <ScopedRow title="Timeline-Level Adventure Beats" note="Canonical in this timeline, outside a specific arc." cards={timelinePlacements.map((placement) => <PlacementCard key={text(placement.id)} placement={placement} onSelect={() => onSelect({ kind: "placement", id: text(placement.id) })} />)} empty="" />}
      {!unassigned && <TimelineProvisionalLane timelineId={timelineId} ideas={timelineProvisional} lens={lens} query={query} onSelect={onSelect} />}
      {arcs.map((arc) => <ArcLane key={text(arc.id)} arc={arc} placements={placements.filter((placement) => text(placement.story_arc_id) === text(arc.id))} localBeats={localBeats.filter((beat) => beat.story_arc_id === text(arc.id))} provisionalNodes={provisionalNodes.filter((node) => node.target.kind === "story_arc" && node.target.canonicalId === text(arc.id))} lens={lens} query={query} onSelect={onSelect} onAddBeat={() => onAddBeat(text(arc.id))} />)}
      {unassigned && <ArcLane arc={{ id: "", title: "Unassigned Lane", summary: "Local planning and character beats without an arc." }} placements={unassignedPlacements} localBeats={unassignedBeats} provisionalNodes={[]} lens={lens} query={query} onSelect={onSelect} onAddBeat={() => onAddBeat("")} unassigned />}
      {!arcs.length && !unassigned && <EmptyState title="This timeline has no story arcs.">Create arcs to split the timeline into workable lanes, or keep drafting in unassigned story space.</EmptyState>}
    </div>
  </AuthoringPanel>;
}

function ArcLane({ arc, placements, localBeats, provisionalNodes, lens, query, onSelect, onAddBeat, unassigned = false }: { arc: EntryRecord; placements: EntryRecord[]; localBeats: LocalBeat[]; provisionalNodes: ProvisionalTimelineNode[]; lens: Lens; query: string; onSelect: (selection: Selection) => void; onAddBeat: () => void; unassigned?: boolean }) {
  const arcId = text(arc.id);
  const drop = useDroppable({ id: `lane:${arcId || "unassigned"}` });
  const canonical = placements.filter((placement) => placementMatchesLens(placement, lens) && (!query || text(placement.label).toLowerCase().includes(query)));
  const quests = canonical.filter((placement) => text(placement.kind) === "quest").sort((a, b) => Number(a.order) - Number(b.order));
  const characterBeats = canonical.filter((placement) => text(placement.kind) === "character_story_beat").sort((a, b) => text(a.lane_id).localeCompare(text(b.lane_id)) || Number(a.order) - Number(b.order));
  const adventureBeats = canonical.filter((placement) => text(placement.kind) === "adventure_beat").sort((a, b) => Number(a.order) - Number(b.order));
  const visibleLocal = localBeats.filter((beat) => localBeatMatchesLens(beat, lens) && (!query || beat.title.toLowerCase().includes(query) || beat.attachments.some((attachment) => attachment.label.toLowerCase().includes(query)))).sort((a, b) => a.order - b.order);
  const visibleProvisional = provisionalNodes.filter((idea) => provisionalIdeaMatchesLens(idea, lens) && (!query || idea.title.toLowerCase().includes(query) || idea.detail.toLowerCase().includes(query) || idea.flowTitle.toLowerCase().includes(query))).sort((a, b) => a.order - b.order);
  return <article ref={drop.setNodeRef} className={`rounded-lg border p-3 transition ${drop.isOver ? "border-fuchsia-500 bg-fuchsia-50/60 dark:bg-fuchsia-950/30" : "border-slate-200 dark:border-slate-800"}`} data-testid={`story-arc-lane-${arcId || "unassigned"}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><div className="text-[10px] font-semibold uppercase text-slate-500">{unassigned ? "Unassigned" : text(arc.type, "Story Arc")}</div><h3 className="font-semibold">{label(arc)}</h3><p className="max-w-3xl text-xs text-slate-500">{text(arc.summary)}</p></div>
      <div className="flex gap-2"><button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={onAddBeat}>Add Planning Beat</button>{!unassigned && <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} to={entityRoute("story_arc", arcId)}>Inspect Arc Record</Link>}</div>
    </div>
    <ScopedRow title="Adventure Beat Order" note="Canonical story intent inside this arc." cards={adventureBeats.map((placement) => <PlacementCard key={text(placement.id)} placement={placement} onSelect={() => onSelect({ kind: "placement", id: text(placement.id) })} />)} empty="No canonical adventure beats visible in this lens." />
    <ScopedRow title="Arc Quest Order" note="Canonical only inside this arc." cards={quests.map((placement) => <PlacementCard key={text(placement.id)} placement={placement} onSelect={() => onSelect({ kind: "placement", id: text(placement.id) })} />)} empty="No ordered quests visible in this lens." />
    <ScopedRow title="Character Presence Lanes" note="Canonical only within each character's beat order." cards={characterBeats.map((placement) => <PlacementCard key={text(placement.id)} placement={placement} onSelect={() => onSelect({ kind: "placement", id: text(placement.id) })} />)} empty="No character beats visible in this lens." />
    <ScopedRow title="Idea Studio Provisional Order" note="Linked local cards. Drag to reorder them here; details stay in Idea Studio." cards={visibleProvisional.map((idea) => <ProvisionalIdeaCard key={idea.id} idea={idea} onSelect={() => onSelect({ kind: "provisional-idea", id: idea.id })} />)} empty="Place an Idea Studio draft on this arc to see its ordered ideas here." />
    <ScopedRow title="Local Planning Beats" note="Browser-local sketches. Drag content here or move beats between lanes." cards={visibleLocal.map((beat) => <LocalBeatCard key={beat.id} beat={beat} lens={lens} onSelect={() => onSelect({ kind: "local-beat", id: beat.id })} />)} empty="Drop library content onto this lane to sketch a beat." />
  </article>;
}

function TimelineProvisionalLane({ timelineId, ideas, lens, query, onSelect }: { timelineId: string; ideas: ProvisionalTimelineNode[]; lens: Lens; query: string; onSelect: (selection: Selection) => void }) {
  const drop = useDroppable({ id: `timeline-lane:${timelineId}` });
  const visible = ideas.filter((idea) => provisionalIdeaMatchesLens(idea, lens) && (!query || idea.title.toLowerCase().includes(query) || idea.detail.toLowerCase().includes(query) || idea.flowTitle.toLowerCase().includes(query))).sort((a, b) => a.order - b.order);
  return <div ref={drop.setNodeRef} className={`rounded-lg border p-2 transition ${drop.isOver ? "border-fuchsia-500 bg-fuchsia-50/60 dark:bg-fuchsia-950/30" : "border-transparent"}`}>
    <ScopedRow title="Idea Studio Provisional Order" note="Timeline-level linked local cards. Drag to reorder; details stay in Idea Studio." cards={visible.map((idea) => <ProvisionalIdeaCard key={idea.id} idea={idea} onSelect={() => onSelect({ kind: "provisional-idea", id: idea.id })} />)} empty="Place an Idea Studio draft on this timeline to see its ordered ideas here." />
  </div>;
}

function ScopedRow({ title, note, cards, empty }: { title: string; note: string; cards: ReactNode[]; empty: string }) {
  return <div className="mt-3"><div className="mb-1 flex flex-wrap items-baseline justify-between gap-2"><div className="text-[11px] font-semibold uppercase text-slate-500">{title}</div><div className="text-[10px] text-slate-400">{note}</div></div><div className="flex min-h-24 gap-2 overflow-x-auto rounded-md border border-dashed border-slate-200 p-2 dark:border-slate-800">{cards.length ? cards : <EmptyState variant="compact" className="self-center min-w-64">{empty}</EmptyState>}</div></div>;
}

function ProvisionalIdeaCard({ idea, onSelect }: { idea: ProvisionalTimelineNode; onSelect: () => void }) {
  const dropId = `provisional:${idea.draftId}:${idea.sourceKind}:${idea.sourceId}`;
  const drop = useDroppable({ id: dropId });
  const drag = useDraggable({ id: `drag-${dropId}`, data: { dragType: "provisional-idea", draftId: idea.draftId, itemKey: idea.key } });
  return <article ref={drop.setNodeRef} className={`w-56 shrink-0 rounded-md border-2 border-dashed border-violet-400 bg-violet-50/70 p-2 text-xs dark:border-violet-700 dark:bg-violet-950/30 ${drop.isOver ? "ring-2 ring-fuchsia-500" : ""}`} data-testid={`provisional-idea-${idea.draftId}-${idea.sourceId}`}>
    <button ref={drag.setNodeRef} type="button" className={`block w-full cursor-grab text-left ${drag.isDragging ? "opacity-40" : ""}`} {...drag.attributes} {...drag.listeners}>
      <span className="block text-[10px] font-semibold uppercase text-violet-700 dark:text-violet-300">Provisional idea #{idea.order + 1}</span>
      <span className="mt-1 block font-semibold">{idea.title}</span>
    </button>
    <button type="button" className="mt-1 block w-full text-left text-[10px] text-slate-500" onClick={onSelect}>{idea.detail || `From ${idea.flowTitle}`}</button>
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <span className="rounded-full bg-white px-2 py-1 text-[9px] dark:bg-slate-900">{idea.kind.replace(/_/g, " ")}</span>
      {idea.explicitPlaceholder && <span className="rounded-full border border-dashed border-amber-400 bg-amber-50 px-2 py-1 text-[9px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">placeholder</span>}
    </div>
  </article>;
}

function PlacementCard({ placement, onSelect }: { placement: EntryRecord; onSelect: () => void }) {
  const kind = text(placement.kind);
  const source = record(placement.source);
  const character = record(placement.character);
  return <button type="button" className={`w-48 shrink-0 rounded-md border p-2 text-left text-xs ${toneForKind(kind)}`} onClick={onSelect} data-testid={`canonical-placement-${text(placement.id)}`}>
    <span className="block text-[10px] font-semibold uppercase text-slate-500">{kind.replace(/_/g, " ")} #{Number(placement.order) + 1}</span>
    <span className="mt-1 block font-semibold">{text(placement.label)}</span>
    {text(character.label) && <span className="mt-1 block text-[10px] text-slate-500">Character: {text(character.label)}</span>}
    {text(source.label) && <span className="mt-1 block text-[10px] text-slate-500">Source: {text(source.label)}</span>}
    <span className="mt-2 block text-[10px] text-slate-400">{text(placement.placement_basis, "explicit")}</span>
  </button>;
}

function LocalBeatCard({ beat, lens, onSelect }: { beat: LocalBeat; lens: Lens; onSelect: () => void }) {
  const drop = useDroppable({ id: `beat:${beat.id}` });
  const drag = useDraggable({ id: `local-beat:${beat.id}`, data: { dragType: "local-beat", beatId: beat.id } });
  const attachments = beat.attachments.filter((attachment) => roleMatchesLens(attachment.role, lens));
  return <article ref={drop.setNodeRef} className={`w-56 shrink-0 rounded-md border p-2 text-xs ${toneForKind("local")} ${drop.isOver ? "ring-2 ring-fuchsia-500" : ""}`} data-testid={`local-planning-beat-${beat.id}`}>
    <button ref={drag.setNodeRef} type="button" className={`block w-full cursor-grab text-left ${drag.isDragging ? "opacity-40" : ""}`} {...drag.attributes} {...drag.listeners}><span className="block text-[10px] font-semibold uppercase text-fuchsia-700 dark:text-fuchsia-300">Local Planning Beat</span><span className="mt-1 block font-semibold">{beat.title}</span></button>
    <button type="button" className="mt-1 block w-full text-left text-[10px] text-slate-500" onClick={onSelect}>{beat.summary || "Open to describe this beat."}</button>
    <div className="mt-2 flex flex-wrap gap-1">{attachments.map((attachment) => <span key={`${attachment.kind}:${attachment.entry_id}`} className="rounded-full bg-white px-2 py-1 text-[9px] dark:bg-slate-900">{attachment.label}</span>)}{!attachments.length && <span className="text-[9px] text-slate-400">Drop content here</span>}</div>
  </article>;
}

function EventChainSection({ events, query, onSelect }: { events: EntryRecord[]; query: string; onSelect: (id: string) => void }) {
  const visible = events.filter((event) => !query || text(event.label).toLowerCase().includes(query));
  return <AuthoringPanel title="Runtime Event Chains" subtitle="Implementation chains, not global story order." help="Use this lens to inspect event follow-up links without treating them as the whole story timeline. Select an event to inspect its nearby context in the dock."><div className="mt-3 flex gap-2 overflow-x-auto">{visible.map((event) => <button key={text(event.event_id)} type="button" className={`w-52 shrink-0 rounded-md border p-3 text-left text-xs ${toneForKind("event")}`} onClick={() => onSelect(text(event.event_id))}><span className="block font-semibold">{text(event.label)}</span><span className="mt-2 block text-[10px]">Next: {text(event.next_event_id, "No follow-up event")}</span><span className="block text-[10px]">Story beats: {Array.isArray(event.referenced_by_story_beat_ids) ? event.referenced_by_story_beat_ids.length : 0}</span></button>)}{!visible.length && <EmptyState variant="compact" title="No runtime events visible.">Adjust the search or add event links before using the runtime lens.</EmptyState>}</div></AuthoringPanel>;
}

function RelationshipSection({ title, relationships }: { title: string; relationships: EntryRecord[] }) {
  return <AuthoringPanel title={title} subtitle="Saved and inferred links that explain state dependencies." help="Use this when the state lens gets noisy. It shows relationship edges that can explain why content is connected or blocked."><div className="mt-3 max-h-96 space-y-1 overflow-auto">{relationships.map((edge) => <div key={text(edge.id)} className={`rounded border p-2 text-xs ${edge.explicit === false ? "border-dashed" : ""}`}>{text(edge.source)} <strong>{text(edge.relation)}</strong> {text(edge.target)}</div>)}{!relationships.length && <EmptyState variant="compact" title="No relationships detected.">That is okay for early drafts. Add story placements, requirements, or consequence links to build dependency context.</EmptyState>}</div></AuthoringPanel>;
}

function IssueSection({ warnings, dependencyHealth }: { warnings: EntryRecord[]; dependencyHealth: EntryRecord }) {
  const dependencyGroups = Object.entries(dependencyHealth).filter(([, value]) => Array.isArray(value) && value.length);
  return <AuthoringPanel title="Coherence And Dependency Issues" subtitle="Warnings and blockers derived from timeline and dependency analysis." help="Use this lens before committing story changes. Warnings may be acceptable while drafting; dependency issues usually need another record or relationship fixed."><div className="mt-3 grid gap-3 lg:grid-cols-2">{warnings.map((warning, index) => <div key={`${text(warning.code)}:${text(warning.entry_id)}:${text(warning.scope_kind)}:${text(warning.scope_id)}:${index}`} className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"><div className="font-semibold">{text(warning.code).replace(/_/g, " ")}</div><div className="mt-1">{text(warning.message)}</div></div>)}{dependencyGroups.map(([group, value]) => <div key={group} className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"><div className="font-semibold">{group.replace(/_/g, " ")}</div><div className="mt-1">{(value as unknown[]).length} dependency issue(s)</div></div>)}{!warnings.length && !dependencyGroups.length && <EmptyState variant="compact" title="No timeline coherence or dependency issues detected.">Continue drafting, then review the plan before commit to validate the saved bundle.</EmptyState>}</div></AuthoringPanel>;
}

function UnplacedSummary({ unplaced }: { unplaced: EntryRecord }) {
  return <AuthoringPanel title="Unplaced Content" subtitle="Counts derived from current supported placement relationships." help="Use this as a backlog signal. Unplaced content is not automatically wrong, but high counts mean the timeline has less context to navigate." collapsible defaultCollapsed collapsedSummary="Open the backlog when placing new material"><div className="mt-3 space-y-1 text-xs">{Object.entries(unplaced).map(([key, value]) => <div key={key} className="flex justify-between rounded border px-2 py-1"><span>{key.replace(/_/g, " ")}</span><strong>{Array.isArray(value) ? value.length : 0}</strong></div>)}</div></AuthoringPanel>;
}

function ProvisionalIdeaContextDock({ idea }: { idea: ProvisionalTimelineNode }) {
  return <aside id="timeline-context" className="h-fit" data-testid="story-timeline-provisional-context">
    <AuthoringPanel
      title="Idea Studio Provisional Card"
      subtitle={`${idea.flowTitle} · item ${idea.order + 1}`}
      help="This card is a live browser-local view of an Idea Studio draft. Reorder it on this lane; use Idea Studio for notes, relationships, shaping, and project links."
      actions={<Link className={`${BUTTON_CLASSES.violet} ${BUTTON_SIZES.xs}`} to={`/author/creation-flow?draft=${encodeURIComponent(idea.draftId)}`}>Open in Idea Studio</Link>}
    >
      <div className="mt-3 rounded-md border-2 border-dashed border-violet-300 bg-violet-50 p-3 text-sm dark:border-violet-800 dark:bg-violet-950/30">
        <div className="text-[10px] font-semibold uppercase text-violet-700 dark:text-violet-300">{idea.explicitPlaceholder ? "Explicit placeholder" : idea.kind.replace(/_/g, " ")}</div>
        <div className="mt-1 font-semibold">{idea.title}</div>
        {idea.detail && <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{idea.detail}</p>}
      </div>
      <p className="mt-3 text-xs text-slate-500">Placed on {idea.target.label || idea.target.canonicalId}. This provisional card is never included in the Story Timeline canonical save bundle.</p>
    </AuthoringPanel>
  </aside>;
}

function ContextDock({ selection, localBeat, placement, event, libraryEntry, libraryKind, relationships, warnings, canonicalBeats, canonicalLinks, canonicalLinkEdit, onBeginCanonicalLinkEdit, onCanonicalLinkEditChange, onCancelCanonicalLinkEdit, onUpdateBeat, onDeleteBeat, onRemoveAttachment }: { selection: Selection; localBeat?: LocalBeat; placement?: EntryRecord; event?: EntryRecord; libraryEntry?: EntryRecord; libraryKind: string; relationships: EntryRecord[]; warnings: EntryRecord[]; canonicalBeats: EntryRecord[]; canonicalLinks: EntryRecord[]; canonicalLinkEdit: CanonicalLinkEdit | null; onBeginCanonicalLinkEdit: (linkId: string) => void; onCanonicalLinkEditChange: (draft: StoryPlacementDraft) => void; onCancelCanonicalLinkEdit: () => void; onUpdateBeat: (beatId: string, patch: Partial<LocalBeat>) => void; onDeleteBeat: (beatId: string) => void; onRemoveAttachment: (beatId: string, attachment: LocalAttachment) => void }) {
  if (!selection) return <aside id="timeline-context" className="h-fit"><AuthoringPanel title="Context Dock" subtitle="Select a placement, event, library item, or local planning beat to inspect it." help="The dock keeps details beside the board so you do not have to leave the timeline while drafting."><EmptyState variant="compact" title="Nothing selected.">Select a board card, library item, or local planning beat. Drop library content directly onto a local beat to attach it.</EmptyState></AuthoringPanel></aside>;
  if (localBeat) return <aside id="timeline-context" className="h-fit" data-testid="story-timeline-context-dock"><AuthoringPanel title="Local Planning Beat" help="This beat is browser-local until you review and commit the plan. Use typed attachments to connect saved records to the planned story beat." actions={<button type="button" className="text-xs font-semibold text-red-700" onClick={() => onDeleteBeat(localBeat.id)}>Delete</button>}><label className="mt-3 block text-xs font-semibold uppercase text-slate-500">Title<input className={`${inputClass} mt-1`} value={localBeat.title} onChange={(eventValue) => onUpdateBeat(localBeat.id, { title: eventValue.target.value })} /></label><BeatTypeField value={localBeat.beat_type} onChange={(beat_type) => onUpdateBeat(localBeat.id, { beat_type })} /><label className="mt-3 block text-xs font-semibold uppercase text-slate-500">Intent / Summary<textarea className={`${inputClass} mt-1 min-h-28`} value={localBeat.summary} onChange={(eventValue) => onUpdateBeat(localBeat.id, { summary: eventValue.target.value })} /></label><div className="mt-4"><div className="text-xs font-semibold uppercase text-slate-500">Typed Attachments</div><div className="mt-2 space-y-2">{localBeat.attachments.map((attachment) => <div key={`${attachment.kind}:${attachment.entry_id}`} className="rounded border p-2 text-xs"><div className="flex items-center justify-between gap-2"><div><div className="text-[10px] font-semibold uppercase text-slate-500">{attachment.role.replace(/_/g, " ")} / {attachment.kind.replace(/_/g, " ")}</div><div className="font-semibold">{attachment.label}</div></div><button type="button" className="text-red-700" onClick={() => onRemoveAttachment(localBeat.id, attachment)}>Remove</button></div>{entityRoute(attachment.kind, attachment.entry_id) && <Link className="mt-1 inline-block text-blue-700 dark:text-blue-300" to={entityRoute(attachment.kind, attachment.entry_id)}>Inspect Attached Record</Link>}</div>)}{!localBeat.attachments.length && <EmptyState variant="compact" title="No attached content yet.">Drag library content onto this beat to connect saved records to the plan.</EmptyState>}</div></div><p className="mt-4 rounded-md border border-fuchsia-200 bg-fuchsia-50 p-2 text-xs text-fuchsia-800 dark:border-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-200">This beat remains browser-local until its preview is reviewed and committed.</p></AuthoringPanel></aside>;

  const selectedId = text(placement?.entry_id, text(event?.event_id, text(libraryEntry?.id)));
  const selectedKind = text(placement?.kind, event ? "event" : singular(libraryKind));
  const related = relationships.filter((edge) => text(edge.source).endsWith(`:${selectedId}`) || text(edge.target).endsWith(`:${selectedId}`));
  const selectedWarnings = warnings.filter((warning) => text(warning.entry_id) === selectedId);
  const entry = placement || event || libraryEntry || {};
  const attachments = rows(placement?.attachments);
  const currentBeat = canonicalBeats.find((beat) => text(beat.id) === text(placement?.entry_id));
  const laneBeats = canonicalBeats.filter((beat) => {
    if (!currentBeat) return false;
    if (text(currentBeat.story_arc_id)) return text(beat.story_arc_id) === text(currentBeat.story_arc_id);
    if (text(currentBeat.timeline_id)) return !text(beat.story_arc_id) && text(beat.timeline_id) === text(currentBeat.timeline_id);
    return !text(beat.story_arc_id) && !text(beat.timeline_id);
  }).sort((left, right) => Number(left.sort_order) - Number(right.sort_order));
  const editedLinkBelongsHere = canonicalLinkEdit?.draft.adventure_beat_id === text(placement?.entry_id);
  return <aside id="timeline-context" className="h-fit" data-testid="story-timeline-context-dock"><AuthoringPanel title={text(entry.label, label(entry))} subtitle={selectedKind.replace(/_/g, " ")} help="Inspect the selected record's placement context without leaving the board. Canonical adventure-beat links can be staged here and still require the shared preview/commit review." actions={entityRoute(selectedKind, selectedId) && <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} to={entityRoute(selectedKind, selectedId)}>Inspect Owning Workspace</Link>}><div className="mt-4 space-y-2 text-xs"><Detail label="Placement Basis" value={placement?.placement_basis} /><Detail label="Ordering Source" value={placement?.ordering_source} /><Detail label="Lane" value={placement?.lane_id} /><Detail label="Next Event" value={event?.next_event_id} /></div>
  {text(placement?.kind) === "adventure_beat" && <div className="mt-4" data-testid="canonical-link-editor"><div className="text-xs font-semibold uppercase text-slate-500">Canonical typed links</div><div className="mt-2 space-y-2">{attachments.map((attachment) => {
    const raw = canonicalLinks.find((link) => text(link.id) === text(attachment.id)) || attachment;
    const active = canonicalLinkEdit?.draft.id === text(raw.id);
    return <div key={text(raw.id)} className={`rounded border p-2 text-xs ${active ? "border-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-950/30" : ""}`}><div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{text(attachment.label, text(raw.target_id))}</div><div className="text-[10px] text-slate-500">{text(raw.role).replace(/_/g, " ")} · {text(raw.change_type).replace(/_/g, " ")}</div></div><button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => onBeginCanonicalLinkEdit(text(raw.id))}>{active ? "Reset" : "Edit link"}</button></div><LifecycleSpanVisualization link={active && canonicalLinkEdit ? storyPlacementLinkPayload(canonicalLinkEdit.draft, raw) : raw} beats={laneBeats} currentBeatId={text(placement?.entry_id)} /></div>;
  })}{!attachments.length && <EmptyState variant="compact" title="No typed links on this beat.">Attach content through a local planning beat, then review and commit it.</EmptyState>}</div>
  {editedLinkBelongsHere && canonicalLinkEdit && <div className="mt-3 rounded-md border border-fuchsia-300 p-3"><div className="mb-2 flex items-center justify-between gap-2"><div><div className="text-xs font-semibold">Editing {text(canonicalLinkEdit.original.target_id)}</div><div className="text-[10px] text-slate-500">Browser-local until Review Changes and Commit.</div></div><button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={onCancelCanonicalLinkEdit}>Cancel edit</button></div><LifecycleFields value={canonicalLinkEdit.draft} beatOptions={laneBeats} onChange={onCanonicalLinkEditChange} /></div>}
  </div>}
  <div className="mt-4"><div className="text-xs font-semibold uppercase text-slate-500">Nearby Relationships</div><div className="mt-2 max-h-64 space-y-1 overflow-auto">{related.map((edge) => <div key={text(edge.id)} className={`rounded border p-2 text-[10px] ${edge.explicit === false ? "border-dashed" : ""}`}>{text(edge.source)}<br /><strong>{text(edge.relation)}</strong><br />{text(edge.target)}</div>)}{!related.length && <EmptyState variant="compact" title="No nearby relationships found.">This record can still be placed on the timeline; add explicit links when it needs dependency or consequence context.</EmptyState>}</div></div>{selectedWarnings.length > 0 && <div className="mt-4 space-y-1">{selectedWarnings.map((warning) => <p key={text(warning.code)} className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">{text(warning.message)}</p>)}</div>}</AuthoringPanel></aside>;
}

function LifecycleSpanVisualization({ link, beats, currentBeatId }: { link: EntryRecord; beats: EntryRecord[]; currentBeatId: string }) {
  if (!beats.length) return null;
  const startId = text(link.starts_at_beat_id, currentBeatId);
  const endId = text(link.ends_at_beat_id, startId);
  const startIndex = beats.findIndex((beat) => text(beat.id) === startId);
  const endIndex = beats.findIndex((beat) => text(beat.id) === endId);
  const valid = startIndex >= 0 && endIndex >= startIndex;
  const startLabel = label(beats.find((beat) => text(beat.id) === startId), startId || "this beat");
  const endLabel = label(beats.find((beat) => text(beat.id) === endId), endId || startLabel);
  const denominator = Math.max(1, beats.length);
  const left = valid ? (startIndex / denominator) * 100 : 0;
  const width = valid ? (Math.max(1, endIndex - startIndex + 1) / denominator) * 100 : 100;
  return <div className="mt-2" data-testid={`lifecycle-span-${text(link.id)}`}><div className="relative h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><span className={`absolute inset-y-0 rounded-full ${valid ? "bg-fuchsia-500" : "bg-amber-500"}`} style={{ left: `${left}%`, width: `${width}%` }} /></div><div className="mt-1 text-[9px] text-slate-500">{valid ? `${startLabel} → ${endLabel} · ${endIndex - startIndex + 1} beat(s) in this lane` : "Duration boundary is outside this lane or reverses authored order; no cross-lane span inferred."}</div></div>;
}

function Detail({ label: detailLabel, value }: { label: string; value: unknown }) {
  if (!text(value)) return null;
  return <div className="rounded border p-2"><div className="text-[10px] font-semibold uppercase text-slate-500">{detailLabel}</div><div>{text(value)}</div></div>;
}
