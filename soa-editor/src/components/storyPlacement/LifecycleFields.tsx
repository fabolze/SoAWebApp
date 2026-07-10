import {
  STORY_CHANGE_TYPES,
  STORY_IMPORTANCE_LEVELS,
  STORY_OCCURRENCE_KINDS,
  STORY_PLACEMENT_ROLES,
  label,
  text,
  type StoryPlacementDraft,
} from "../../authoring/storyPlacement";
import type { EntryRecord } from "../../types/editorQol";

interface LifecycleFieldsProps {
  value: StoryPlacementDraft;
  beatOptions: EntryRecord[];
  onChange: (value: StoryPlacementDraft) => void;
}

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950";

function title(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function LifecycleFields({ value, beatOptions, onChange }: LifecycleFieldsProps) {
  const patch = (patchValue: Partial<StoryPlacementDraft>) => onChange({ ...value, ...patchValue });
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
    <div className="col-span-full rounded border border-blue-200 bg-blue-50 p-2 text-[10px] text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">These details describe how this record appears in the story. They affect timeline context and continuity; they do not change the encounter, dialogue, quest, or reward record itself.</div>
    <label className="block text-[10px] font-semibold uppercase text-slate-500">Story role
      <select className={`${inputClass} mt-1 normal-case`} value={value.role} onChange={(event) => patch({ role: event.target.value as StoryPlacementDraft["role"] })}>
        {STORY_PLACEMENT_ROLES.map((option) => <option key={option} value={option}>{title(option)}</option>)}
      </select>
    </label>
    <label className="block text-[10px] font-semibold uppercase text-slate-500">Story appearance
      <select className={`${inputClass} mt-1 normal-case`} value={value.occurrence_kind} onChange={(event) => patch({ occurrence_kind: event.target.value as StoryPlacementDraft["occurrence_kind"] })}>
        {STORY_OCCURRENCE_KINDS.map((option) => <option key={option} value={option}>{title(option)}</option>)}
      </select>
    </label>
    <label className="block text-[10px] font-semibold uppercase text-slate-500">Player/world change
      <select className={`${inputClass} mt-1 normal-case`} value={value.change_type} onChange={(event) => patch({ change_type: event.target.value as StoryPlacementDraft["change_type"] })}>
        {STORY_CHANGE_TYPES.map((option) => <option key={option} value={option}>{title(option)}</option>)}
      </select>
    </label>
    <label className="block text-[10px] font-semibold uppercase text-slate-500">Story importance
      <select className={`${inputClass} mt-1 normal-case`} value={value.importance} onChange={(event) => patch({ importance: event.target.value as StoryPlacementDraft["importance"] })}>
        {STORY_IMPORTANCE_LEVELS.map((option) => <option key={option} value={option}>{title(option)}</option>)}
      </select>
    </label>
    <label className="block text-[10px] font-semibold uppercase text-slate-500 [grid-column:1/-1]">Visible state label
      <input className={`${inputClass} mt-1 normal-case`} value={value.state_label} onChange={(event) => patch({ state_label: event.target.value })} />
    </label>
    <label className="block text-[10px] font-semibold uppercase text-slate-500">Begins at story beat
      <select className={`${inputClass} mt-1 normal-case`} value={value.starts_at_beat_id} onChange={(event) => patch({ starts_at_beat_id: event.target.value })}>
        <option value="">This beat only</option>
        {beatOptions.map((beat) => <option key={text(beat.id)} value={text(beat.id)}>{label(beat)}</option>)}
      </select>
    </label>
    <label className="block text-[10px] font-semibold uppercase text-slate-500">Ends at story beat
      <select className={`${inputClass} mt-1 normal-case`} value={value.ends_at_beat_id} onChange={(event) => patch({ ends_at_beat_id: event.target.value })}>
        <option value="">No explicit end</option>
        {beatOptions.map((beat) => <option key={text(beat.id)} value={text(beat.id)}>{label(beat)}</option>)}
      </select>
    </label>
    <label className="block text-[10px] font-semibold uppercase text-slate-500 [grid-column:1/-1]">Continuity group
      <input className={`${inputClass} mt-1 normal-case`} value={value.continuity_group_id} onChange={(event) => patch({ continuity_group_id: event.target.value })} />
    </label>
    <label className="block text-[10px] font-semibold uppercase text-slate-500 [grid-column:1/-1]">Notes
      <textarea className={`${inputClass} mt-1 min-h-16 normal-case`} value={value.notes} onChange={(event) => patch({ notes: event.target.value })} />
    </label>
  </div>;
}
