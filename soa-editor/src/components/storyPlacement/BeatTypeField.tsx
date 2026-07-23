import {
  ADVENTURE_BEAT_TYPE_INFO,
  adventureBeatTypeDescription,
} from "../../authoring/adventureBeatTypes";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950";

export default function BeatTypeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-3">
      <label className="block text-xs font-semibold uppercase text-slate-500">
        Beat Type
        <select
          aria-describedby="story-beat-type-description"
          className={`${inputClass} mt-1`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {ADVENTURE_BEAT_TYPE_INFO.map((type) => (
            <option key={type.value} value={type.value}>{type.value}</option>
          ))}
        </select>
      </label>
      <p id="story-beat-type-description" className="mt-1 text-xs leading-relaxed text-slate-500">
        {adventureBeatTypeDescription(value)}
      </p>
      <details className="mt-2 rounded-md border border-slate-200 p-2 text-xs dark:border-slate-800">
        <summary className="cursor-pointer font-semibold text-slate-600 dark:text-slate-300">
          Compare all beat types
        </summary>
        <p className="mt-2 text-slate-500">
          A moment may do several things. Choose the primary narrative job it performs in this part of the story.
        </p>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          {ADVENTURE_BEAT_TYPE_INFO.map((type) => (
            <div key={type.value} className="rounded bg-slate-50 p-2 dark:bg-slate-950">
              <dt className="font-semibold text-slate-700 dark:text-slate-200">{type.value}</dt>
              <dd className="mt-0.5 text-slate-500">{type.description}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
