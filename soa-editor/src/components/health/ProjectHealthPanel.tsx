import { useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/outline";
import { buildProjectHealthSummary, type HealthIssue, type HealthSummary } from "../../health/projectHealth";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../../styles/uiTokens";

interface ProjectHealthPanelProps {
  onNavigateRequest: () => boolean;
}

type Filter = "all" | "error" | "warning";

function issueTone(issue: HealthIssue): string {
  if (issue.severity === "error") return "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200";
  if (issue.severity === "warning") return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200";
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300";
}

function openIssue(issue: HealthIssue) {
  const targetWorkspaceKey = `soa.workspace.${issue.schemaName}`;
  let nextWorkspace: Record<string, unknown> = {};
  const existingRaw = localStorage.getItem(targetWorkspaceKey);
  if (existingRaw) {
    try {
      const parsed = JSON.parse(existingRaw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        nextWorkspace = parsed as Record<string, unknown>;
      }
    } catch {
      nextWorkspace = {};
    }
  }
  nextWorkspace.selectedEntryId = issue.entryId;
  nextWorkspace.showEditor = true;
  localStorage.setItem(targetWorkspaceKey, JSON.stringify(nextWorkspace));
  window.location.assign(`/${issue.routePath}`);
}

export default function ProjectHealthPanel({ onNavigateRequest }: ProjectHealthPanelProps) {
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const runScan = async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await buildProjectHealthSummary());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project health scan failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runScan();
  }, []);

  const filteredIssues = useMemo(() => {
    const issues = summary?.issues || [];
    if (filter === "all") return issues;
    return issues.filter((issue) => issue.severity === filter);
  }, [filter, summary]);

  const hasIssues = !!summary && summary.issues.length > 0;

  return (
    <section className="border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3 dark:border-slate-800 dark:bg-slate-800">
        <div>
          <div className="flex items-center gap-2">
            {hasIssues ? (
              <ShieldExclamationIcon className="h-5 w-5 text-amber-600 dark:text-amber-300" />
            ) : (
              <CheckCircleIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
            )}
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Project Health</h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            Checks broken references, duplicate identifiers, required fields, important empty lists, and reward values.
          </p>
        </div>
        <button
          type="button"
          className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm} gap-2`}
          onClick={() => void runScan()}
          disabled={loading}
        >
          <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Scanning" : "Rescan"}
        </button>
      </div>

      <div className="px-4 py-3">
        {error && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {!summary && !error && (
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {loading ? "Scanning project data..." : "No scan has run yet."}
          </div>
        )}

        {summary && (
          <>
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="text-xs uppercase text-slate-500 dark:text-slate-400">Entries</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{summary.entryCount}</div>
              </div>
              <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
                <div className="text-xs uppercase text-red-600 dark:text-red-300">Errors</div>
                <div className="mt-1 text-lg font-semibold text-red-800 dark:text-red-100">{summary.errorCount}</div>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
                <div className="text-xs uppercase text-amber-700 dark:text-amber-300">Warnings</div>
                <div className="mt-1 text-lg font-semibold text-amber-900 dark:text-amber-100">{summary.warningCount}</div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="text-xs uppercase text-slate-500 dark:text-slate-400">Datasets</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{summary.datasetCount}</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1">
                {(["all", "error", "warning"] as Filter[]).map((nextFilter) => (
                  <button
                    key={nextFilter}
                    type="button"
                    className={`rounded-md px-2 py-1 text-xs font-medium ${
                      filter === nextFilter
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                    onClick={() => setFilter(nextFilter)}
                  >
                    {nextFilter === "all" ? "All" : nextFilter === "error" ? "Errors" : "Warnings"}
                  </button>
                ))}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Updated {new Date(summary.generatedAt).toLocaleTimeString()}
              </div>
            </div>

            {filteredIssues.length === 0 ? (
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                No {filter === "all" ? "" : filter} issues found.
              </div>
            ) : (
              <div className="mt-3 max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-800">
                {filteredIssues.slice(0, 80).map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                    onClick={() => {
                      if (!onNavigateRequest()) return;
                      openIssue(issue);
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase ${issueTone(issue)}`}>
                        {issue.severity}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{issue.title}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{issue.schemaLabel} / {issue.entryLabel}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{issue.detail}</div>
                    <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-500">{issue.path}</div>
                  </button>
                ))}
                {filteredIssues.length > 80 && (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                    <ExclamationTriangleIcon className="h-4 w-4" />
                    Showing first 80 of {filteredIssues.length} issues. Use dataset pages to narrow fixes.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
