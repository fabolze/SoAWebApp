import { Link } from 'react-router-dom';
import type { ForwardRefExoticComponent, RefAttributes, SVGProps } from 'react';
import {
  AcademicCapIcon,
  ArchiveBoxIcon,
  BanknotesIcon,
  BeakerIcon,
  BookOpenIcon,
  BuildingStorefrontIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  CubeIcon,
  DocumentTextIcon,
  FlagIcon,
  HomeIcon,
  MapIcon,
  PuzzlePieceIcon,
  SparklesIcon,
  Squares2X2Icon,
  UserGroupIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import DarkModeToggle from '../components/DarkModeToggle';
import { useDirtyState } from '../components/useDirtyState';
import { TEXT_CLASSES } from '../styles/uiTokens';

type IconComponent = ForwardRefExoticComponent<
  Omit<SVGProps<SVGSVGElement>, 'ref'> & {
    title?: string;
    titleId?: string;
  } & RefAttributes<SVGSVGElement>
>;

interface PageLink {
  path: string;
  name: string;
  icon: IconComponent;
}

interface PageGroup {
  label: string;
  description: string;
  pages: PageLink[];
}

const pageGroups: PageGroup[] = [
  {
    label: 'System',
    description: 'Workspace tools and local project administration.',
    pages: [
      { path: '/simulation', name: 'Simulation Sandbox', icon: CpuChipIcon },
      { path: '/settings', name: 'Settings', icon: Cog6ToothIcon },
    ],
  },
  {
    label: 'Gameplay',
    description: 'Mechanical data used for combat, progression, economy, and rewards.',
    pages: [
      { path: '/abilities', name: 'Abilities', icon: SparklesIcon },
      { path: '/effects', name: 'Effects', icon: BeakerIcon },
      { path: '/statuses', name: 'Statuses', icon: BeakerIcon },
      { path: '/attributes', name: 'Attributes', icon: ChartBarIcon },
      { path: '/stats', name: 'Stats', icon: ChartBarIcon },
      { path: '/characterclasses', name: 'Character Classes', icon: AcademicCapIcon },
      { path: '/talent-trees', name: 'Talent Trees', icon: Squares2X2Icon },
      { path: '/talent-nodes', name: 'Talent Nodes', icon: PuzzlePieceIcon },
      { path: '/talent-node-links', name: 'Talent Node Links', icon: ClipboardDocumentListIcon },
      { path: '/items', name: 'Items', icon: CubeIcon },
      { path: '/currencies', name: 'Currencies', icon: BanknotesIcon },
      { path: '/shops', name: 'Shops', icon: BuildingStorefrontIcon },
      { path: '/shops-inventory', name: 'Shops Inventory', icon: ClipboardDocumentListIcon },
      { path: '/requirements', name: 'Requirements', icon: PuzzlePieceIcon },
    ],
  },
  {
    label: 'World',
    description: 'Places, people, factions, and reusable NPC behavior definitions.',
    pages: [
      { path: '/locations', name: 'Locations', icon: MapIcon },
      { path: '/factions', name: 'Factions', icon: UserGroupIcon },
      { path: '/lore-entries', name: 'Lore Entries', icon: BookOpenIcon },
      { path: '/characters', name: 'Characters', icon: UsersIcon },
      { path: '/combat-profiles', name: 'Combat Profiles', icon: FlagIcon },
      { path: '/interaction-profiles', name: 'Interaction Profiles', icon: ChatBubbleLeftRightIcon },
    ],
  },
  {
    label: 'Narrative',
    description: 'Story flow, branching conversations, events, encounters, and progression flags.',
    pages: [
      { path: '/dialogue-nodes', name: 'Dialogue Nodes', icon: ChatBubbleLeftRightIcon },
      { path: '/dialogues', name: 'Dialogues', icon: ChatBubbleLeftRightIcon },
      { path: '/quests', name: 'Quests', icon: DocumentTextIcon },
      { path: '/content-packs', name: 'Content Packs', icon: ArchiveBoxIcon },
      { path: '/story-arcs', name: 'Story Arcs', icon: Squares2X2Icon },
      { path: '/timelines', name: 'Timelines', icon: ClockIcon },
      { path: '/events', name: 'Events', icon: ClipboardDocumentListIcon },
      { path: '/encounters', name: 'Encounters', icon: ClipboardDocumentListIcon },
      { path: '/flags', name: 'Flags', icon: FlagIcon },
    ],
  },
];

export default function IndexPage() {
  const { confirmNavigate } = useDirtyState();
  const totalPages = pageGroups.reduce((count, group) => count + group.pages.length, 0);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
              <HomeIcon className="h-4 w-4" />
              SoA Editor
            </div>
            <h1 className={`mt-1 text-2xl font-semibold ${TEXT_CLASSES.heading}`}>
              Authoring Workspace
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              {totalPages} editors grouped by how RPG content is usually authored and connected.
            </p>
          </div>
          <DarkModeToggle />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {pageGroups.map((group) => (
            <section key={group.label} className="border-y border-slate-200 bg-white">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{group.label}</h2>
                  <p className="mt-0.5 text-xs text-slate-600">{group.description}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600">
                  {group.pages.length}
                </span>
              </div>
              <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                {group.pages.map((page) => {
                  const Icon = page.icon;
                  return (
                    <Link
                      key={page.path}
                      to={page.path}
                      onClick={(e) => {
                        if (!confirmNavigate()) e.preventDefault();
                      }}
                      className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm text-slate-800 transition-colors hover:bg-blue-50 hover:text-blue-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                      aria-label={page.name}
                    >
                      <Icon className="h-5 w-5 shrink-0 text-slate-500" />
                      <span className="font-medium">{page.name}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
