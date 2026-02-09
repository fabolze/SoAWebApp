// Sidebar.tsx (cleaned up: safe drag-and-drop, group+item sorting, persistent collapsed state)
import { NavLink } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useState } from 'react';
import {
  HomeIcon, SparklesIcon, BeakerIcon, ChartBarIcon, UserGroupIcon, ChatBubbleLeftRightIcon,
  BookOpenIcon, MapIcon, UsersIcon, FlagIcon, CubeIcon, BuildingStorefrontIcon, BanknotesIcon,
  ClipboardDocumentListIcon, PuzzlePieceIcon, AcademicCapIcon, ClockIcon, DocumentTextIcon,
  Squares2X2Icon, Cog6ToothIcon, ArchiveBoxIcon, Bars3Icon, ChevronRightIcon,
  CpuChipIcon,
  ChevronDoubleLeftIcon, ChevronDoubleRightIcon
} from '@heroicons/react/24/outline';

function SortableSidebarItem({ to, label, icon: Icon, collapsed, hidden, groupLabel }: {
  to: string;
  label: string;
  icon: React.ElementType;
  collapsed: boolean;
  hidden: boolean;
  groupLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: to,
    data: { type: 'item', group: groupLabel },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group relative ${hidden ? 'hidden' : ''}`}
      {...attributes}
    >
      <div className="flex items-center gap-2">
        <div
          {...listeners}
          className="cursor-grab p-1 focus:outline-none touch-action-none"
          aria-label={`Drag item ${label}`}
        >
          <Bars3Icon className="w-4 h-4 text-slate-400" />
        </div>
        <NavLink
          to={to}
          onClick={(e) => {
            const dirty = (window as any).__soaDirty;
            if (dirty && !window.confirm('You have unsaved changes. Discard them?')) {
              e.preventDefault();
            }
          }}
          className={({ isActive }) =>
            `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} py-2 px-2 rounded-md transition-colors duration-200 ${isActive ? 'bg-primary text-white' : 'hover:bg-slate-700'} font-medium ${isDragging ? 'pointer-events-none' : ''}`
          }
          title={label}
          end={to === '/'}
        >
          <Icon className="w-5 h-5 text-current transition-colors duration-200" />
          {!collapsed && <span className="text-xs font-medium">{label}</span>}
        </NavLink>
      </div>
      {collapsed && (
        <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity duration-200">
          {label}
        </span>
      )}
    </li>
  );
}

const DEFAULT_GROUPS = [
  {
    label: 'System',
    items: [
      { to: '/', label: 'Home', icon: HomeIcon },
      { to: '/simulation', label: 'Simulation Sandbox', icon: CpuChipIcon },
      { to: '/settings', label: 'Settings', icon: Cog6ToothIcon },
    ],
  },
  {
    label: 'Gameplay',
    items: [
      { to: '/abilities', label: 'Abilities', icon: SparklesIcon },
      { to: '/effects', label: 'Effects', icon: BeakerIcon },
      { to: '/statuses', label: 'Statuses', icon: BeakerIcon },
      { to: '/attributes', label: 'Attributes', icon: ChartBarIcon },
      { to: '/characterclasses', label: 'Character Classes', icon: AcademicCapIcon },
      { to: '/talent-trees', label: 'Talent Trees', icon: Squares2X2Icon },
      { to: '/talent-nodes', label: 'Talent Nodes', icon: PuzzlePieceIcon },
      { to: '/talent-node-links', label: 'Talent Node Links', icon: ClipboardDocumentListIcon },
      { to: '/items', label: 'Items', icon: CubeIcon },
      { to: '/currencies', label: 'Currencies', icon: BanknotesIcon },
      { to: '/stats', label: 'Stats', icon: ChartBarIcon },
      { to: '/shops', label: 'Shops', icon: BuildingStorefrontIcon },
      { to: '/shops-inventory', label: 'Shops Inventory', icon: ClipboardDocumentListIcon },
      { to: '/requirements', label: 'Requirements', icon: PuzzlePieceIcon },
    ],
  },
  {
    label: 'World',
    items: [
      { to: '/locations', label: 'Locations', icon: MapIcon },
      { to: '/factions', label: 'Factions', icon: UserGroupIcon },
      { to: '/lore-entries', label: 'Lore Entries', icon: BookOpenIcon },
      { to: '/characters', label: 'Characters', icon: UsersIcon },
      { to: '/combat-profiles', label: 'Combat Profiles', icon: FlagIcon },
      { to: '/interaction-profiles', label: 'Interaction Profiles', icon: ChatBubbleLeftRightIcon },
    ],
  },
  {
    label: 'Narrative',
    items: [
      { to: '/dialogue-nodes', label: 'Dialogue Nodes', icon: ChatBubbleLeftRightIcon },
      { to: '/dialogues', label: 'Dialogues', icon: ChatBubbleLeftRightIcon },
      { to: '/quests', label: 'Quests', icon: DocumentTextIcon },
      { to: '/content-packs', label: 'Content Packs', icon: ArchiveBoxIcon },
      { to: '/story-arcs', label: 'Story Arcs', icon: Squares2X2Icon },
      { to: '/timelines', label: 'Timelines', icon: ClockIcon },
      { to: '/events', label: 'Events', icon: ClipboardDocumentListIcon },
      { to: '/encounters', label: 'Encounters', icon: ClipboardDocumentListIcon },
      { to: '/flags', label: 'Flags', icon: FlagIcon },
    ],
  },
];

const STORAGE_KEY = 'soa.sidebar';

export default function Sidebar({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const [filter, setFilter] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [menuGroups, setMenuGroups] = useState(DEFAULT_GROUPS);

  useEffect(() => {
    console.log('Sidebar component mounted');

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      console.log('Loaded sidebar state:', stored);
      if (!stored) {
        console.log('No sidebar state found in localStorage, using defaults.');
        setMenuGroups(DEFAULT_GROUPS);
        setCollapsedGroups({});
        return;
      }

      const parsed = JSON.parse(stored);

      const reordered = DEFAULT_GROUPS.map((defaultGroup) => {
        const defaultIds = defaultGroup.items.map((i) => i.to);
        const storedOrder = Array.isArray(parsed.itemOrder?.[defaultGroup.label])
          ? parsed.itemOrder[defaultGroup.label]
          : [];
        const baseOrder = storedOrder.length > 0 ? [...storedOrder] : [...defaultIds];
        const fullOrder = baseOrder.concat(defaultIds.filter((id) => !baseOrder.includes(id)));
        const sortedItems = fullOrder
          .map((id: string) => defaultGroup.items.find((i) => i.to === id))
          .filter(Boolean) as typeof defaultGroup.items;

        return { ...defaultGroup, items: sortedItems };
      });

      setMenuGroups(reordered);
      setCollapsedGroups(parsed.collapsedGroups || {});
    } catch (error) {
      console.error('Failed to parse sidebar state from localStorage:', error);
      setMenuGroups(DEFAULT_GROUPS);
      setCollapsedGroups({});
    }
  }, []);

  useEffect(() => {
    console.log('Sidebar state updated:', { menuGroups, collapsedGroups });

    try {
      const state = {
        groupOrder: menuGroups.map((g) => g.label),
        itemOrder: Object.fromEntries(menuGroups.map((g) => [g.label, g.items.map((i) => i.to)])),
        collapsedGroups,
      };
      console.log('Saving sidebar state:', state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save sidebar state to localStorage:', error);
    }
  }, [menuGroups, collapsedGroups]);

  // Debugging: Log when the component mounts
  useEffect(() => {
    console.log('Sidebar component mounted');
  }, []);

  const toggleGroup = (label: string) => setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = () => {};

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeType = active.data.current?.type;

    if (activeType === 'group') {
      const oldIdx = menuGroups.findIndex((g) => g.label === active.id);
      const newIdx = menuGroups.findIndex((g) => g.label === over.id);
      if (oldIdx === -1 || newIdx === -1) return;
      setMenuGroups(arrayMove(menuGroups, oldIdx, newIdx));
    } else if (activeType === 'item') {
      const groupLabel = active.data.current?.group;
      const groupIdx = menuGroups.findIndex((g) => g.label === groupLabel);
      if (groupIdx === -1) return;
      const items = menuGroups[groupIdx].items;
      const oldIdx = items.findIndex((i) => i.to === active.id);
      const newIdx = items.findIndex((i) => i.to === over.id);
      if (oldIdx === -1 || newIdx === -1) return;
      const updated = [...menuGroups];
      updated[groupIdx] = { ...updated[groupIdx], items: arrayMove(items, oldIdx, newIdx) };
      setMenuGroups(updated);
    }
  };

  return (
    <nav className={`flex flex-col h-screen ${collapsed ? 'w-16' : 'w-64'} bg-slate-800 text-white border-r border-slate-700 shadow-md transition-all duration-300`}>
      <div className={`flex items-center gap-2 px-4 py-4 mb-2 border-b border-slate-700 ${collapsed ? 'justify-center' : ''}`}>
        <img src="/vite.svg" alt="SoA" className="w-8 h-8" />
        {!collapsed && <span className="text-xl font-bold text-primary tracking-tight">SoA Editor</span>}
      </div>
      <button
        className="bg-slate-700 text-white rounded-md p-2 hover:bg-primary hover:text-white transition self-end mx-2 mb-2"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronDoubleRightIcon className="w-5 h-5" />
        ) : (
          <ChevronDoubleLeftIcon className="w-5 h-5" />
        )}
      </button>
      {!collapsed && (
        <input
          type="text"
          className="mb-4 w-full px-3 py-2 rounded-md border border-slate-600 text-black dark:text-white bg-white dark:bg-slate-800"
          placeholder="Filter..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}
      <div className="flex-1 overflow-y-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext items={menuGroups.map((g) => g.label)} strategy={verticalListSortingStrategy}>
            {menuGroups.map((group) => {
              const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
                id: group.label,
                data: { type: 'group' },
              });
              const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
              const hiddenSet = new Set(
                group.items
                  .filter((item) =>
                    !item.label.toLowerCase().includes(filter.toLowerCase()) || collapsedGroups[group.label]
                  )
                  .map((item) => item.to)
              );
              return (
                <div key={group.label} ref={setNodeRef} style={style} className="mb-6">
                  {!collapsed && (
                    <div className="flex items-center justify-between px-2 mb-2 text-xs uppercase tracking-wider text-slate-400 font-semibold">
                      <button onClick={() => toggleGroup(group.label)} className="flex items-center gap-1 focus:outline-none">
                        <ChevronRightIcon className={`w-3 h-3 transition-transform ${collapsedGroups[group.label] ? '' : 'rotate-90'}`} />
                        {group.label}
                      </button>
                      <div {...listeners} className="cursor-grab p-1 focus:outline-none" aria-label={`Drag group ${group.label}`}>
                        <Bars3Icon className="w-3 h-3 text-slate-400" />
                      </div>
                    </div>
                  )}
                  <SortableContext items={group.items.map((i) => i.to)} strategy={verticalListSortingStrategy}>
                    <ul className="space-y-1">
                      {group.items.map(({ to, label, icon }) => (
                        <SortableSidebarItem
                          key={to}
                          to={to}
                          label={label}
                          icon={icon}
                          collapsed={collapsed}
                          hidden={hiddenSet.has(to)}
                          groupLabel={group.label}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </div>
              );
            })}
          </SortableContext>
        </DndContext>
      </div>
    </nav>
  );
}



