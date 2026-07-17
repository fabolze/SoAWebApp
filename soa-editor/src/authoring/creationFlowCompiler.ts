import type { CreationFlowDraft, CreationFlowRefKind } from "./creationFlow";
import type { BundleReviewResult } from "../components/authoring/bundleReviewModel";

export interface CreationFlowCatalogEntry {
  id: string;
  label: string;
  [key: string]: unknown;
}

export interface CreationFlowCatalogGroup {
  schema_name: string;
  entries: CreationFlowCatalogEntry[];
}

export interface CreationFlowCatalog {
  format: string;
  compiler_version: string;
  references: Partial<Record<CreationFlowRefKind, CreationFlowCatalogGroup>>;
  capabilities: {
    compilable_step_kinds: string[];
    story_only_step_kinds: string[];
    blocked_step_kinds: string[];
    guarantees: string[];
  };
}

export interface CreationFlowCompilerIssue {
  id: string;
  severity: "blocker" | "warning" | "info";
  code: string;
  message: string;
  step_id?: string;
  path?: string;
  placeholder_id?: string;
}

export interface CreationFlowPreview extends BundleReviewResult {
  format: string;
  compiler_version: string;
  normalized_draft: CreationFlowDraft;
  story_summary: Record<string, unknown>;
  implementation_summary: string;
  implementation: Record<string, unknown[]>;
  step_review: Array<{
    step_id: string;
    kind: string;
    status: "compilable" | "story_only" | "blocked";
    artifacts: Array<{ kind: string; id?: string }>;
  }>;
  information: CreationFlowCompilerIssue[];
  rehearsal: {
    runtime_claim: "web_contract_only";
    paths: Array<{
      entry_event_id: string;
      terminal_event_id?: string;
      trace: Array<{
        event_id: string;
        step_id?: string;
        title?: string;
        event_type?: string;
        target_id?: string;
        flags_added: string[];
        state_after: { flags: string[] };
      }>;
    }>;
    disconnected_event_count: number;
    note: string;
  };
  warnings: CreationFlowCompilerIssue[];
  blockers: CreationFlowCompilerIssue[];
  preview_hash: string;
  can_commit: boolean;
  committed?: boolean;
  manifest?: Record<string, unknown>;
}

export function isCreationFlowCatalog(value: unknown): value is CreationFlowCatalog {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Boolean(row.references && typeof row.references === "object" && row.capabilities && typeof row.capabilities === "object");
}

export function isCreationFlowPreview(value: unknown): value is CreationFlowPreview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.preview_hash === "string" && Boolean(row.normalized_draft) && Boolean(row.review);
}

export function creationFlowErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fallback;
  const message = (payload as Record<string, unknown>).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}
