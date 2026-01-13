// /soa-editor/src/pages/IndexPageEditor.tsx
// This file is responsible for rendering the index page of the application.
// It contains links to all the other pages in the application.
import { Link } from 'react-router-dom';
import DarkModeToggle from '../components/DarkModeToggle';
import {
  HomeIcon,
  SparklesIcon,
  BeakerIcon,
  ChartBarIcon,
  UserGroupIcon,
  ChatBubbleLeftRightIcon,
  BookOpenIcon,
  MapIcon,
  UsersIcon,
  FlagIcon,
  CubeIcon,
  BuildingStorefrontIcon,
  ClipboardDocumentListIcon,
  PuzzlePieceIcon,
  AcademicCapIcon,
  ClockIcon,
  DocumentTextIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';


const IndexPage = () => {
  const pages = [
    { path: '/abilities', name: 'Abilities Editor' },
    { path: '/effects', name: 'Effects Editor' },
    { path: '/statuses', name: 'Statuses Editor' },
    { path: '/attributes', name: 'Attributes Editor' },
    { path: '/characterclasses', name: 'CharacterClasses Editor' },
    { path: '/characters', name: 'Characters Editor' },
    { path: '/combat-profiles', name: 'Combat Profiles Editor' },
    { path: '/dialogue-nodes', name: 'Dialogue Nodes Editor' },
    { path: '/dialogues', name: 'Dialogues Editor' },
    { path: '/encounters', name: 'Encounters Editor' },
    { path: '/events', name: 'Events Editor' },
    { path: '/factions', name: 'Factions Editor' },
    { path: '/flags', name: 'Flags Editor' },
    { path: '/items', name: 'Items Editor' },
    { path: '/locations', name: 'Locations Editor' },
    { path: '/lore-entries', name: 'Lore Entries Editor' },
    { path: '/interaction-profiles', name: 'Interaction Profiles Editor' },
    { path: '/quests', name: 'Quests Editor' },
    { path: '/requirements', name: 'Requirements Editor' },
    { path: '/shops', name: 'Shops Editor' },
    { path: '/shops-inventory', name: 'Shops Inventory Editor' },
    { path: '/stats', name: 'Stats Editor' },
    { path: '/story-arcs', name: 'Story Arcs Editor' },
    { path: '/timelines', name: 'Timelines Editor' },
    { path: '/talent-trees', name: 'Talent Trees Editor' },
    { path: '/talent-nodes', name: 'Talent Nodes Editor' },
    { path: '/talent-node-links', name: 'Talent Node Links Editor' },
  ];

const pageIcons: Record<string, React.ElementType> = {
  '/abilities': SparklesIcon,
  '/effects': BeakerIcon,
  '/statuses': BeakerIcon,
  '/attributes': ChartBarIcon,
  '/characterclasses': AcademicCapIcon,
  '/characters': UsersIcon,
  '/combat-profiles': FlagIcon,
  '/dialogue-nodes': ChatBubbleLeftRightIcon,
  '/dialogues': ChatBubbleLeftRightIcon,
  '/encounters': ClipboardDocumentListIcon,
  '/events': ClipboardDocumentListIcon,
  '/factions': UserGroupIcon,
  '/flags': FlagIcon,
  '/items': CubeIcon,
  '/locations': MapIcon,
  '/lore-entries': BookOpenIcon,
  '/interaction-profiles': ChatBubbleLeftRightIcon,
  '/quests': DocumentTextIcon,
  '/requirements': PuzzlePieceIcon,
  '/shops': BuildingStorefrontIcon,
  '/shops-inventory': ClipboardDocumentListIcon,
  '/stats': ChartBarIcon,
  '/story-arcs': Squares2X2Icon,
  '/timelines': ClockIcon,
  '/talent-trees': Squares2X2Icon,
  '/talent-nodes': PuzzlePieceIcon,
  '/talent-node-links': ClipboardDocumentListIcon,
};


  return (
    <div className="min-h-screen flex flex-col bg-gray-100 dark:bg-gray-900 font-sans">
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold text-primary dark:text-primary-content">Welcome to the SoA Editor</h1>
          <DarkModeToggle />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {pages.map((page) => {
            const Icon = pageIcons[page.path] || HomeIcon;
            return (
              <Link
                key={page.path}
                to={page.path}
                className="card w-full bg-base-100 shadow-xl hover:shadow-2xl transition-transform hover:-translate-y-1 rounded-xl border border-gray-200 dark:border-gray-700 group focus:outline-none focus:ring-2 focus:ring-primary/40"
                tabIndex={0}
                aria-label={page.name}
              >
                <div className="card-body flex flex-col items-center justify-center p-6">
                  <span className="mb-3 w-12 h-12 flex items-center justify-center rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition">
                    <Icon className="w-8 h-8" />
                  </span>
                  <h2 className="text-xl font-semibold text-primary mb-0 dark:text-primary-content text-center group-hover:text-white transition">
                    {page.name}
                  </h2>
                </div>
              </Link>
            );
          })}

        </div>
      </main>
    </div>
  );
};

export default IndexPage;
