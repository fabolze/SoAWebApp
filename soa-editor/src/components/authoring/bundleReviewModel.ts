export type BundleReviewChangeKind = "created" | "changed" | "deleted" | "unlinked";

export interface BundleReviewChange {
  table: string;
  id: string;
  details?: Record<string, unknown>;
}

export interface BundleReviewWarning {
  id?: string;
  code?: string;
  entry_id?: string;
  message: string;
}

export interface BundleReviewResult {
  review: Partial<Record<BundleReviewChangeKind, BundleReviewChange[]>>;
  warnings?: BundleReviewWarning[];
  health_warnings?: string[];
  blockers?: Array<string | BundleReviewWarning>;
}

export interface NormalizedBundleReview {
  changes: Record<BundleReviewChangeKind, BundleReviewChange[]>;
  warnings: Array<{ id: string; message: string }>;
  healthWarnings: string[];
  blockers: string[];
}

export const BUNDLE_REVIEW_CHANGE_KINDS: BundleReviewChangeKind[] = ["created", "changed", "deleted", "unlinked"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeChange(value: unknown): BundleReviewChange | null {
  if (!isRecord(value)) return null;
  const table = text(value.table);
  const id = text(value.id);
  if (!table || !id) return null;
  return { table, id, ...(isRecord(value.details) ? { details: value.details } : {}) };
}

function issueMessage(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return isRecord(value) ? text(value.message) || text(value.id) : "";
}

export function normalizeBundleReview(value: unknown): NormalizedBundleReview {
  const source = isRecord(value) ? value : {};
  const review = isRecord(source.review) ? source.review : {};
  const changes = Object.fromEntries(BUNDLE_REVIEW_CHANGE_KINDS.map((kind) => [
    kind,
    Array.isArray(review[kind]) ? review[kind].map(normalizeChange).filter((entry): entry is BundleReviewChange => Boolean(entry)) : [],
  ])) as Record<BundleReviewChangeKind, BundleReviewChange[]>;
  const warnings = Array.isArray(source.warnings)
    ? source.warnings.map((warning, index) => {
      const item = isRecord(warning) ? warning : {};
      const message = issueMessage(warning);
      const fallback = [text(item.code), text(item.entry_id), String(index)].filter(Boolean).join(":");
      return message ? { id: text(item.id) || fallback || `warning:${index}`, message } : null;
    }).filter((warning): warning is { id: string; message: string } => Boolean(warning))
    : [];
  const healthWarnings = Array.isArray(source.health_warnings)
    ? source.health_warnings.map(issueMessage).filter(Boolean)
    : [];
  const blockers = Array.isArray(source.blockers)
    ? source.blockers.map(issueMessage).filter(Boolean)
    : [];
  return { changes, warnings, healthWarnings, blockers };
}
