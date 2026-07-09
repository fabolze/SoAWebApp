import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export const AUTHORING_INPUT_CLASS =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export const AUTHORING_PANEL_CLASS =
  "rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

export const AUTHORING_CAPTION_CLASS =
  "mb-1 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400";

export function AuthoringPageShell({
  children,
  className = "",
  contentClassName = "w-full space-y-4",
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={`min-h-full bg-slate-100 p-4 dark:bg-slate-950 ${className}`.trim()}>
      <div className={contentClassName}>{children}</div>
    </div>
  );
}

export type NumberEmptyValue = "empty-string" | "null" | "zero";

type NumberCommitValue = number | "" | null;

export function textInputValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function numberInputValue(value: unknown): string {
  return value === null || value === undefined || value === "" ? "" : String(value);
}

export function coerceNumberDraft(raw: string, emptyValue: NumberEmptyValue): { shouldCommit: boolean; value: NumberCommitValue } {
  const normalized = raw.replace(",", ".");
  if (normalized === "") {
    if (emptyValue === "zero") return { shouldCommit: true, value: 0 };
    if (emptyValue === "null") return { shouldCommit: true, value: null };
    return { shouldCommit: true, value: "" };
  }
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return { shouldCommit: false, value: null };
  return { shouldCommit: true, value: numeric };
}

export function AuthoringPanel({
  title,
  subtitle,
  actions,
  help,
  status,
  collapsedSummary,
  collapsible = false,
  defaultCollapsed = false,
  storageKey,
  id,
  className = "",
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  help?: ReactNode;
  status?: ReactNode;
  collapsedSummary?: ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  storageKey?: string;
  id?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => readPanelCollapsedState(storageKey, defaultCollapsed));
  const helpText = useMemo(() => reactNodeToText(help), [help]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, collapsed ? "1" : "0");
    } catch {
      // Ignore storage failures; collapse still works for the current session.
    }
  }, [collapsed, storageKey]);

  return (
    <section id={id} className={`${AUTHORING_PANEL_CLASS} scroll-mt-4 ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-950 dark:text-slate-100">{title}</h2>
            {help && (
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:text-blue-200"
                aria-label={`Help for ${helpLabel(title)}`}
                title={helpText}
              >
                ?
              </button>
            )}
            {status && <div className="flex flex-wrap items-center gap-1">{status}</div>}
          </div>
          {subtitle && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>}
          {collapsed && collapsedSummary && <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{collapsedSummary}</div>}
          {help && <div className="sr-only">{help}</div>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
          {collapsible && (
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? "Expand" : "Collapse"}
            </button>
          )}
        </div>
      </div>
      {!collapsed && <div className="mt-3">{children}</div>}
    </section>
  );
}

function readPanelCollapsedState(storageKey: string | undefined, fallback: boolean): boolean {
  if (!storageKey) return fallback;
  try {
    const value = window.localStorage.getItem(storageKey);
    if (value === "1") return true;
    if (value === "0") return false;
  } catch {
    return fallback;
  }
  return fallback;
}

function helpLabel(value: ReactNode): string {
  return reactNodeToText(value) || "this panel";
}

function reactNodeToText(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(reactNodeToText).filter(Boolean).join(" ");
  return "";
}

export function AuthoringStatusChip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "error" | "info";
  children?: ReactNode;
}) {
  const classes = {
    neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
    warning: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
    error: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200",
    info: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${classes}`}>{children}</span>;
}

