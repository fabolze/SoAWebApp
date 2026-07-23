import { useEffect, useMemo, useState, type ElementType } from "react";
import { NavLink } from "react-router-dom";
import {
  AcademicCapIcon,
  ArchiveBoxIcon,
  BanknotesIcon,
  BeakerIcon,
  BookOpenIcon,
  BuildingStorefrontIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  CubeIcon,
  DocumentTextIcon,
  FlagIcon,
  HomeIcon,
  MapIcon,
  PlayIcon,
  PuzzlePieceIcon,
  SparklesIcon,
  Squares2X2Icon,
  UserGroupIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { useDirtyState } from "./useDirtyState";
import DarkModeToggle from "./DarkModeToggle";

type SidebarItem = {
  to: string;
  label: string;
  icon: ElementType;
};

type SidebarGroup = {
  label: string;
  description?: string;
  items: SidebarItem[];
};

const NAV_GROUPS: SidebarGroup[] = [
  {
    label: "Start",
    description: "Begin or resume creative work",
    items: [
      { to: "/", label: "Creative Home", icon: HomeIcon },
      { to: "/author/creation-flow", label: "Capture An Idea", icon: SparklesIcon },
    ],
  },
  {
    label: "Story",
    items: [
      { to: "/author/dialogues", label: "Write Dialogue", icon: ChatBubbleLeftRightIcon },
      { to: "/author/quests", label: "Build A Quest", icon: DocumentTextIcon },
      { to: "/author/story-timeline", label: "Shape The Story", icon: ClockIcon },
      { to: "/author/progression-flow", label: "Plan Progression", icon: Squares2X2Icon },
      { to: "/author/dependencies", label: "Check Dependencies", icon: PuzzlePieceIcon },
    ],
  },
  {
    label: "World & Cast",
    items: [
      { to: "/author/world", label: "Build The World", icon: MapIcon },
      { to: "/author/locations/map", label: "Explore The Atlas", icon: MapIcon },
      { to: "/author/characters/new", label: "Create A Character", icon: UsersIcon },
      { to: "/author/encounters", label: "Stage An Encounter", icon: ClipboardDocumentListIcon },
    ],
  },
  {
    label: "Gameplay",
    items: [
      { to: "/author/items/new", label: "Create An Item", icon: CubeIcon },
      { to: "/author/items/new/ecosystem", label: "Design Item Journey", icon: Squares2X2Icon },
      { to: "/author/shops/new", label: "Build A Shop", icon: BuildingStorefrontIcon },
      { to: "/author/abilities", label: "Craft An Ability", icon: SparklesIcon },
      { to: "/author/creatures", label: "Create A Creature", icon: UserGroupIcon },
    ],
  },
  {
    label: "Play & Review",
    items: [
      { to: "/playtest", label: "Playtest: Shadows of Shanoir", icon: PlayIcon },
      { to: "/simulation", label: "Simulation Sandbox", icon: CpuChipIcon },
      { to: "/settings", label: "Project Settings", icon: Cog6ToothIcon },
    ],
  },
  {
    label: "Data & Tools",
    description: "Complete technical editors",
    items: [
      { to: "/abilities", label: "Abilities", icon: SparklesIcon },
      { to: "/effects", label: "Effects", icon: BeakerIcon },
      { to: "/statuses", label: "Statuses", icon: BeakerIcon },
      { to: "/attributes", label: "Attributes", icon: ChartBarIcon },
      { to: "/stats", label: "Stats", icon: ChartBarIcon },
      { to: "/characterclasses", label: "Character Classes", icon: AcademicCapIcon },
      { to: "/talent-trees", label: "Talent Trees", icon: Squares2X2Icon },
      { to: "/talent-nodes", label: "Talent Nodes", icon: PuzzlePieceIcon },
      { to: "/talent-node-links", label: "Talent Node Links", icon: ClipboardDocumentListIcon },
      { to: "/items", label: "Items", icon: CubeIcon },
      { to: "/currencies", label: "Currencies", icon: BanknotesIcon },
      { to: "/shops", label: "Shops", icon: BuildingStorefrontIcon },
      { to: "/shops-inventory", label: "Shop Inventory", icon: ClipboardDocumentListIcon },
      { to: "/requirements", label: "Requirements", icon: PuzzlePieceIcon },
      { to: "/locations", label: "Locations", icon: MapIcon },
      { to: "/location-routes", label: "Location Routes", icon: MapIcon },
      { to: "/location-pois", label: "Location POIs", icon: MapIcon },
      { to: "/location-encounter-tables", label: "Encounter Tables", icon: ClipboardDocumentListIcon },
      { to: "/route-event-bindings", label: "Route Events", icon: ClipboardDocumentListIcon },
      { to: "/travel-tuning", label: "Travel Tuning", icon: ChartBarIcon },
      { to: "/location-creative-briefs", label: "Creative Briefs", icon: BookOpenIcon },
      { to: "/factions", label: "Factions", icon: UserGroupIcon },
      { to: "/lore-entries", label: "Lore Entries", icon: BookOpenIcon },
      { to: "/characters", label: "Characters", icon: UsersIcon },
      { to: "/combat-profiles", label: "Combat Profiles", icon: FlagIcon },
      { to: "/interaction-profiles", label: "Interaction Profiles", icon: ChatBubbleLeftRightIcon },
      { to: "/character-story-profiles", label: "Character Story Profiles", icon: BookOpenIcon },
      { to: "/character-relationships", label: "Character Relationships", icon: UserGroupIcon },
      { to: "/character-story-beats", label: "Character Story Beats", icon: ClockIcon },
      { to: "/adventure-beats", label: "Adventure Beats", icon: ClockIcon },
      { to: "/adventure-beat-links", label: "Adventure Beat Links", icon: ClipboardDocumentListIcon },
      { to: "/dialogue-nodes", label: "Dialogue Nodes", icon: ChatBubbleLeftRightIcon },
      { to: "/dialogues", label: "Dialogues", icon: ChatBubbleLeftRightIcon },
      { to: "/quests", label: "Quests", icon: DocumentTextIcon },
      { to: "/content-packs", label: "Content Packs", icon: ArchiveBoxIcon },
      { to: "/story-arcs", label: "Story Arcs", icon: Squares2X2Icon },
      { to: "/timelines", label: "Timelines", icon: ClockIcon },
      { to: "/events", label: "Events", icon: ClipboardDocumentListIcon },
      { to: "/encounters", label: "Encounters", icon: ClipboardDocumentListIcon },
      { to: "/flags", label: "Flags", icon: FlagIcon },
    ],
  },
];

const STORAGE_KEY = "soa.sidebar";
const COLLAPSED_PINNED = new Set([
  "/",
  "/author/creation-flow",
  "/author/dialogues",
  "/author/world",
  "/author/story-timeline",
  "/playtest",
]);

function initialCollapsedGroups(): Record<string, boolean> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as {
      collapsedGroups?: Record<string, boolean>;
    } | null;
    return {
      "Data & Tools": true,
      ...(parsed?.collapsedGroups || {}),
    };
  } catch {
    return { "Data & Tools": true };
  }
}

