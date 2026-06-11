/* eslint-disable react-refresh/only-export-components */
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { findDatasetBySchema } from "../config/editorDatasets";
import { useEditorStack } from "../components/EditorStackContext";
import { apiFetch } from "../lib/api";
import { generateSlug } from "../utils/generateId";
import type { SchemaDefinition, SchemaFieldConfig } from "../components/schemaForm/types";
import type { EntryRecord } from "../types/editorQol";

export interface AuthoringContext {
  schemaName: string;
  schema: SchemaDefinition;
  data: EntryRecord;
  onChange: (next: EntryRecord) => void;
}

export interface EditableFieldSpec {
  key: string;
  label?: string;
  kind?: "text" | "textarea" | "number" | "select" | "reference" | "boolean";
  reference?: string;
  options?: string[];
  placeholder?: string;
}

export type ItemAuthoringViewModel = EntryRecord;
export type ShopAuthoringViewModel = EntryRecord;
export type CharacterAuthoringViewModel = EntryRecord;
export type LocationAuthoringViewModel = EntryRecord;

export function isRecord(value: unknown): value is EntryRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function displayText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

export function editableText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function toNumberInput(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

export function parseNumberInput(value: string): number | "" {
  if (value.trim() === "") return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : "";
}

export function getFieldConfig(schema: SchemaDefinition, fieldKey: string): SchemaFieldConfig | undefined {
  return schema.properties?.[fieldKey];
}

export function fieldLabel(schema: SchemaDefinition, fieldKey: string, fallback?: string): string {
  const config = getFieldConfig(schema, fieldKey);
  const uiLabel = config?.ui?.label;
  return typeof uiLabel === "string" && uiLabel.trim() ? uiLabel : fallback || titleize(fieldKey);
}

export function updateField(data: EntryRecord, key: string, value: unknown): EntryRecord {
  const next = { ...data, [key]: value };
  if (key === "name" && !displayText(data.slug)) {
    next.slug = generateSlug(displayText(value));
  }
  return next;
}

export function InlineField({
  schema,
  data,
  fieldKey,
  label,
  kind,
  placeholder,
  onChange,
}: {
  schema: SchemaDefinition;
  data: EntryRecord;
  fieldKey: string;
  label?: string;
  kind?: EditableFieldSpec["kind"];
  placeholder?: string;
  onChange: (next: EntryRecord) => void;
}) {
  const config = getFieldConfig(schema, fieldKey);
  const resolvedLabel = label || fieldLabel(schema, fieldKey);
  const resolvedKind = kind || inferFieldKind(config);
  const value = data[fieldKey];
  const baseClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-900";

  if (resolvedKind === "textarea") {
    return (
      <label className="block">
        <FieldCaption label={resolvedLabel} changed={false} />
        <textarea
          className={`${baseClass} min-h-24 resize-y`}
          value={editableText(value)}
          placeholder={placeholder}
          onChange={(event) => onChange(updateField(data, fieldKey, event.target.value))}
        />
      </label>
    );
  }

  if (resolvedKind === "select") {
    const options = getOptions(config);
    return (
      <label className="block">
        <FieldCaption label={resolvedLabel} changed={false} />
        <select
          className={baseClass}
          value={displayText(value)}
          onChange={(event) => onChange(updateField(data, fieldKey, event.target.value))}
        >
          <option value="">Unset</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    );
  }

  if (resolvedKind === "number") {
    return (
      <label className="block">
        <FieldCaption label={resolvedLabel} changed={false} />
        <input
          className={baseClass}
          type="number"
          value={toNumberInput(value)}
          placeholder={placeholder}
          onChange={(event) => onChange(updateField(data, fieldKey, parseNumberInput(event.target.value)))}
        />
      </label>
    );
  }

  if (resolvedKind === "boolean") {
    return (
      <label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
        <span className="font-medium text-slate-800 dark:text-slate-200">{resolvedLabel}</span>
        <input
          type="checkbox"
          className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          checked={Boolean(value)}
          onChange={(event) => onChange(updateField(data, fieldKey, event.target.checked))}
        />
      </label>
    );
  }

  return (
    <label className="block">
      <FieldCaption label={resolvedLabel} changed={false} />
      <input
        className={baseClass}
        value={editableText(value)}
        placeholder={placeholder}
        onChange={(event) => onChange(updateField(data, fieldKey, event.target.value))}
      />
    </label>
  );
}

export function InlineFieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

export function SelectBadgeGroup({
  label,
  value,
  options,
  onChange,
  allowUnset = false,
  unsetLabel = "Unset",
}: {
  label: string;
  value: unknown;
  options: string[];
  onChange: (value: string) => void;
  allowUnset?: boolean;
  unsetLabel?: string;
}) {
  const current = displayText(value);
  return (
    <div>
      <FieldCaption label={label} changed={false} />
      <div className="flex flex-wrap gap-1">
        {allowUnset && (
          <button
            type="button"
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${current === "" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}
            onClick={() => onChange("")}
          >
            {unsetLabel}
          </button>
        )}
        {options.map((option) => {
          const active = current === option;
          return (
            <button
              key={option}
              type="button"
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}
              onClick={() => onChange(option)}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EditableTagList({
  tags,
  onChange,
  label = "Tags",
}: {
  tags: unknown;
  onChange: (tags: string[]) => void;
  label?: string;
}) {
  const values = Array.isArray(tags) ? tags.map((tag) => displayText(tag)).filter(Boolean) : [];
  const [draft, setDraft] = useState("");
  const addTag = () => {
    const next = draft.trim();
    if (!next || values.includes(next)) return;
    onChange([...values, next]);
    setDraft("");
  };
  return (
    <div>
      <FieldCaption label={label} changed={false} />
      <div className="flex flex-wrap gap-1">
        {values.map((tag) => (
          <button
            key={tag}
            type="button"
            className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-1 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900"
            onClick={() => onChange(values.filter((item) => item !== tag))}
            title="Remove tag"
          >
            {tag}
            <XMarkIcon className="h-3 w-3" />
          </button>
        ))}
        {values.length === 0 && <span className="text-xs text-slate-500 dark:text-slate-400">No tags yet.</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          value={draft}
          placeholder="Add tag"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTag();
            }
          }}
        />
        <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" onClick={addTag}>
          Add
        </button>
      </div>
    </div>
  );
}

export function CommaSeparatedInput({
  values,
  onChange,
  className,
  placeholder,
}: {
  values: unknown;
  onChange: (values: string[]) => void;
  className: string;
  placeholder?: string;
}) {
  const rendered = Array.isArray(values) ? values.map(String).join(", ") : "";
  const [draft, setDraft] = useState(rendered);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(rendered);
  }, [rendered]);

  const commit = () => {
    focused.current = false;
    onChange(draft.split(",").map((value) => value.trim()).filter(Boolean));
  };

  return (
    <input
      className={className}
      value={draft}
      placeholder={placeholder}
      onFocus={() => { focused.current = true; }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
    />
  );
}

export function ReferenceChipPicker({
  label,
  value,
  reference,
  onChange,
  allowEmpty = true,
}: {
  label: string;
  value: unknown;
  reference: string;
  onChange: (id: string) => void;
  allowEmpty?: boolean;
}) {
  const [options, setOptions] = useState<EntryRecord[]>([]);
  const current = displayText(value);
  const loadOptions = useMemo(() => () => {
    apiFetch(`/api/${reference}`)
      .then((res) => res.json())
      .then((payload) => {
        if (Array.isArray(payload)) setOptions(payload.filter(isRecord));
      })
      .catch(() => setOptions([]));
  }, [reference]);

  useEffect(() => {
    loadOptions();
    const refresh = (event: Event) => {
      if ((event as CustomEvent<{ reference?: string }>).detail?.reference === reference) loadOptions();
    };
    window.addEventListener("soa:reference-created", refresh as EventListener);
    return () => {
      window.removeEventListener("soa:reference-created", refresh as EventListener);
    };
  }, [loadOptions, reference]);

  return (
    <label className="block">
      <FieldCaption label={label} changed={false} />
      <select
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        value={current}
        onChange={(event) => onChange(event.target.value)}
      >
        {allowEmpty && <option value="">Unassigned</option>}
        {options.map((option) => {
          const id = displayText(option.id);
          const name = displayText(option.name, displayText(option.title, displayText(option.slug, id)));
          return <option key={id} value={id}>{name}</option>;
        })}
      </select>
      <ReferenceManageLink reference={reference} onCreated={(id) => onChange(id)} />
    </label>
  );
}

export function ReferenceManageLink({ reference, label, onCreated }: { reference: string; label?: string; onCreated?: (id: string, data: EntryRecord) => void }) {
  const dataset = findDatasetBySchema(reference);
  const editorStack = useEditorStack();
  if (!dataset || !editorStack?.openEditor) return null;
  const create = async () => {
    const result = await editorStack.openEditor({
      schemaName: dataset.schemaName,
      apiPath: dataset.apiPath,
      parentSummary: { title: `Referenced by current authoring workspace`, data: {} },
    });
    if (!result?.id) return;
    const data = result.data as EntryRecord;
    window.dispatchEvent(new CustomEvent("soa:reference-created", { detail: { reference, id: result.id, data } }));
    onCreated?.(result.id, data);
  };
  return <button type="button" className="mt-1 inline-block text-left text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300" onClick={() => void create()}>{label || `Create new ${dataset.label.toLowerCase()} entry`}</button>;
}

export function EditableRequirementBlock({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (id: string) => void;
}) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
      <ReferenceChipPicker label="Requirement Gate" value={value} reference="requirements" onChange={onChange} />
      <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
        Use this when the item, shop, or row should be locked behind flags, reputation, or progression.
      </p>
    </div>
  );
}

export function FieldCaption({ label }: { label: string; changed: boolean }) {
  return <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</div>;
}

export function getOptions(config?: SchemaFieldConfig): string[] {
  if (Array.isArray(config?.ui?.options)) return config.ui.options.map((option) => displayText(option)).filter(Boolean);
  if (Array.isArray(config?.enum)) return config.enum.map((option) => displayText(option)).filter(Boolean);
  return [];
}

export function inferFieldKind(config?: SchemaFieldConfig): EditableFieldSpec["kind"] {
  if (config?.ui?.widget === "textarea") return "textarea";
  if (config?.ui?.widget === "select" || Array.isArray(config?.enum)) return "select";
  if (config?.ui?.widget === "reference" || config?.ui?.reference) return "reference";
  if (config?.type === "number" || config?.type === "integer") return "number";
  if (config?.type === "boolean" || config?.ui?.widget === "checkbox") return "boolean";
  return "text";
}

function titleize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function rowLabel(row: EntryRecord, fallback: string): string {
  return displayText(row.name, displayText(row.title, displayText(row.slug, displayText(row.id, fallback))));
}

export function useReferenceOptions(reference: string): EntryRecord[] {
  const [options, setOptions] = useState<EntryRecord[]>([]);
  useEffect(() => {
    if (!reference) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      apiFetch(`/api/${reference}`)
        .then((res) => res.json())
        .then((payload) => {
          if (!cancelled && Array.isArray(payload)) setOptions(payload.filter(isRecord));
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        });
    };
    load();
    const refresh = (event: Event) => {
      if ((event as CustomEvent<{ reference?: string }>).detail?.reference === reference) load();
    };
    window.addEventListener("soa:reference-created", refresh as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener("soa:reference-created", refresh as EventListener);
    };
  }, [reference]);
  return options;
}

export function useReferenceMap(reference: string): Map<string, EntryRecord> {
  const options = useReferenceOptions(reference);
  return useMemo(() => new Map(options.map((option) => [displayText(option.id), option])), [options]);
}
