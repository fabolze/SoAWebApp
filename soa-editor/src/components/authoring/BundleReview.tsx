import { useEffect, useId, useMemo, useState } from "react";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../../styles/uiTokens";
import { AuthoringStatusChip, StatusNotice } from "../authoringUi";
import { BUNDLE_REVIEW_CHANGE_KINDS, normalizeBundleReview, type BundleReviewResult } from "./bundleReviewModel";
export type { BundleReviewResult } from "./bundleReviewModel";

interface BundleReviewProps {
  result: BundleReviewResult | null;
  title: string;
  description?: string;
  variant: "inline" | "modal";
  commitLabel: string;
  cancelLabel?: string;
  saving: boolean;
  error?: string;
  testId?: string;
  warningAcknowledgement?: "required" | "advisory";
  additionalWarnings?: string[];
  additionalBlockers?: string[];
  onCancel: () => void;
  onCommit: (acceptedWarningIds: string[]) => void;
}

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function detailsText(details: Record<string, unknown> | undefined): string {
  if (!details || Object.keys(details).length === 0) return "";
  return JSON.stringify(details, null, 2);
}

export default function BundleReview({
  result,
  title,
  description,
  variant,
  commitLabel,
  cancelLabel = "Continue Editing",
  saving,
  error = "",
  testId,
  warningAcknowledgement = "advisory",
  additionalWarnings = [],
  additionalBlockers = [],
  onCancel,
  onCommit,
}: BundleReviewProps) {
  const headingId = useId();
  const [acceptedWarningIds, setAcceptedWarningIds] = useState<string[]>([]);
  const normalized = useMemo(() => normalizeBundleReview(result), [result]);
  const blockers = [...normalized.blockers, ...additionalBlockers].filter(Boolean);
  const advisoryWarnings = [...normalized.healthWarnings, ...additionalWarnings].filter(Boolean);
  const requiredWarnings = warningAcknowledgement === "required" ? normalized.warnings : [];
  if (warningAcknowledgement === "advisory") advisoryWarnings.unshift(...normalized.warnings.map((warning) => warning.message));
  const allAccepted = requiredWarnings.every((warning) => acceptedWarningIds.includes(warning.id));

  useEffect(() => setAcceptedWarningIds([]), [result]);

  if (!result && !error) return null;

  const body = <section
    aria-labelledby={headingId}
    aria-modal={variant === "modal" ? true : undefined}
    role={variant === "modal" ? "dialog" : undefined}
    className={variant === "modal"
      ? "max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900"
      : "rounded-md border border-fuchsia-300 bg-white p-4 dark:border-fuchsia-900 dark:bg-slate-900"}
    data-testid={testId}
  >
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id={headingId} className="font-semibold">{title}</h2>
        {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      </div>
      <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} disabled={saving} onClick={onCancel}>{cancelLabel}</button>
    </div>

    {result && <div className="mt-4 flex flex-wrap gap-2 text-xs">
      {BUNDLE_REVIEW_CHANGE_KINDS.filter((kind) => kind !== "unlinked" || normalized.changes.unlinked.length > 0).map((kind) => <AuthoringStatusChip key={kind} tone="neutral"><strong>{normalized.changes[kind].length}</strong> {kind}</AuthoringStatusChip>)}
      <AuthoringStatusChip tone={advisoryWarnings.length || requiredWarnings.length ? "warning" : "neutral"}><strong>{advisoryWarnings.length + requiredWarnings.length}</strong> warnings</AuthoringStatusChip>
      <AuthoringStatusChip tone={blockers.length ? "error" : "neutral"}><strong>{blockers.length}</strong> blockers</AuthoringStatusChip>
    </div>}

    {result && BUNDLE_REVIEW_CHANGE_KINDS.map((kind) => normalized.changes[kind].length > 0 && <details key={kind} className="mt-3 rounded border border-slate-200 p-2 dark:border-slate-700">
      <summary className="cursor-pointer text-sm font-semibold">{humanize(kind)} ({normalized.changes[kind].length})</summary>
      <div className="mt-2 space-y-2">
        {normalized.changes[kind].map((change, index) => <div key={`${change.table}:${change.id}:${index}`} className="rounded bg-slate-50 p-2 text-xs dark:bg-slate-950">
          <div><strong>{humanize(change.table)}</strong> <span className="font-mono text-slate-500">{change.id}</span></div>
          {detailsText(change.details) && <pre className="mt-2 overflow-auto whitespace-pre-wrap text-[11px] text-slate-600 dark:text-slate-300">{detailsText(change.details)}</pre>}
        </div>)}
      </div>
    </details>)}

    {(advisoryWarnings.length > 0 || requiredWarnings.length > 0 || blockers.length > 0 || error) && <div className="mt-4 space-y-2">
      {advisoryWarnings.map((warning, index) => <StatusNotice key={`advisory:${index}:${warning}`} tone="warning">{warning}</StatusNotice>)}
      {requiredWarnings.map((warning) => <label key={warning.id} className="flex gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <input type="checkbox" checked={acceptedWarningIds.includes(warning.id)} onChange={(event) => setAcceptedWarningIds((current) => event.target.checked ? [...current, warning.id] : current.filter((id) => id !== warning.id))} />
        <span>{warning.message}</span>
      </label>)}
      {blockers.map((blocker, index) => <StatusNotice key={`blocker:${index}:${blocker}`} tone="error">{blocker}</StatusNotice>)}
      {error && <StatusNotice tone="error">{error}</StatusNotice>}
    </div>}

    <div className="mt-4 flex justify-end">
      <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={!result || saving || blockers.length > 0 || !allAccepted} onClick={() => onCommit(acceptedWarningIds)}>{saving ? "Committing..." : commitLabel}</button>
    </div>
  </section>;

  return variant === "modal"
    ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4">{body}</div>
    : body;
}
