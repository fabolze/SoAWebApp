import { useState, type DragEvent } from "react";
import type { StoryPlacementDraft } from "../../authoring/storyPlacement";

interface PlacementTrayProps {
  value: StoryPlacementDraft;
  entityLabel: string;
  onChange: (value: StoryPlacementDraft) => void;
}

type TrayPreset = Pick<StoryPlacementDraft, "role" | "occurrence_kind" | "change_type" | "importance"> & {
  id: string;
  label: string;
  note: string;
};

const presets: TrayPreset[] = [
  { id: "setting", label: "Setting", note: "Where this beat happens.", role: "setting", occurrence_kind: "appearance", change_type: "active", importance: "minor" },
  { id: "cast", label: "Cast", note: "Who appears in the scene.", role: "cast", occurrence_kind: "appearance", change_type: "active", importance: "minor" },
  { id: "runtime", label: "Runtime", note: "What plays or triggers here.", role: "runtime", occurrence_kind: "appearance", change_type: "active", importance: "major" },
  { id: "state", label: "State", note: "A story state changes here.", role: "state", occurrence_kind: "transition", change_type: "changed", importance: "major" },
  { id: "reward", label: "Reward", note: "The player gains this here.", role: "reward", occurrence_kind: "reward", change_type: "obtained", importance: "major" },
  { id: "requirement", label: "Requirement", note: "This is needed here.", role: "reference", occurrence_kind: "requirement", change_type: "active", importance: "major" },
  { id: "reference", label: "Reference", note: "Mentioned or contextual.", role: "reference", occurrence_kind: "reference", change_type: "none", importance: "minor" },
  { id: "player_journey", label: "Player Journey", note: "Quest or path beat.", role: "player_journey", occurrence_kind: "appearance", change_type: "active", importance: "major" },
];

function title(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function PlacementTray({ value, entityLabel, onChange }: PlacementTrayProps) {
  const [dragging, setDragging] = useState(false);
  const activeId = presets.find((preset) =>
    preset.role === value.role
    && preset.occurrence_kind === value.occurrence_kind
    && preset.change_type === value.change_type
    && preset.importance === value.importance
  )?.id;
  const apply = ({ role, occurrence_kind, change_type, importance }: TrayPreset) => onChange({ ...value, role, occurrence_kind, change_type, importance });
  const dragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("application/x-story-placement-entity", value.target_id);
    event.dataTransfer.effectAllowed = "copy";
    setDragging(true);
  };
  const dragEnd = () => setDragging(false);
  const drop = (event: DragEvent<HTMLButtonElement>, preset: TrayPreset) => {
    event.preventDefault();
    apply(preset);
    setDragging(false);
  };

  return <section className="rounded border border-slate-200 p-2 dark:border-slate-800" data-testid="placement-tray">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="text-[10px] font-semibold uppercase text-slate-500">Placement Tray</div>
        <p className="text-xs text-slate-500">Choose how this record matters in the selected beat.</p>
      </div>
      <div
        draggable
        onDragStart={dragStart}
        onDragEnd={dragEnd}
        className={`cursor-grab rounded border px-2 py-1 text-[10px] font-semibold active:cursor-grabbing ${dragging ? "border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100" : "border-slate-300 dark:border-slate-700"}`}
        title="Drag this record onto a placement target."
      >
        {entityLabel}
      </div>
    </div>
    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {presets.map((preset) => {
        const active = preset.id === activeId;
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
