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
  deriveEntityOccurrences,
  filterBackgroundOccurrences,
  isTrackKind,
  label,
  record,
  rows,
  singular,
  STORY_TRACK_KINDS,
  text,
  type StoryOccurrence,
  type TrackKind,
} from "../authoring/storyPlacement";
import BundleReview, { type BundleReviewResult } from "../components/authoring/BundleReview";
import { AuthoringPageShell, AuthoringPanel, AuthoringSectionNav, EmptyState, StatusNotice } from "../components/authoringUi";
import { apiFetch } from "../lib/api";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import type { EntryRecord } from "../types/editorQol";
import { generateSlug, generateUlid } from "../utils/generateId";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950";
const PLAN_STORAGE_KEY = "soa.story-timeline.local-plan.v1";
const preferBeatCollision: CollisionDetection = (args) => {
  return pointerWithin(args).sort((left, right) => {
    const leftIsBeat = String(left.id).startsWith("beat:");
    const rightIsBeat = String(right.id).startsWith("beat:");
    return leftIsBeat === rightIsBeat ? 0 : leftIsBeat ? -1 : 1;
  });
};

type Lens = "story" | "cast" | "locations" | "quests" | "runtime" | "state" | "issues";
type Selection = { kind: "placement" | "local-beat" | "event" | "library"; id: string; libraryKind?: string } | null;

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
  const [review, setReview] = useState<BundleReviewResult | null>(null);
  const [previewBundle, setPreviewBundle] = useState<EntryRecord | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [saving, setSaving] = useState(false);
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
  const query = search.trim().toLowerCase();

  const arcById = useMemo(() => new Map(arcs.map((arc) => [text(arc.id), arc])), [arcs]);
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
    adventure_beat_links: plan.beats.flatMap((beat) => beat.attachments.map((attachment, index) => ({
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

  if (error) return <AuthoringPageShell><StatusNotice tone="error">{error}</StatusNotice></AuthoringPageShell>;
  if (!packet) return <AuthoringPageShell><StatusNotice>Loading Story Timeline...</StatusNotice></AuthoringPageShell>;

  return (
    <DndContext sensors={sensors} collisionDetection={preferBeatCollision} onDragEnd={onDragEnd}>
      <AuthoringPageShell>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-fuchsia-700 dark:text-fuchsia-300">Canonical Story Data + Deliberate Local Planning</div>
            <h1 className="text-2xl font-semibold">Story Timeline & Adventure Board</h1>
            <p className="text-sm text-slate-500">Arrange a playable story shape without pretending scoped quest, character, and event order is one canonical sequence.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Metric value={placements.length} label="canonical placements" />
            <Metric value={plan.beats.length} label="local planning beats" />
            <Metric value={warnings.length} label="coherence warnings" warning={warnings.length > 0} />
            <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={!plan.beats.length || saving} onClick={() => submitPlan(false)}>Review Plan</button>
            <button type="button" className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.sm}`} disabled={!plan.beats.length} onClick={() => { setPlan({ beats: [] }); setSelection(null); }}>Clear Local Plan</button>
          </div>
        </header>

        {(review || mutationError) && <BundleReview result={review} title="Canonical Commit Review" description="Preview validates the complete beat and typed-link bundle without writing it." variant="inline" commitLabel="Commit Plan" cancelLabel="Close Review" saving={saving} error={mutationError} testId="story-timeline-plan-review" onCommit={() => void submitPlan(true)} onCancel={() => { setReview(null); setPreviewBundle(null); setMutationError(""); }} />}

        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
          <AuthoringSectionNav sections={[
            { id: "timeline-filters", label: "Filters", summary: "Search, focus, and lenses" },
            { id: "timeline-navigator", label: "Navigator", summary: "Timelines, arcs, and entities" },
            { id: "timeline-library", label: "Library", summary: "Saved content to place" },
            { id: "story-timeline-canvas", label: "Canvas", summary: "Timeline bands and lenses" },
            { id: "timeline-context", label: "Context", summary: "Selection details and warnings" },
          ]} />
          <div className="min-w-0 space-y-4">
        <AuthoringPanel
          id="timeline-filters"
          title="Timeline Lenses And Filters"
          subtitle="Narrow the board without changing saved story order."
          help="Use these controls to focus the canvas by text, timeline, arc, or lens. Filters only change what is visible on this page; they do not save anything."
        >
          <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
            <label className="block text-xs font-semibold uppercase text-slate-500">Find Content<input className={`${inputClass} mt-1`} value={search} placeholder="Search the board and library..." onChange={(event) => setSearch(event.target.value)} /></label>
            <label className="block text-xs font-semibold uppercase text-slate-500">Timeline Focus<select className={`${inputClass} mt-1`} value={timelineFocus} onChange={(event) => { setTimelineFocus(event.target.value); setArcFocus(""); }}><option value="">All timelines</option>{timelines.map((timeline) => <option key={text(timeline.id)} value={text(timeline.id)}>{label(timeline)}</option>)}<option value="__unassigned">Unassigned story space</option></select></label>
            <label className="block text-xs font-semibold uppercase text-slate-500">Arc Focus<select className={`${inputClass} mt-1`} value={arcFocus} onChange={(event) => setArcFocus(event.target.value)}><option value="">All visible arcs</option>{arcs.filter((arc) => !timelineFocus || timelineFocus === "__unassigned" ? !text(arc.timeline_id) : text(arc.timeline_id) === timelineFocus).map((arc) => <option key={text(arc.id)} value={text(arc.id)}>{label(arc)}</option>)}</select></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["story", "cast", "locations", "quests", "runtime", "state", "issues"] as Lens[]).map((value) => <button key={value} type="button" className={`rounded-full border px-3 py-1 text-xs font-semibold ${lens === value ? "border-fuchsia-600 bg-fuchsia-600 text-white" : "border-slate-300 dark:border-slate-700"}`} onClick={() => setLens(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
          </div>
        </AuthoringPanel>

        <TimelineNavigator
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
        />

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_330px]">
          <aside className="space-y-4">
            <AuthoringPanel
              id="timeline-library"
              title="Content Library"
              subtitle="Drag content onto an arc lane to sketch a local beat, or onto an existing local beat to attach it."
              help="Library cards reference saved records. Dragging them creates or updates browser-local planning beats until you review and commit the plan."
              collapsible
              storageKey="soa.story-timeline.content-library.collapsed"
              collapsedSummary={`${libraryRows.length} visible ${libraryKind.replace(/_/g, " ")}`}
            >
              <select className={`${inputClass} mt-3`} value={libraryKind} onChange={(event) => setLibraryKind(event.target.value)}>
                {["locations", "characters", "quests", "events", "dialogues", "encounters", "lore_entries", "items", "factions"].map((kind) => <option key={kind} value={kind}>{kind.replace(/_/g, " ")}</option>)}
              </select>
              <div className="mt-3 max-h-[52rem] space-y-2 overflow-auto">
                {libraryRows.map((entry) => {
                  const kind = singular(libraryKind);
                  const attachment = { kind, entry_id: text(entry.id), label: label(entry), role: attachmentRole(kind) };
                  return <LibraryCard key={text(entry.id)} kind={kind} entry={entry} onSelect={() => setSelection({ kind: "library", id: text(entry.id), libraryKind })} onAttach={selectedLocalBeat ? () => attachToBeat(selectedLocalBeat.id, attachment) : undefined} />;
                })}
                {!libraryRows.length && <EmptyState variant="compact" title={`No matching ${libraryKind.replace(/_/g, " ")}.`}>Adjust the search text or switch library type to find content to place on the board.</EmptyState>}
              </div>
            </AuthoringPanel>
            <UnplacedSummary unplaced={record(packet.unplaced)} />
          </aside>

          <main className="min-w-0 space-y-4" data-testid="story-timeline-canvas">
            {visibleTimelines.map((timeline) => {
              const timelineArcs = arcs.filter((arc) => text(arc.timeline_id) === text(timeline.id) && (!arcFocus || text(arc.id) === arcFocus));
              return <TimelineBand key={text(timeline.id)} timeline={timeline} arcs={timelineArcs} placements={placements} localBeats={plan.beats} lens={lens} query={query} onSelect={setSelection} onAddBeat={addBeat} />;
            })}
            {showUnassigned && (!arcFocus || unassignedArcs.some((arc) => text(arc.id) === arcFocus)) && <TimelineBand timeline={{ id: "", name: "Unassigned Story Space", description: "Content without a modeled timeline or arc." }} arcs={unassignedArcs.filter((arc) => !arcFocus || text(arc.id) === arcFocus)} placements={placements} localBeats={plan.beats} lens={lens} query={query} onSelect={setSelection} onAddBeat={addBeat} unassigned />}
            {lens === "runtime" && <EventChainSection events={eventChains} query={query} onSelect={(id) => setSelection({ kind: "event", id })} />}
            {lens === "state" && <RelationshipSection title="State & Dependency Context" relationships={dependencyEdges} />}
            {lens === "issues" && <IssueSection warnings={warnings} dependencyHealth={record(record(packet.health).dependency)} />}
            {!timelines.length && !arcs.length && placements.length === 0 && plan.beats.length === 0 && <EmptyState title="The story space is empty." className="text-center">Create timelines and story arcs, or drag library content into Unassigned Story Space to begin a browser-local plan.</EmptyState>}
          </main>

          <ContextDock
            selection={selection}
            localBeat={selectedLocalBeat}
            placement={selectedPlacement}
            event={selectedEvent}
            libraryEntry={selectedLibrary}
            libraryKind={selection?.libraryKind || ""}
            relationships={[...relationships, ...dependencyEdges]}
            warnings={warnings}
            onUpdateBeat={updateBeat}
            onDeleteBeat={(beatId) => { setPlan((current) => ({ beats: current.beats.filter((beat) => beat.id !== beatId) })); setSelection(null); }}
            onRemoveAttachment={(beatId, attachment) => updateBeat(beatId, { attachments: selectedLocalBeat?.attachments.filter((row) => row !== attachment) || [] })}
          />
        </div>
          </div>
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

function LibraryCard({ kind, entry, onSelect, onAttach }: { kind: string; entry: EntryRecord; onSelect: () => void; onAttach?: () => void }) {
  const drag = useDraggable({ id: `library:${kind}:${text(entry.id)}`, data: { dragType: "library", kind, entryId: text(entry.id), label: label(entry) } });
  return <article ref={drag.setNodeRef} className={`rounded-md border p-2 text-xs ${drag.isDragging ? "opacity-40" : ""}`}>
    <button type="button" className="block w-full text-left" onClick={onSelect}><span className="block text-[10px] font-semibold uppercase text-slate-500">{kind.replace(/_/g, " ")}</span><span className="block truncate font-semibold">{label(entry)}</span></button>
    <div className="mt-2 flex flex-wrap gap-1"><button type="button" className="cursor-grab rounded border px-2 py-1 text-[10px] font-semibold" {...drag.attributes} {...drag.listeners}>Drag to timeline</button>{onAttach && <button type="button" className="rounded border border-fuchsia-300 px-2 py-1 text-[10px] font-semibold text-fuchsia-700 dark:text-fuchsia-300" onClick={onAttach}>Attach to Selected Beat</button>}</div>
  </article>;
}

function TimelineBand({ timeline, arcs, placements, localBeats, lens, query, onSelect, onAddBeat, unassigned = false }: { timeline: EntryRecord; arcs: EntryRecord[]; placements: EntryRecord[]; localBeats: LocalBeat[]; lens: Lens; query: string; onSelect: (selection: Selection) => void; onAddBeat: (arcId: string) => void; unassigned?: boolean }) {
  const timelineId = text(timeline.id);
  const timelinePlacements = placements
    .filter((placement) => !text(placement.story_arc_id) && text(placement.timeline_id) === timelineId)
    .filter((placement) => placementMatchesLens(placement, lens) && (!query || text(placement.label).toLowerCase().includes(query)))
    .sort((left, right) => Number(left.order) - Number(right.order));
  const unassignedPlacements = placements.filter((placement) => !text(placement.story_arc_id) && !text(placement.timeline_id));
  const unassignedBeats = localBeats.filter((beat) => !beat.story_arc_id);
  return <AuthoringPanel
    title={label(timeline)}
    subtitle={text(timeline.description, "Arc order inside a timeline is not modeled; lanes are shown without implying sequence.")}
    help={unassigned ? "Use this planning space for content that does not have a saved timeline or arc yet." : "This band groups saved arcs and placements for one timeline. Arc lanes are for navigation and planning; they do not imply global order beyond saved placement data."}
    actions={!unassigned && <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} to={entityRoute("timeline", timelineId)}>Inspect Timeline Record</Link>}
    testId={`timeline-band-${timelineId || "unassigned"}`}
  >
    <div className="space-y-3">
      {!unassigned && timelinePlacements.length > 0 && <ScopedRow title="Timeline-Level Adventure Beats" note="Canonical in this timeline, outside a specific arc." cards={timelinePlacements.map((placement) => <PlacementCard key={text(placement.id)} placement={placement} onSelect={() => onSelect({ kind: "placement", id: text(placement.id) })} />)} empty="" />}
      {arcs.map((arc) => <ArcLane key={text(arc.id)} arc={arc} placements={placements.filter((placement) => text(placement.story_arc_id) === text(arc.id))} localBeats={localBeats.filter((beat) => beat.story_arc_id === text(arc.id))} lens={lens} query={query} onSelect={onSelect} onAddBeat={() => onAddBeat(text(arc.id))} />)}
      {unassigned && <ArcLane arc={{ id: "", title: "Unassigned Lane", summary: "Local planning and character beats without an arc." }} placements={unassignedPlacements} localBeats={unassignedBeats} lens={lens} query={query} onSelect={onSelect} onAddBeat={() => onAddBeat("")} unassigned />}
      {!arcs.length && !unassigned && <EmptyState title="This timeline has no story arcs.">Create arcs to split the timeline into workable lanes, or keep drafting in unassigned story space.</EmptyState>}
    </div>
  </AuthoringPanel>;
}

function ArcLane({ arc, placements, localBeats, lens, query, onSelect, onAddBeat, unassigned = false }: { arc: EntryRecord; placements: EntryRecord[]; localBeats: LocalBeat[]; lens: Lens; query: string; onSelect: (selection: Selection) => void; onAddBeat: () => void; unassigned?: boolean }) {
  const arcId = text(arc.id);
  const drop = useDroppable({ id: `lane:${arcId || "unassigned"}` });
  const canonical = placements.filter((placement) => placementMatchesLens(placement, lens) && (!query || text(placement.label).toLowerCase().includes(query)));
  const quests = canonical.filter((placement) => text(placement.kind) === "quest").sort((a, b) => Number(a.order) - Number(b.order));
  const characterBeats = canonical.filter((placement) => text(placement.kind) === "character_story_beat").sort((a, b) => text(a.lane_id).localeCompare(text(b.lane_id)) || Number(a.order) - Number(b.order));
  const adventureBeats = canonical.filter((placement) => text(placement.kind) === "adventure_beat").sort((a, b) => Number(a.order) - Number(b.order));
  const visibleLocal = localBeats.filter((beat) => localBeatMatchesLens(beat, lens) && (!query || beat.title.toLowerCase().includes(query) || beat.attachments.some((attachment) => attachment.label.toLowerCase().includes(query)))).sort((a, b) => a.order - b.order);
  return <article ref={drop.setNodeRef} className={`rounded-lg border p-3 transition ${drop.isOver ? "border-fuchsia-500 bg-fuchsia-50/60 dark:bg-fuchsia-950/30" : "border-slate-200 dark:border-slate-800"}`} data-testid={`story-arc-lane-${arcId || "unassigned"}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><div className="text-[10px] font-semibold uppercase text-slate-500">{unassigned ? "Unassigned" : text(arc.type, "Story Arc")}</div><h3 className="font-semibold">{label(arc)}</h3><p className="max-w-3xl text-xs text-slate-500">{text(arc.summary)}</p></div>
      <div className="flex gap-2"><button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={onAddBeat}>Add Planning Beat</button>{!unassigned && <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} to={entityRoute("story_arc", arcId)}>Inspect Arc Record</Link>}</div>
    </div>
    <ScopedRow title="Adventure Beat Order" note="Canonical story intent inside this arc." cards={adventureBeats.map((placement) => <PlacementCard key={text(placement.id)} placement={placement} onSelect={() => onSelect({ kind: "placement", id: text(placement.id) })} />)} empty="No canonical adventure beats visible in this lens." />
    <ScopedRow title="Arc Quest Order" note="Canonical only inside this arc." cards={quests.map((placement) => <PlacementCard key={text(placement.id)} placement={placement} onSelect={() => onSelect({ kind: "placement", id: text(placement.id) })} />)} empty="No ordered quests visible in this lens." />
    <ScopedRow title="Character Presence Lanes" note="Canonical only within each character's beat order." cards={characterBeats.map((placement) => <PlacementCard key={text(placement.id)} placement={placement} onSelect={() => onSelect({ kind: "placement", id: text(placement.id) })} />)} empty="No character beats visible in this lens." />
    <ScopedRow title="Local Planning Beats" note="Browser-local sketches. Drag content here or move beats between lanes." cards={visibleLocal.map((beat) => <LocalBeatCard key={beat.id} beat={beat} lens={lens} onSelect={() => onSelect({ kind: "local-beat", id: beat.id })} />)} empty="Drop library content onto this lane to sketch a beat." />
  </article>;
}

function ScopedRow({ title, note, cards, empty }: { title: string; note: string; cards: ReactNode[]; empty: string }) {
  return <div className="mt-3"><div className="mb-1 flex flex-wrap items-baseline justify-between gap-2"><div className="text-[11px] font-semibold uppercase text-slate-500">{title}</div><div className="text-[10px] text-slate-400">{note}</div></div><div className="flex min-h-24 gap-2 overflow-x-auto rounded-md border border-dashed border-slate-200 p-2 dark:border-slate-800">{cards.length ? cards : <EmptyState variant="compact" className="self-center min-w-64">{empty}</EmptyState>}</div></div>;
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
  return <AuthoringPanel title="Unplaced Content" subtitle="Counts derived from current supported placement relationships." help="Use this as a backlog signal. Unplaced content is not automatically wrong, but high counts mean the timeline has less context to navigate."><div className="mt-3 space-y-1 text-xs">{Object.entries(unplaced).map(([key, value]) => <div key={key} className="flex justify-between rounded border px-2 py-1"><span>{key.replace(/_/g, " ")}</span><strong>{Array.isArray(value) ? value.length : 0}</strong></div>)}</div></AuthoringPanel>;
}

function ContextDock({ selection, localBeat, placement, event, libraryEntry, libraryKind, relationships, warnings, onUpdateBeat, onDeleteBeat, onRemoveAttachment }: { selection: Selection; localBeat?: LocalBeat; placement?: EntryRecord; event?: EntryRecord; libraryEntry?: EntryRecord; libraryKind: string; relationships: EntryRecord[]; warnings: EntryRecord[]; onUpdateBeat: (beatId: string, patch: Partial<LocalBeat>) => void; onDeleteBeat: (beatId: string) => void; onRemoveAttachment: (beatId: string, attachment: LocalAttachment) => void }) {
  if (!selection) return <aside id="timeline-context" className="h-fit"><AuthoringPanel title="Context Dock" subtitle="Select a placement, event, library item, or local planning beat to inspect it." help="The dock keeps details beside the board so you do not have to leave the timeline while drafting."><EmptyState variant="compact" title="Nothing selected.">Select a board card, library item, or local planning beat. Drop library content directly onto a local beat to attach it.</EmptyState></AuthoringPanel></aside>;
  if (localBeat) return <aside id="timeline-context" className="h-fit" data-testid="story-timeline-context-dock"><AuthoringPanel title="Local Planning Beat" help="This beat is browser-local until you review and commit the plan. Use typed attachments to connect saved records to the planned story beat." actions={<button type="button" className="text-xs font-semibold text-red-700" onClick={() => onDeleteBeat(localBeat.id)}>Delete</button>}><label className="mt-3 block text-xs font-semibold uppercase text-slate-500">Title<input className={`${inputClass} mt-1`} value={localBeat.title} onChange={(eventValue) => onUpdateBeat(localBeat.id, { title: eventValue.target.value })} /></label><label className="mt-3 block text-xs font-semibold uppercase text-slate-500">Beat Type<select className={`${inputClass} mt-1`} value={localBeat.beat_type} onChange={(eventValue) => onUpdateBeat(localBeat.id, { beat_type: eventValue.target.value })}>{["Hook", "Introduction", "Discovery", "Decision", "Conflict", "Revelation", "Reversal", "Climax", "Recovery", "Payoff", "Other"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="mt-3 block text-xs font-semibold uppercase text-slate-500">Intent / Summary<textarea className={`${inputClass} mt-1 min-h-28`} value={localBeat.summary} onChange={(eventValue) => onUpdateBeat(localBeat.id, { summary: eventValue.target.value })} /></label><div className="mt-4"><div className="text-xs font-semibold uppercase text-slate-500">Typed Attachments</div><div className="mt-2 space-y-2">{localBeat.attachments.map((attachment) => <div key={`${attachment.kind}:${attachment.entry_id}`} className="rounded border p-2 text-xs"><div className="flex items-center justify-between gap-2"><div><div className="text-[10px] font-semibold uppercase text-slate-500">{attachment.role.replace(/_/g, " ")} / {attachment.kind.replace(/_/g, " ")}</div><div className="font-semibold">{attachment.label}</div></div><button type="button" className="text-red-700" onClick={() => onRemoveAttachment(localBeat.id, attachment)}>Remove</button></div>{entityRoute(attachment.kind, attachment.entry_id) && <Link className="mt-1 inline-block text-blue-700 dark:text-blue-300" to={entityRoute(attachment.kind, attachment.entry_id)}>Inspect Attached Record</Link>}</div>)}{!localBeat.attachments.length && <EmptyState variant="compact" title="No attached content yet.">Drag library content onto this beat to connect saved records to the plan.</EmptyState>}</div></div><p className="mt-4 rounded-md border border-fuchsia-200 bg-fuchsia-50 p-2 text-xs text-fuchsia-800 dark:border-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-200">This beat remains browser-local until its preview is reviewed and committed.</p></AuthoringPanel></aside>;

  const selectedId = text(placement?.entry_id, text(event?.event_id, text(libraryEntry?.id)));
  const selectedKind = text(placement?.kind, event ? "event" : singular(libraryKind));
  const related = relationships.filter((edge) => text(edge.source).endsWith(`:${selectedId}`) || text(edge.target).endsWith(`:${selectedId}`));
  const selectedWarnings = warnings.filter((warning) => text(warning.entry_id) === selectedId);
  const entry = placement || event || libraryEntry || {};
  return <aside id="timeline-context" className="h-fit" data-testid="story-timeline-context-dock"><AuthoringPanel title={text(entry.label, label(entry))} subtitle={selectedKind.replace(/_/g, " ")} help="Inspect the selected record's placement context without leaving the board. Use the inspect link when you need to edit the owning record." actions={entityRoute(selectedKind, selectedId) && <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} to={entityRoute(selectedKind, selectedId)}>Inspect Owning Workspace</Link>}><div className="mt-4 space-y-2 text-xs"><Detail label="Placement Basis" value={placement?.placement_basis} /><Detail label="Ordering Source" value={placement?.ordering_source} /><Detail label="Lane" value={placement?.lane_id} /><Detail label="Next Event" value={event?.next_event_id} /></div><div className="mt-4"><div className="text-xs font-semibold uppercase text-slate-500">Nearby Relationships</div><div className="mt-2 max-h-64 space-y-1 overflow-auto">{related.map((edge) => <div key={text(edge.id)} className={`rounded border p-2 text-[10px] ${edge.explicit === false ? "border-dashed" : ""}`}>{text(edge.source)}<br /><strong>{text(edge.relation)}</strong><br />{text(edge.target)}</div>)}{!related.length && <EmptyState variant="compact" title="No nearby relationships found.">This record can still be placed on the timeline; add explicit links when it needs dependency or consequence context.</EmptyState>}</div></div>{selectedWarnings.length > 0 && <div className="mt-4 space-y-1">{selectedWarnings.map((warning) => <p key={text(warning.code)} className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">{text(warning.message)}</p>)}</div>}</AuthoringPanel></aside>;
}

function Detail({ label: detailLabel, value }: { label: string; value: unknown }) {
  if (!text(value)) return null;
  return <div className="rounded border p-2"><div className="text-[10px] font-semibold uppercase text-slate-500">{detailLabel}</div><div>{text(value)}</div></div>;
}
