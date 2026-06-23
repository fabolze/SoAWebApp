import { Link } from "react-router-dom";
import { label, type StoryOccurrence } from "../../authoring/storyPlacement";
import type { EntryRecord } from "../../types/editorQol";

interface EntityOccurrenceTrackProps {
  occurrences: StoryOccurrence[];
  timelines: Map<string, EntryRecord>;
  arcs: Map<string, EntryRecord>;
  entityKind: string;
  onEditCanonicalLink?: (linkId: string) => void;
}

const toneByChange: Record<string, string> = {
  introduced: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  active: "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100",
  changed: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
  leaves: "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100",
  dies: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
  returns: "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-100",
};

function routeFor(kind: string, id: string): string {
  const encoded = encodeURIComponent(id);
  const routes: Record<string, string> = {
    adventure_beat: `/adventure-beats?selected=${encoded}`,
    character_story_beat: `/character-story-beats?selected=${encoded}`,
    dialogue: `/author/dialogues/${encoded}`,
    encounter: `/author/encounters/${encoded}`,
    event: `/events?selected=${encoded}`,
    story_arc: `/story-arcs?selected=${encoded}`,
    timeline: `/timelines?selected=${encoded}`,
  };
  return routes[kind] || "";
}

function occurrenceTone(occurrence: StoryOccurrence): string {
  return toneByChange[occurrence.change_type || ""] || "border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100";
}

export default function EntityOccurrenceTrack({ occurrences, timelines, arcs, entityKind, onEditCanonicalLink }: EntityOccurrenceTrackProps) {
  if (occurrences.length === 0) {
    return <p className="rounded border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">No story placements found for this {entityKind.replace(/_/g, " ")} yet.</p>;
  }

  return <div className="space-y-2" data-testid="entity-occurrence-track">
    {occurrences.map((occurrence) => {
      const timeline = timelines.get(occurrence.timeline_id);
      const arc = arcs.get(occurrence.story_arc_id);
      const sourceRoute = routeFor(occurrence.source_kind, occurrence.source_id);
      const state = occurrence.state_label || occurrence.change_type || occurrence.occurrence_kind || occurrence.role || "appearance";
      return <article key={occurrence.id} className={`rounded border p-2 text-xs ${occurrenceTone(occurrence)}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold uppercase opacity-70">{occurrence.source_kind.replace(/_/g, " ")} / {occurrence.role || "reference"}</div>
            <div className="font-semibold">{occurrence.source_label || "Untitled story moment"}</div>
          </div>
          <span className="rounded bg-white/70 px-2 py-1 text-[10px] font-semibold dark:bg-slate-950/70">{state.replace(/_/g, " ")}</span>
        </div>
        <div className="mt-2 text-[10px] opacity-80">
          {label(timeline, "Unassigned timeline")} / {label(arc, "Unassigned arc")}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-semibold">
          {sourceRoute && <Link className="underline" to={sourceRoute}>Open source</Link>}
          {occurrence.canonical_link_id && onEditCanonicalLink && <button type="button" className="underline" onClick={() => onEditCanonicalLink(occurrence.canonical_link_id!)}>Edit placement</button>}
        </div>
      </article>;
    })}
  </div>;
}
