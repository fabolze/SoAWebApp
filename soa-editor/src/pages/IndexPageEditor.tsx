import { useEffect, useState, type ElementType } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRightIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  CubeIcon,
  DocumentTextIcon,
  MapIcon,
  PlayIcon,
  SparklesIcon,
  FireIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import ProjectHealthPanel from "../components/health/ProjectHealthPanel";
import { useDirtyState } from "../components/useDirtyState";
import { readDraftInventory, type DraftInventoryItem } from "../navigation/draftInventory";

interface CreativeAction {
  title: string;
  description: string;
  route: string;
  icon: ElementType;
  tone: string;
  eyebrow: string;
}

const CREATIVE_ACTIONS: CreativeAction[] = [
  {
    title: "Capture an idea",
    description: "Start with a sentence. Decide what it becomes only when you are ready.",
    route: "/author/creation-flow",
    icon: SparklesIcon,
    tone: "from-violet-500/15 to-fuchsia-500/5 border-violet-200 dark:border-violet-900",
    eyebrow: "Open canvas",
  },
  {
    title: "Write a scene",
    description: "Write dialogue first, then branch, rehearse, and connect consequences.",
    route: "/author/dialogues/new",
    icon: ChatBubbleLeftRightIcon,
    tone: "from-sky-500/15 to-cyan-500/5 border-sky-200 dark:border-sky-900",
    eyebrow: "Dialogue",
  },
  {
    title: "Build a quest",
    description: "Shape objectives, choices, rewards, and the player journey together.",
    route: "/author/quests/new",
    icon: DocumentTextIcon,
    tone: "from-amber-500/15 to-orange-500/5 border-amber-200 dark:border-amber-900",
    eyebrow: "Player journey",
  },
  {
    title: "Expand the world",
    description: "Sketch a place, connect routes, and grow its people, history, and conflicts.",
    route: "/author/world",
    icon: MapIcon,
    tone: "from-emerald-500/15 to-teal-500/5 border-emerald-200 dark:border-emerald-900",
    eyebrow: "World",
  },
  {
    title: "Create a character",
    description: "Start with who they are and what they want; add mechanics when needed.",
    route: "/author/characters/new",
    icon: UsersIcon,
    tone: "from-rose-500/15 to-pink-500/5 border-rose-200 dark:border-rose-900",
    eyebrow: "Cast",
  },
  {
    title: "Stage an encounter",
    description: "Compose the dramatic purpose, participants, stakes, rewards, and aftermath.",
    route: "/author/encounters/new",
    icon: FireIcon,
    tone: "from-red-500/15 to-orange-500/5 border-red-200 dark:border-red-900",
    eyebrow: "Conflict",
  },
  {
    title: "Design an item",
    description: "Create the player-facing fantasy first, then its mechanics and journey.",
    route: "/author/items/new",
    icon: CubeIcon,
    tone: "from-indigo-500/15 to-blue-500/5 border-indigo-200 dark:border-indigo-900",
    eyebrow: "Gameplay",
  },
  {
    title: "Shape the story",
    description: "Arrange arcs and beats, track appearances, and review the wider narrative.",
    route: "/author/story-timeline",
    icon: ClockIcon,
    tone: "from-fuchsia-500/15 to-purple-500/5 border-fuchsia-200 dark:border-fuchsia-900",
    eyebrow: "Story",
  },
];

