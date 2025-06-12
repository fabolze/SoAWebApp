// soa-editor/components/Sidebar.tsx
// This file is responsible for rendering the sidebar of the application.
import { NavLink } from 'react-router-dom';
import { useState } from 'react';
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

const MENU_GROUPS = [
  {
    label: 'World',
    items: [
      { to: '/locations', label: 'Locations', icon: MapIcon },
      { to: '/factions', label: 'Factions', icon: UserGroupIcon },
      { to: '/npcs', label: 'NPCs', icon: UsersIcon },
      { to: '/lore-entries', label: 'Lore Entries', icon: BookOpenIcon },
      { to: '/enemies', label: 'Enemies', icon: FlagIcon },
    ],
  },
  {
    label: 'Gameplay',
    items: [
      { to: '/abilities', label: 'Abilities', icon: SparklesIcon },
      { to: '/effects', label: 'Effects', icon: BeakerIcon },
      { to: '/attributes', label: 'Attributes', icon: ChartBarIcon },
      { to: '/characterclasses', label: 'Character Classes', icon: AcademicCapIcon },
      { to: '/items', label: 'Items', icon: CubeIcon },
      { to: '/stats', label: 'Stats', icon: ChartBarIcon },
      { to: '/shops', label: 'Shops', icon: BuildingStorefrontIcon },
      { to: '/shops-inventory', label: 'Shops Inventory', icon: ClipboardDocumentListIcon },
      { to: '/requirements', label: 'Requirements', icon: PuzzlePieceIcon },
    ],
  },
  {
    label: 'Narrative',
    items: [
      { to: '/dialogue-nodes', label: 'Dialogue Nodes', icon: ChatBubbleLeftRightIcon },
      { to: '/dialogues', label: 'Dialogues', icon: ChatBubbleLeftRightIcon },
      { to: '/quests', label: 'Quests', icon: DocumentTextIcon },
      { to: '/story-arcs', label: 'Story Arcs', icon: Squares2X2Icon },
      { to: '/timelines', label: 'Timelines', icon: ClockIcon },
      { to: '/events', label: 'Events', icon: ClipboardDocumentListIcon },
      { to: '/encounters', label: 'Encounters', icon: ClipboardDocumentListIcon },
      { to: '/flags', label: 'Flags', icon: FlagIcon },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/', label: 'Home', icon: HomeIcon },
    ],
  },
];

const Sidebar = ({ collapsed, onToggleCollapse }: { collapsed: boolean, onToggleCollapse: () => void }) => {
  const [filter, setFilter] = useState('');
  const [groupOpen, setGroupOpen] = useState(() =>
    Object.fromEntries(MENU_GROUPS.map(g => [g.label, true]))
  );

  const toggleGroup = (label: string) =>
    setGroupOpen((prev) => ({ ...prev, [label]: !prev[label] }));

  return (
    <nav
      className={`flex flex-col h-screen ${collapsed ? 'w-16' : 'w-64'} bg-slate-800 text-white border-r border-slate-700 shadow-md transition-all duration-300`}
      aria-label="Sidebar navigation"
    >
      <div className={`flex items-center gap-2 px-4 py-4 mb-2 border-b border-slate-700 ${collapsed ? 'justify-center' : ''}`}>
        <img src="/vite.svg" alt="SoA" className="w-8 h-8" />
        {!collapsed && <span className="text-xl font-bold text-primary tracking-tight">SoA Editor</span>}
      </div>
      <button
        className="bg-slate-700 text-white rounded-md p-2 hover:bg-primary hover:text-white transition self-end mx-2 mb-2"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '➡️' : '⬅️'}
      </button>
      {/* Filter input */}
      {!collapsed && (
        <input
          type="text"
          className="mb-4 w-full px-3 py-2 rounded-md border border-slate-600 text-black dark:text-white bg-white dark:bg-slate-800 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
          placeholder="Filter..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          aria-label="Filter sidebar items"
        />
      )}
      <div className="flex-1 overflow-y-auto">
        {MENU_GROUPS.map(group => {
          const filteredItems = group.items.filter(item =>
            item.label.toLowerCase().includes(filter.toLowerCase())
          );
          if (filteredItems.length === 0) return null;
          return (
            <div key={group.label} className="mb-6">
              {!collapsed && (
                <button
                  className="flex items-center w-full text-xs uppercase tracking-wider text-slate-400 mb-2 pl-2 font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={groupOpen[group.label]}
                  tabIndex={0}
                >
                  <span className={`mr-2 transition-transform ${groupOpen[group.label] ? 'rotate-90' : ''}`}>▶</span>
                  {group.label}
                </button>
              )}
              <ul className="space-y-1">
                {groupOpen[group.label] && filteredItems.map(({ to, label, icon: Icon }) => (
                  <li key={to} className="group relative">
                    <NavLink
                      to={to}
                      className={({ isActive }) =>
                        `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} py-2 rounded-md transition-colors duration-200 ${isActive ? 'bg-primary text-white' : 'hover:bg-slate-700'} font-medium focus:outline-none focus:ring-2 focus:ring-primary/40`
                      }
                      title={label}
                      end={to === '/'}
                      tabIndex={0}
                      aria-current={undefined}
                      style={{ minHeight: '48px' }}
                    >
                      {Icon && typeof Icon === 'function' ? (
                        <Icon className={collapsed ? "w-5 h-5 text-primary" : "w-4 h-4 text-primary mr-2"} />
                      ) : null}
                      {!collapsed && <span className="text-xs font-medium">{label}</span>}
                    </NavLink>
                    {collapsed && (
                      <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity duration-200">
                        {label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
};

export default Sidebar;