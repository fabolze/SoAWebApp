import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import RecoverySyncBanner from './RecoverySyncBanner';
import Sidebar from './Sidebar';
import CommandPalette, { type CommandPaletteItem } from "./command/CommandPalette";
import { useDirtyState } from "./useDirtyState";
import { readDraftInventory, removeDraftInventoryItem, type DraftInventoryItem } from "../navigation/draftInventory";
import { navigateToWorkspace, workspaceActions } from "../navigation/workspaceActions";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";

export default function Layout({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDirty, confirmNavigate } = useDirtyState();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [draftDrawerOpen, setDraftDrawerOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftInventoryItem[]>([]);

  const refreshDrafts = () => setDrafts(readDraftInventory());

  useEffect(() => {
    refreshDrafts();
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setPaletteOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const commandItems = useMemo<CommandPaletteItem[]>(() => {
    const actions = workspaceActions().map((action) => ({
      id: action.id,
      title: action.title,
      subtitle: action.subtitle,
      keywords: action.keywords,
      run: () => {
        if (!confirmNavigate()) return;
        navigateToWorkspace(navigate, action);
      },
    }));
    const draftActions = drafts.slice(0, 12).map((draft) => ({
      id: `draft:${draft.key}`,
      title: `Open draft: ${draft.title}`,
      subtitle: draft.subtitle,
      keywords: ["draft", "restore", draft.title, draft.subtitle],
      run: () => {
        if (!confirmNavigate()) return;
        navigate(draft.route);
      },
    }));
    return [...actions, ...draftActions];
  }, [confirmNavigate, drafts, navigate]);

  const openDraft = (draft: DraftInventoryItem) => {
    if (!confirmNavigate()) return;
    navigate(draft.route);
    setDraftDrawerOpen(false);
  };

  const discardDraft = (draft: DraftInventoryItem) => {
    removeDraftInventoryItem(draft);
    refreshDrafts();
  };

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      <main className="relative flex-1 overflow-y-auto">
        <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-2 text-xs backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => setPaletteOpen(true)}>
              Search Workspaces
            </button>
            {isDirty && <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">Unsaved work</span>}
          </div>
          <button type="button" className={`${drafts.length ? BUTTON_CLASSES.secondary : BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => { refreshDrafts(); setDraftDrawerOpen(true); }}>
            Drafts {drafts.length}
          </button>
        </div>
        <RecoverySyncBanner />
        <Outlet />
        <CommandPalette
          open={paletteOpen}
          title="Workspace Switcher"
          items={commandItems}
          onClose={() => setPaletteOpen(false)}
        />
        {draftDrawerOpen && (
          <DraftDrawer
            drafts={drafts}
            onClose={() => setDraftDrawerOpen(false)}
            onOpen={openDraft}
            onDiscard={discardDraft}
          />
        )}
      </main>
    </div>
  );
}

function DraftDrawer({
  drafts,
  onClose,
  onOpen,
  onDiscard,
}: {
  drafts: DraftInventoryItem[];
  onClose: () => void;
  onOpen: (draft: DraftInventoryItem) => void;
  onDiscard: (draft: DraftInventoryItem) => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-slate-950/40" onClick={onClose}>
      <aside className="h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-950" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Local Drafts</h2>
            <p className="mt-1 text-xs text-slate-500">Browser-local work that has not been committed yet.</p>
          </div>
          <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={onClose}>Close</button>
        </div>
        <div className="mt-4 space-y-2">
          {drafts.map((draft) => (
            <article key={draft.key} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="font-semibold text-slate-950 dark:text-slate-100">{draft.title}</div>
              <div className="mt-1 text-xs text-slate-500">{draft.subtitle}</div>
              <div className="mt-1 text-[11px] text-slate-400">{draft.ts ? new Date(draft.ts).toLocaleString() : "No timestamp"}</div>
              <div className="mt-3 flex gap-2">
                <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`} onClick={() => onOpen(draft)}>Open</button>
                <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => onDiscard(draft)}>Reset</button>
              </div>
            </article>
          ))}
          {drafts.length === 0 && <p className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">No local drafts found.</p>}
        </div>
      </aside>
    </div>
  );
}
