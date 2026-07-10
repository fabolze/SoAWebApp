import { Link } from "react-router-dom";
import { label, record, rows, text, type StoryOccurrence, type TrackKind } from "../../authoring/storyPlacement";
import type { EntryRecord } from "../../types/editorQol";

interface StoryContextStripProps {
  packet: EntryRecord | null;
  entityKind: TrackKind;
  entityId: string;
  occurrences: StoryOccurrence[];
  warnings: { id: string; message: string }[];
}

function routeForOccurrence(occurrence: StoryOccurrence | undefined): string {
  if (!occurrence) return "";
  const encoded = encodeURIComponent(occurrence.source_id);
  const routes: Record<string, string> = {
    adventure_beat: `/adventure-beats?selected=${encoded}`,
    character_story_beat: `/character-story-beats?selected=${encoded}`,
    event: `/events?selected=${encoded}`,
  };
  return routes[occurrence.source_kind] || "";
}

function nodeKey(kind: TrackKind, id: string): string {
  return `${kind}:${id}`;
}

function formatKind(kind: TrackKind): string {
  return kind.replace(/_/g, " ");
}

function emptyContextLabel(kind: TrackKind): string {
  if (kind === "encounter") return "This encounter is not on the story timeline yet";
  return `This ${formatKind(kind)} is not on the story timeline yet`;
}

function emptyContextHint(kind: TrackKind): string {
  if (kind === "encounter") return "Choose an adventure beat below when you want the story timeline to know when this encounter happens.";
  return "Choose an adventure beat below when this record needs story order, continuity warnings, or consequences.";
}

export default function StoryContextStrip({ packet, entityKind, entityId, occurrences, warnings }: StoryContextStripProps) {
  const nearest = occurrences[0];
  const timelines = new Map(rows(packet?.timelines).map((entry) => [text(entry.id), entry]));
  const arcs = new Map(rows(packet?.story_arcs).map((entry) => [text(entry.id), entry]));
  const timeline = timelines.get(nearest?.timeline_id || "");
  const arc = arcs.get(nearest?.story_arc_id || "");
  const dependencyEdges = rows(record(packet?.dependency_index).edges).filter((edge) => {
    const key = nodeKey(entityKind, entityId);
    return text(edge.source) === key || text(edge.target) === key;
  });
  const sourceRoute = routeForOccurrence(nearest);

  return <section className="rounded border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-800 dark:bg-slate-950" data-testid="story-context-strip">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase text-slate-500">Story Context</div>
        <div className="truncate font-semibold">{nearest ? nearest.source_label || "Untitled story moment" : emptyContextLabel(entityKind)}</div>
        <div className="mt-0.5 text-[10px] text-slate-500">{nearest ? `${label(timeline, "Unassigned timeline")} / ${label(arc, "Unassigned arc")}` : emptyContextHint(entityKind)}</div>
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="rounded bg-white px-2 py-1 text-[10px] font-semibold dark:bg-slate-900">{occurrences.length} occurrence{occurrences.length === 1 ? "" : "s"}</span>
        <span className="rounded bg-white px-2 py-1 text-[10px] font-semibold dark:bg-slate-900">{dependencyEdges.length} dependenc{dependencyEdges.length === 1 ? "y" : "ies"}</span>
        <span className="rounded bg-white px-2 py-1 text-[10px] font-semibold dark:bg-slate-900">{warnings.length} warning{warnings.length === 1 ? "" : "s"}</span>
      </div>
    </div>
    <div className="mt-2 flex flex-wrap gap-2">
      <Link
        className="font-semibold text-blue-700 dark:text-blue-300"
        to={`/author/story-timeline?track=${encodeURIComponent(entityKind)}&entity=${encodeURIComponent(entityId)}`}
        target="_blank"
        rel="noreferrer"
      >
        Inspect Full Story Timeline In New Tab
      </Link>
      {sourceRoute && <Link className="font-semibold text-blue-700 dark:text-blue-300" to={sourceRoute}>Inspect Nearest Story Beat</Link>}
    </div>
  </section>;
}
