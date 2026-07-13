import { Link } from "react-router-dom";
import {
  deriveCharacterPresenceRows,
  label,
  text,
  type CharacterPresenceRow,
} from "../../authoring/storyPlacement";
import type { EntryRecord } from "../../types/editorQol";
import type { EntityStoryPlacementContext } from "./useEntityStoryPlacement";

interface CharacterPresenceTimelineProps {
  characterId: string;
  characterLabel: string;
  characterPacket: EntryRecord;
  storyPacket: EntryRecord | null;
  storyContext: EntityStoryPlacementContext;
}

const lifecycleTone: Record<string, string> = {
  introduced: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  joins: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  active: "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100",
  changed: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
  injured: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
  captured: "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-100",
  leaves: "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100",
  dies: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
  returns: "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-100",
  draft: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900 dark:border-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-100",
  unplaced: "border-dashed border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200",
  usage: "border-amber-300 bg-white text-amber-900 dark:border-amber-900 dark:bg-slate-950 dark:text-amber-100",
};

const originLabels: Record<CharacterPresenceRow["origin"], string> = {
  canonical: "Canonical beat",
  character_story_beat: "Character beat",
  runtime_usage: "Usage evidence",
  local_draft: "Local draft",
  unplaced: "Unplaced content",
};

function tone(row: CharacterPresenceRow): string {
  return lifecycleTone[row.lifecycle.toLowerCase()] || "border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100";
}

function scopeLabel(row: CharacterPresenceRow, storyContext: EntityStoryPlacementContext): string {
  if (row.scope_label) return row.scope_label;
  const timeline = storyContext.timelines.get(row.timeline_id);
  const arc = storyContext.arcs.get(row.story_arc_id);
  return `${label(timeline, "Unassigned timeline")} / ${label(arc, "Unassigned arc")}`;
}

function title(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function CharacterPresenceTimeline({
  characterId,
  characterLabel,
  characterPacket,
  storyPacket,
  storyContext,
}: CharacterPresenceTimelineProps) {
  const rows = deriveCharacterPresenceRows({
    timelinePacket: storyPacket,
    characterId,
    characterLabel,
    occurrences: storyContext.occurrences,
    localStoryBeats: Array.isArray(characterPacket.story_beats) ? characterPacket.story_beats as EntryRecord[] : [],
    unplacedPresence: Array.isArray(characterPacket.unplaced_presence) ? characterPacket.unplaced_presence as EntryRecord[] : [],
  });

  const canonicalCount = rows.filter((row) => row.origin === "canonical").length;
  const draftCount = rows.filter((row) => row.origin === "local_draft").length;
  const issueCount = storyContext.warnings.length;

  return <section className="space-y-3" data-testid="character-presence-timeline">
    <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-800 dark:bg-slate-950">
      <div className="text-[10px] font-semibold uppercase text-slate-500">Presence Summary</div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Metric label="Canonical" value={canonicalCount} />
        <Metric label="Drafts" value={draftCount} />
        <Metric label="Issues" value={issueCount} />
      </div>
      <Link className="mt-2 inline-block font-semibold text-blue-700 dark:text-blue-300" to={`/author/story-timeline?track=character&entity=${encodeURIComponent(characterId)}`} target="_blank" rel="noreferrer">Inspect Full Timeline in New Tab</Link>
    </div>

    {storyContext.warnings.map((warning) => (
      <div key={warning.id} className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        {warning.message}
      </div>
    ))}

    <div className="space-y-2">
      {rows.map((row) => (
        <article key={row.id} className={`rounded border p-2 text-xs ${tone(row)}`} data-testid={`character-presence-row-${row.origin}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase opacity-70">{originLabels[row.origin]} / {title(row.source_kind)}</div>
              <div className="font-semibold">{row.label}</div>
              <div className="mt-1 text-[10px] opacity-80">{scopeLabel(row, storyContext)}</div>
            </div>
            <span className="rounded bg-white/70 px-2 py-1 text-[10px] font-semibold dark:bg-slate-950/70">{title(text(row.lifecycle, "active"))}</span>
          </div>
          {row.warning && <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">{row.warning}</div>}
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold">
            <span>{title(row.role)}</span>
            <span>{title(row.importance)}</span>
            {row.route && <Link className="underline" to={row.route}>Open source</Link>}
          </div>
        </article>
      ))}
      {rows.length === 0 && <div className="rounded border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">No character presence records found yet.</div>}
    </div>
  </section>;
}

function Metric({ label: metricLabel, value }: { label: string; value: number }) {
  return <div className="rounded border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
    <div className="text-[10px] font-semibold uppercase text-slate-500">{metricLabel}</div>
    <div className="text-lg font-semibold">{value}</div>
  </div>;
}