function DraftCard({
  draft,
  featured = false,
  onNavigateRequest,
}: {
  draft: DraftInventoryItem;
  featured?: boolean;
  onNavigateRequest: () => boolean;
}) {
  return (
    <Link
      to={draft.route}
      onClick={(event) => {
        if (!onNavigateRequest()) event.preventDefault();
      }}
      className={`group block rounded-2xl border transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
        featured
          ? "border-violet-300 bg-gradient-to-br from-violet-600 to-indigo-700 p-5 text-white shadow-lg shadow-violet-950/15 dark:border-violet-700"
          : "border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      }`}
    >
      <div className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${featured ? "text-violet-200" : "text-slate-500"}`}>
        {featured ? "Continue where you left off" : "Local draft"}
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{draft.title}</div>
          <div className={`mt-1 text-xs ${featured ? "text-violet-100/80" : "text-slate-500"}`}>{draft.subtitle}</div>
          {draft.ts > 0 && <div className={`mt-2 text-[10px] ${featured ? "text-violet-200/70" : "text-slate-400"}`}>Edited {new Date(draft.ts).toLocaleString()}</div>}
        </div>
        <ArrowRightIcon className="mt-1 h-5 w-5 shrink-0 transition group-hover:translate-x-1" aria-hidden="true" />
      </div>
    </Link>
  );
}

export default function IndexPage() {
  const { confirmNavigate } = useDirtyState();
  const [drafts, setDrafts] = useState<DraftInventoryItem[]>([]);

  useEffect(() => {
    const refresh = () => setDrafts(readDraftInventory());
    refresh();
    window.addEventListener("soa:creation-flow-drafts-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("soa:creation-flow-drafts-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const featuredDraft = drafts[0];
  const recentDrafts = drafts.slice(1, 5);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.10),_transparent_32%),linear-gradient(to_bottom,_#fafafa,_#f1f5f9)] font-sans dark:bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.18),_transparent_30%),linear-gradient(to_bottom,_#020617,_#0f172a)]">
      <main className="mx-auto w-full max-w-[1500px] px-5 py-7 lg:px-8">
        <header className="grid gap-6 rounded-3xl border border-white/70 bg-white/75 p-6 shadow-xl shadow-slate-900/5 backdrop-blur dark:border-white/10 dark:bg-slate-900/70 lg:grid-cols-[minmax(0,1fr)_minmax(320px,480px)] lg:p-8">
          <div className="flex flex-col justify-center">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-600 dark:text-violet-300">Shadows of Altrail · Creative Studio</div>
            <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-slate-950 dark:text-white lg:text-5xl">
              What do you want to create today?
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300 lg:text-base">
              Begin with the story, feeling, or player moment. The studio will help you shape the records and implementation when the idea is ready.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/author/creation-flow"
                onClick={(event) => {
                  if (!confirmNavigate()) event.preventDefault();
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-500"
              >
                <SparklesIcon className="h-5 w-5" aria-hidden="true" />
                Start with an idea
              </Link>
              <Link
                to="/playtest"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-200"
              >
                <PlayIcon className="h-5 w-5" aria-hidden="true" />
                Play the current build
              </Link>
            </div>
          </div>
          <div>
            {featuredDraft ? (
              <DraftCard draft={featuredDraft} featured onNavigateRequest={confirmNavigate} />
            ) : (
              <div className="flex h-full min-h-44 flex-col justify-center rounded-2xl border border-dashed border-violet-300 bg-violet-50/70 p-5 dark:border-violet-800 dark:bg-violet-950/30">
                <div className="text-sm font-semibold text-violet-950 dark:text-violet-100">Your next idea can stay unfinished.</div>
                <p className="mt-2 text-xs leading-5 text-violet-800/80 dark:text-violet-200/80">Creative drafts save locally as you work, so you can follow the thought and shape it later.</p>
              </div>
            )}
            {recentDrafts.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {recentDrafts.map((draft) => <DraftCard key={draft.key} draft={draft} onNavigateRequest={confirmNavigate} />)}
              </div>
            )}
          </div>
        </header>

        <section className="mt-8">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Create</div>
            <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">Choose the creative intention, not the data table</h2>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {CREATIVE_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.route}
                  to={action.route}
                  onClick={(event) => {
                    if (!confirmNavigate()) event.preventDefault();
                  }}
                  className={`group rounded-2xl border bg-gradient-to-br p-5 transition hover:-translate-y-1 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${action.tone}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/80 text-slate-800 shadow-sm dark:bg-slate-950/70 dark:text-slate-100">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <ArrowRightIcon className="h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-violet-600" aria-hidden="true" />
                  </div>
                  <div className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{action.eyebrow}</div>
                  <h3 className="mt-1 font-semibold text-slate-950 dark:text-white">{action.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{action.description}</p>
                </Link>
              );
            })}
          </div>
        </section>

        <details className="mt-8 rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/70">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">
            Project checks and technical health
            <span className="ml-2 text-xs font-normal text-slate-500">Open when you are ready to review the wider project.</span>
          </summary>
          <div className="mt-4">
            <ProjectHealthPanel onNavigateRequest={confirmNavigate} />
          </div>
        </details>
      </main>
    </div>
  );
}
