import { BUTTON_CLASSES, BUTTON_SIZES } from "../../styles/uiTokens";
import type { EntryRelationshipSummary, InboundReference, OutboundReference, RelationshipEntry } from "../../relationships";
import type { ReactNode } from "react";

interface RelationshipPanelProps {
  summary: EntryRelationshipSummary | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenEntry: (schemaName: string, routePath: string, entryId: string) => void;
}

export default function RelationshipPanel({
  summary,
  loading,
  error,
  onRefresh,
  onOpenEntry,
}: RelationshipPanelProps) {
  return (
    <div className="mb-4 border-y border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Relationships</div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Inbound links, outbound links, broken targets, and related content.
          </div>
        </div>
        <button type="button" className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`} onClick={onRefresh} disabled={loading}>
          {loading ? "Scanning..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {!summary && !loading && !error && (
        <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">No relationship scan available.</div>
      )}

      {summary && (
        <div className="mt-3 grid gap-3 xl:grid-cols-3">
          <RelationshipSection
            title={`Inbound (${summary.inbound.reduce((sum, group) => sum + group.count, 0)})`}
            empty="No inbound references detected."
          >
            {summary.inbound.map((group) => (
              <div key={group.schemaName} className="border-t border-slate-200 py-2 first:border-t-0 dark:border-slate-800">
                <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{group.schemaLabel} ({group.count})</div>
                <div className="space-y-1">
                  {group.items.slice(0, 6).map((item: InboundReference) => (
                    <div key={`${item.sourceSchemaName}-${item.sourceId}`} className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="truncate text-slate-800 dark:text-slate-200">{item.sourceEntryLabel}</div>
                        <div className="truncate text-slate-500 dark:text-slate-400" title={item.paths.join(", ")}>{item.paths.slice(0, 2).join(", ")}</div>
                      </div>
                      <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => onOpenEntry(item.sourceSchemaName, item.routePath, item.sourceId)}>
                        Open
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </RelationshipSection>

          <RelationshipSection
            title={`Outbound (${summary.outbound.reduce((sum, group) => sum + group.count, 0)})`}
            empty="No outbound references detected."
          >
            {summary.outbound.map((group) => (
              <div key={group.schemaName} className="border-t border-slate-200 py-2 first:border-t-0 dark:border-slate-800">
                <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{group.schemaLabel} ({group.count})</div>
                <div className="space-y-1">
                  {group.items.slice(0, 8).map((item: OutboundReference) => (
                    <div key={`${item.sourcePath}-${item.targetId}`} className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className={`truncate ${item.broken ? "text-red-700 dark:text-red-300" : "text-slate-800 dark:text-slate-200"}`}>
                          {item.targetEntry?.label || item.targetId}
                        </div>
                        <div className="truncate text-slate-500 dark:text-slate-400">{item.sourcePath}{item.broken ? " · broken" : ""}</div>
                      </div>
                      {item.targetEntry && (
                        <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => onOpenEntry(item.targetSchemaName, item.targetEntry?.dataset.routePath || "", item.targetId)}>
                          Open
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </RelationshipSection>

          <RelationshipSection title={`Related (${summary.related.reduce((sum, group) => sum + group.count, 0)})`} empty="No related quick links yet.">
            {summary.related.map((group) => (
              <div key={group.schemaName} className="border-t border-slate-200 py-2 first:border-t-0 dark:border-slate-800">
                <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{group.schemaLabel} ({group.count})</div>
                <div className="flex flex-wrap gap-1">
                  {group.items.slice(0, 10).map((item: RelationshipEntry) => (
                    <button
                      key={item.id}
                      type="button"
                      className="max-w-full truncate rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                      onClick={() => onOpenEntry(item.dataset.schemaName, item.dataset.routePath, item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </RelationshipSection>
        </div>
      )}
    </div>
  );
}

function RelationshipSection({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasContent = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{title}</div>
      <div className="mt-2">
        {hasContent ? children : <div className="text-xs text-slate-500 dark:text-slate-400">{empty}</div>}
      </div>
    </div>
  );
}