function SidebarLink({
  item,
  collapsed,
  onNavigateRequest,
}: {
  item: SidebarItem;
  collapsed: boolean;
  onNavigateRequest: () => boolean;
}) {
  const Icon = item.icon;
  return (
    <li className="group relative">
      <NavLink
        to={item.to}
        onClick={(event) => {
          if (!onNavigateRequest()) event.preventDefault();
        }}
        className={({ isActive }) =>
          `flex min-h-9 items-center rounded-lg px-2.5 py-2 transition ${
            collapsed ? "justify-center" : "gap-3"
          } ${
            isActive
              ? "bg-violet-500/20 text-violet-100 ring-1 ring-inset ring-violet-400/30"
              : "text-slate-300 hover:bg-white/[0.08] hover:text-white"
          }`
        }
        title={item.label}
        end={item.to === "/"}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        {!collapsed && <span className="truncate text-xs font-medium">{item.label}</span>}
      </NavLink>
      {collapsed && (
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition group-hover:opacity-100">
          {item.label}
        </span>
      )}
    </li>
  );
}

export default function Sidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(initialCollapsedGroups);
  const { confirmNavigate } = useDirtyState();
  const normalizedFilter = filter.trim().toLowerCase();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ collapsedGroups }));
    } catch {
      // Navigation remains usable without local preferences.
    }
  }, [collapsedGroups]);

  const visibleGroups = useMemo(() => NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      (!collapsed || COLLAPSED_PINNED.has(item.to))
      && (!normalizedFilter || `${item.label} ${group.label}`.toLowerCase().includes(normalizedFilter))
    ),
  })).filter((group) => group.items.length > 0), [collapsed, normalizedFilter]);

  return (
    <nav className={`flex h-screen shrink-0 flex-col border-r border-slate-800 bg-[radial-gradient(circle_at_top,_#312e81_0,_#111827_38%,_#0f172a_100%)] text-white shadow-xl transition-all duration-300 ${collapsed ? "w-16" : "w-64"}`}>
      <div className={`flex items-center gap-3 border-b border-white/10 px-3 py-4 ${collapsed ? "justify-center" : ""}`}>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-500 text-[11px] font-black tracking-tight text-white shadow-lg shadow-violet-950/40">
          SoA
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-wide">Shadows of Altrail</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-violet-200/70">Creative Studio</div>
          </div>
        )}
      </div>

      <div className={`flex items-center gap-2 px-2 py-3 ${collapsed ? "flex-col" : "justify-between"}`}>
        <DarkModeToggle compact={collapsed} />
        <button
          type="button"
          className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronDoubleRightIcon className="h-4 w-4" /> : <ChevronDoubleLeftIcon className="h-4 w-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="px-2 pb-3">
          <input
            type="search"
            className="w-full rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2 text-xs text-white outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
            placeholder="Find a creative space…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {visibleGroups.map((group) => {
          const groupCollapsed = !normalizedFilter && Boolean(collapsedGroups[group.label]);
          return (
            <section key={group.label} className={collapsed ? "mb-2" : "mb-4"}>
              {!collapsed && (
                <button
                  type="button"
                  className="mb-1 flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 hover:text-slate-200"
                  onClick={() => setCollapsedGroups((current) => ({ ...current, [group.label]: !current[group.label] }))}
                  aria-expanded={!groupCollapsed}
                >
                  <span>
                    {group.label}
                    {group.description && <span className="sr-only"> — {group.description}</span>}
                  </span>
                  <ChevronRightIcon className={`h-3 w-3 transition ${groupCollapsed ? "" : "rotate-90"}`} aria-hidden="true" />
                </button>
              )}
              {!groupCollapsed && (
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <SidebarLink key={item.to} item={item} collapsed={collapsed} onNavigateRequest={confirmNavigate} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </nav>
  );
}
