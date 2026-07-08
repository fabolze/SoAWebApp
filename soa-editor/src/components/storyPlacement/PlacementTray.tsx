import { useState, type DragEvent } from "react";
import type { StoryPlacementDraft } from "../../authoring/storyPlacement";
import {
  GENERIC_STORY_PLACEMENT_PRESETS,
  applyStoryPlacementPreset,
  storyPlacementPresetIsActive,
  workspaceStoryPlacementPresets,
  type StoryPlacementPreset,
} from "../../authoring/storyPlacementPresets";

interface PlacementTrayProps {
  value: StoryPlacementDraft;
  entityLabel: string;
  onChange: (value: StoryPlacementDraft) => void;
}

function title(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function kindLabel(value: string): string {
  return title(value);
}

function roleHint(targetType: string): string {
  if (targetType === "encounter") return "Pick why this encounter matters at the selected beat. For a normal playable encounter, keep Runtime Encounter.";
  if (targetType === "dialogue") return "Pick why this dialogue matters at the selected beat. For a normal playable conversation, keep Runtime Dialogue.";
  if (targetType === "quest") return "Pick how this quest moves at the selected beat.";
  return "Pick the closest story role for the selected beat.";
}

export default function PlacementTray({ value, entityLabel, onChange }: PlacementTrayProps) {
  const [dragging, setDragging] = useState(false);
  const workspacePresets = workspaceStoryPlacementPresets(value.target_type);
  const apply = (preset: StoryPlacementPreset) => onChange(applyStoryPlacementPreset(value, preset));
  const dragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("application/x-story-placement-entity", value.target_id);
    event.dataTransfer.effectAllowed = "copy";
    setDragging(true);
  };
  const dragEnd = () => setDragging(false);
  const drop = (event: DragEvent<HTMLButtonElement>, preset: StoryPlacementPreset) => {
    event.preventDefault();
    apply(preset);
    setDragging(false);
  };

  return <section className="rounded border border-slate-200 p-2 dark:border-slate-800" data-testid="placement-tray">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="text-[10px] font-semibold uppercase text-slate-500">Step 2: Story Role</div>
        <p className="text-xs text-slate-500">{roleHint(value.target_type)}</p>
      </div>
      <div
        draggable
        onDragStart={dragStart}
        onDragEnd={dragEnd}
        className={`cursor-grab rounded border px-2 py-1 text-[10px] font-semibold active:cursor-grabbing ${dragging ? "border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100" : "border-slate-300 dark:border-slate-700"}`}
        title="Drag this record onto a placement target."
      >
        {kindLabel(value.target_type)}: {entityLabel}
      </div>
    </div>
    {workspacePresets.length > 0 && <div className="mt-3" data-testid={`story-presets-${value.target_type}`}>
      <div className="text-[10px] font-semibold uppercase text-slate-500">{kindLabel(value.target_type)} Story Actions</div>
      <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
        {workspacePresets.map((preset) => {
          const active = storyPlacementPresetIsActive(value, preset);
          return <button
            key={preset.id}
            type="button"
            className={`rounded border p-2 text-left text-xs transition ${active ? "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-950 ring-2 ring-fuchsia-100 dark:bg-fuchsia-950 dark:text-fuchsia-100 dark:ring-fuchsia-900" : "border-slate-200 hover:border-fuchsia-300 dark:border-slate-800"}`}
            onClick={() => apply(preset)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => drop(event, preset)}
            data-testid={`story-preset-${value.target_type}-${preset.id}`}
          >
            <span className="block font-semibold">{preset.label}</span>
            <span className="mt-1 block text-[10px] text-slate-500">{preset.note}</span>
            <span className="mt-2 block text-[10px] text-slate-400">{title(preset.occurrence_kind)} / {title(preset.change_type)}</span>
          </button>;
        })}
      </div>
    </div>}
    <div className="mt-3 text-[10px] font-semibold uppercase text-slate-500">Other Story Roles</div>
    <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
      {GENERIC_STORY_PLACEMENT_PRESETS.map((preset) => {
        const active = storyPlacementPresetIsActive(value, preset);
        return <button
          key={preset.id}
          type="button"
          className={`rounded border p-2 text-left text-xs transition ${active ? "border-blue-500 bg-blue-50 text-blue-950 ring-2 ring-blue-100 dark:bg-blue-950 dark:text-blue-100 dark:ring-blue-900" : "border-slate-200 hover:border-blue-300 dark:border-slate-800"}`}
          onClick={() => apply(preset)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => drop(event, preset)}
          data-testid={`placement-tray-${preset.id}`}
        >
          <span className="block font-semibold">{preset.label}</span>
          <span className="mt-1 block text-[10px] text-slate-500">{preset.note}</span>
          <span className="mt-2 block text-[10px] text-slate-400">{title(preset.occurrence_kind)} / {title(preset.change_type)}</span>
        </button>;
      })}
    </div>
  </section>;
}