export function FieldCaption({ label, children, description }: { label?: ReactNode; children?: ReactNode; description?: ReactNode }) {
  const content = label ?? children;
  return (
    <div className="mb-1">
      <div className={AUTHORING_CAPTION_CLASS}>{content}</div>
      {description && <div className="-mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</div>}
    </div>
  );
}

type CommonFieldProps = {
  label: ReactNode;
  description?: ReactNode;
  className?: string;
  inputClassName?: string;
};

export function TextField({
  label,
  description,
  value,
  onChange,
  className = "",
  inputClassName = "",
  "aria-label": ariaLabel,
  ...inputProps
}: CommonFieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: unknown;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`block ${className}`.trim()}>
      <FieldCaption label={label} description={description} />
      <input
        {...inputProps}
        aria-label={ariaLabel || (typeof label === "string" ? label : undefined)}
        className={`${AUTHORING_INPUT_CLASS} ${inputClassName}`.trim()}
        value={textInputValue(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function TextAreaField({
  label,
  description,
  value,
  onChange,
  className = "",
  inputClassName = "",
  "aria-label": ariaLabel,
  ...textareaProps
}: CommonFieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: unknown;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`block ${className}`.trim()}>
      <FieldCaption label={label} description={description} />
      <textarea
        {...textareaProps}
        aria-label={ariaLabel || (typeof label === "string" ? label : undefined)}
        className={`${AUTHORING_INPUT_CLASS} min-h-20 ${inputClassName}`.trim()}
        value={textInputValue(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function NumberField({
  label,
  description,
  value,
  onChange,
  emptyValue,
  className = "",
  inputClassName = "",
  "aria-label": ariaLabel,
  ...inputProps
}: CommonFieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: unknown;
  onChange: (value: NumberCommitValue) => void;
  emptyValue: NumberEmptyValue;
}) {
  const [draft, setDraft] = useState(numberInputValue(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(numberInputValue(value));
  }, [value]);

  const commit = (raw: string) => {
    const result = coerceNumberDraft(raw, emptyValue);
    if (result.shouldCommit) onChange(result.value);
  };

  return (
    <label className={`block ${className}`.trim()}>
      <FieldCaption label={label} description={description} />
      <input
        {...inputProps}
        aria-label={ariaLabel || (typeof label === "string" ? label : undefined)}
        className={`${AUTHORING_INPUT_CLASS} ${inputClassName}`.trim()}
        type="number"
        value={draft}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          commit(event.target.value);
        }}
        onBlur={(event) => {
          focused.current = false;
          const result = coerceNumberDraft(event.target.value, emptyValue);
          setDraft(result.shouldCommit ? numberInputValue(result.value) : numberInputValue(value));
        }}
      />
    </label>
  );
}

export function SelectField({
  label,
  description,
  value,
  onChange,
  options,
  emptyOption,
  allowEmpty = false,
  emptyLabel = "Unset",
  className = "",
  inputClassName = "",
  "aria-label": ariaLabel,
  ...selectProps
}: CommonFieldProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  value: unknown;
  onChange: (value: string) => void;
  options: Array<string | { label: string; value: string; disabled?: boolean }>;
  emptyOption?: { label: string; value?: string };
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <label className={`block ${className}`.trim()}>
      <FieldCaption label={label} description={description} />
      <select
        {...selectProps}
        aria-label={ariaLabel || (typeof label === "string" ? label : undefined)}
        className={`${AUTHORING_INPUT_CLASS} ${inputClassName}`.trim()}
        value={textInputValue(value)}
        onChange={(event) => onChange(event.target.value)}
      >
        {(emptyOption || allowEmpty) && <option value={emptyOption?.value ?? ""}>{emptyOption?.label ?? emptyLabel}</option>}
        {options.map((option) => {
          const resolved = typeof option === "string" ? { label: option, value: option } : option;
          return (
            <option key={resolved.value} value={resolved.value} disabled={resolved.disabled}>
              {resolved.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function CheckboxField({
  label,
  description,
  value,
  onChange,
  className = "",
  ...inputProps
}: CommonFieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "checked" | "onChange" | "type"> & {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`flex items-center justify-between gap-3 rounded border border-slate-200 px-3 py-2 text-xs dark:border-slate-800 ${className}`.trim()}>
      <span>
        <span className="font-medium text-slate-800 dark:text-slate-200">{label}</span>
        {description && <span className="mt-0.5 block text-slate-500 dark:text-slate-400">{description}</span>}
      </span>
      <input
        {...inputProps}
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function EmptyState({
  children,
  title,
  action,
  variant = "boxed",
  className = "",
}: {
  children?: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  variant?: "boxed" | "plain" | "compact";
  className?: string;
}) {
  const classes =
    variant === "plain"
      ? "text-sm text-slate-500 dark:text-slate-400"
      : variant === "compact"
        ? "rounded border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
        : "rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400";
  if (!title && !action) return <div className={`${classes} ${className}`.trim()}>{children}</div>;
  return (
    <div className={`${classes} ${className}`.trim()}>
      {title && <div className="font-semibold text-slate-700 dark:text-slate-200">{title}</div>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function StatusNotice({
  tone = "info",
  children,
  className = "",
}: {
  tone?: "info" | "success" | "warning" | "error";
  children: ReactNode;
  className?: string;
}) {
  const toneClass = {
    info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
    error: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  }[tone];
  return <div className={`rounded-md border px-3 py-2 text-sm ${toneClass} ${className}`.trim()}>{children}</div>;
}

export function ModeTabs<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode; disabled?: boolean }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-1 ${className}`.trim()}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
