import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowRightIcon, SparklesIcon } from "@heroicons/react/24/outline";
import RecoverySyncBanner from './RecoverySyncBanner';
import Sidebar from './Sidebar';
import CommandPalette, { type CommandPaletteItem } from "./command/CommandPalette";
import ThenComposer from "./authoring/ThenComposer";
import { useDirtyState } from "./useDirtyState";
import type { CreationFlowDraft, CreationFlowRefKind, CreationFlowReturnFrame } from "../authoring/creationFlow";
import {
  readDraftInventory,
  removeDraftInventoryItem,
  restoreDraftInventoryItem,
  type DraftInventoryItem,
  type DraftRemovalBackup,
} from "../navigation/draftInventory";
import { navigateToWorkspace, workspaceActions } from "../navigation/workspaceActions";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";

function quickCaptureContext(pathname: string, search: string): {
  origin: NonNullable<CreationFlowDraft["origin"]>;
  originLabel: string;
  returnFrame: CreationFlowReturnFrame;
} {
  const segments = pathname.split("/").filter(Boolean);
  const section = segments[1] || segments[0] || "workspace";
  const entityId = segments[2] && segments[2] !== "new" ? decodeURIComponent(segments[2]) : "";
  const selectedId = new URLSearchParams(search).get("selected") || entityId;
  const kindBySection: Partial<Record<string, CreationFlowRefKind>> = {
    characters: "character",
    dialogues: "dialogue",
    encounters: "encounter",
    quests: "quest",
    locations: "location",
    creatures: "creature",
    items: "item",
    world: "location",
  };
  const workspaceBySection: Record<string, string> = {
    dialogues: "dialogue-flow",
    encounters: "encounter-stage",
    quests: "quest-journey",
    world: "world-builder",
  };
  const labelBySection: Record<string, string> = {
    characters: "Character Studio",
    dialogues: "Dialogue Scene Room",
    encounters: "Encounter Stage",
    quests: "Quest Journey",
    locations: "Location Studio",
    creatures: "Creature Workshop",
    items: "Item Workshop",
    world: "World Builder",
    "story-timeline": "Story Timeline",
    "creation-flow": "Idea Studio",
  };
  const kind = kindBySection[section] ?? "custom";
  const label = labelBySection[section] ?? section.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const ref = {
    kind,
    ...(selectedId ? { canonicalId: selectedId } : { draftId: `${pathname}${search}` }),
    label,
  };
  return {
    origin: { ref },
    originLabel: `Quick idea from ${label}`,
    returnFrame: {
      workspace: workspaceBySection[section] ?? section,
      context: ref,
      ...(selectedId ? { selectedId } : {}),
      localViewState: { pathname, search },
    },
  };
}

export default function Layout({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDirty, confirmNavigate } = useDirtyState();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [draftDrawerOpen, setDraftDrawerOpen] = useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftInventoryItem[]>([]);
  const [deletedDraft, setDeletedDraft] = useState<DraftRemovalBackup | null>(null);
  const quickCapture = useMemo(() => quickCaptureContext(location.pathname, location.search), [location.pathname, location.search]);

  const refreshDrafts = () => setDrafts(readDraftInventory());

  useEffect(() => {
    refreshDrafts();
  }, [location.pathname, location.search]);

  useEffect(() => {
    const refresh = () => setDrafts(readDraftInventory());
    window.addEventListener("soa:creation-flow-drafts-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("soa:creation-flow-drafts-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

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
    setDeletedDraft(removeDraftInventoryItem(draft));
    refreshDrafts();
  };

  const undoDiscard = () => {
    if (!deletedDraft) return;
    restoreDraftInventoryItem(deletedDraft);
    setDeletedDraft(null);
    refreshDrafts();
  };

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      <main className="relative flex-1 overflow-y-auto">
        <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-violet-100 bg-white/95 px-4 py-2 text-xs shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className={`${BUTTON_CLASSES.violet} ${BUTTON_SIZES.xs}`}
              onClick={() => setQuickCaptureOpen(true)}
            >
              <SparklesIcon className="h-4 w-4" aria-hidden="true" />
              Quick capture
            </button>
            {drafts[0] && (
              <button
                type="button"
                className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs} hidden sm:inline-flex`}
                onClick={() => openDraft(drafts[0])}
                title={drafts[0].title}
              >
                Continue
                <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => setPaletteOpen(true)}>
              Find
              <kbd className="ml-1 text-[10px] opacity-60">Ctrl K</kbd>
            </button>
            {isDirty && <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">Unsaved work</span>}
          </div>
          <button type="button" className={`${drafts.length ? BUTTON_CLASSES.secondary : BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => { refreshDrafts(); setDraftDrawerOpen(true); }}>
            Drafts {drafts.length}
          </button>
        </div>
        <RecoverySyncBanner />
        <Outlet />
        <ThenComposer
          open={quickCaptureOpen}
          mode="then"
          origin={quickCapture.origin}
          originLabel={quickCapture.originLabel}
          returnFrame={quickCapture.returnFrame}
          onClose={() => { setQuickCaptureOpen(false); refreshDrafts(); }}
        />
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
        {deletedDraft && <div role="status" className="fixed bottom-5 left-1/2 z-[130] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-slate-950 px-4 py-3 text-sm text-white shadow-2xl dark:bg-white dark:text-slate-950"><span>Removed “{deletedDraft.item.title}” from local drafts.</span><button type="button" className="font-semibold text-violet-300 underline underline-offset-2 dark:text-violet-700" onClick={undoDiscard}>Undo</button><button type="button" aria-label="Dismiss draft removal message" className="opacity-70 hover:opacity-100" onClick={() => setDeletedDraft(null)}>×</button></div>}
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
                <button type="button" className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.xs}`} onClick={() => onDiscard(draft)}>Delete draft</button>
              </div>
            </article>
          ))}
          {drafts.length === 0 && <p className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">No local drafts found.</p>}
        </div>
      </aside>
    </div>
  );
}
