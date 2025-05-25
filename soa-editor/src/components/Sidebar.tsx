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

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSidebar = () => setCollapsed((c) => !c);
  const toggleMobile = () => setMobileOpen((m) => !m);

  // Responsive: hide sidebar on mobile, show hamburger
  // (You may want to add a CSS media query for .sidebar.mobile-hidden)

  return (
    <>
      <button
        className="sidebar-hamburger md:hidden fixed top-4 left-4 z-50 bg-[#2c3e50] text-white p-2 rounded"
        onClick={toggleMobile}
        aria-label="Open sidebar"
        style={{ display: mobileOpen ? 'none' : undefined }}
      >
        <svg width="24" height="24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      <nav
        className={`sidebar${collapsed ? ' collapsed' : ''} ${mobileOpen ? ' mobile-open' : ' md:block'} md:relative fixed top-0 left-0 h-full z-40`}
        style={{ display: mobileOpen || window.innerWidth >= 768 ? undefined : 'none' }}
      >
        <button className="toggle-button" onClick={toggleSidebar} aria-label="Collapse sidebar">
          {collapsed ? '➡️' : '⬅️'}
        </button>
        <button
          className="sidebar-close md:hidden absolute top-4 right-4 bg-[#2c3e50] text-white p-2 rounded"
          onClick={toggleMobile}
          aria-label="Close sidebar"
          style={{ display: mobileOpen ? undefined : 'none' }}
        >
          <svg width="24" height="24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <input
          type="text"
          className="sidebar-filter mb-4 w-full px-2 py-1 rounded text-black"
          placeholder="Filter..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ display: collapsed ? 'none' : undefined }}
        />
        <div className="sidebar-groups flex-1 overflow-y-auto">
          {MENU_GROUPS.map(group => {
            const filteredItems = group.items.filter(item =>
              item.label.toLowerCase().includes(filter.toLowerCase())
            );
            if (filteredItems.length === 0) return null;
            return (
              <div key={group.label} className="sidebar-group mb-4">
                {!collapsed && <div className="sidebar-group-label text-xs uppercase tracking-wider text-gray-300 mb-2 pl-2">{group.label}</div>}
                <ul>
                  {filteredItems.map(({ to, label, icon: Icon }) => (
                    <li key={to} className="sidebar-item group relative">
                      <NavLink
                        to={to}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-2 py-2 rounded transition-colors duration-200 ${collapsed ? 'justify-center' : ''} ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-[#34495e]'} sidebar-link`}
                        title={collapsed ? label : undefined}
                        end={to === '/'}
                      >
                        <Icon className="h-6 w-6 flex-shrink-0" />
                        {!collapsed && <span className="sidebar-label">{label}</span>}
                      </NavLink>
                      {collapsed && (
                        <span className="sidebar-tooltip absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
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
    </>
  );
};

export default Sidebar;