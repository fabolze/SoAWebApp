import { NavLink } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useState, type ElementType } from "react";
import {
  AcademicCapIcon,
  ArchiveBoxIcon,
  BanknotesIcon,
  Bars3Icon,
  BeakerIcon,
  BookOpenIcon,
  BuildingStorefrontIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  ClockIcon,
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
} from "@heroicons/react/24/outline";
import { useDirtyState } from "./useDirtyState";

type SidebarItem = {
  to: string;
  label: string;
  icon: ElementType;
};

type SidebarGroup = {
  label: string;
  items: SidebarItem[];
};

function SortableSidebarItem({
  item,
  collapsed,
  hidden,
  groupLabel,
  onNavigateRequest,
}: {
  item: SidebarItem;
  collapsed: boolean;
  hidden: boolean;
  groupLabel: string;
  onNavigateRequest: () => boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.to,
    data: { type: "item", group: groupLabel },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = item.icon;

  return (
    <li ref={setNodeRef} style={style} className={`group relative ${hidden ? "hidden" : ""}`} {...attributes}>
      <div className="flex items-center gap-2">
        <div
          {...listeners}
          className="cursor-grab p-1 focus:outline-none touch-action-none"
          aria-label={`Drag item ${item.label}`}
        >
          <Bars3Icon className="w-4 h-4 text-slate-400" />
        </div>
        <NavLink
          to={item.to}
          onClick={(e) => {
            if (!onNavigateRequest()) e.preventDefault();
          }}
          className={({ isActive }) =>
            `flex items-center ${collapsed ? "justify-center" : "gap-3"} py-2 px-2 rounded-md transition-colors duration-200 ${
              isActive ? "bg-primary text-white" : "hover:bg-slate-700"
            } font-medium ${isDragging ? "pointer-events-none" : ""}`
          }
          title={item.label}
          end={item.to === "/"}
        >
          <Icon className="w-5 h-5 text-current transition-colors duration-200" />
          {!collapsed && <span className="text-xs font-medium">{item.label}</span>}
        </NavLink>
      </div>
      {collapsed && (
        <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity duration-200">
          {item.label}
        </span>
      )}
    </li>
  );
}

function SortableSidebarGroup({
  group,
  collapsed,
  collapsedGroups,
  filter,
  onToggleGroup,
  onNavigateRequest,
}: {
  group: SidebarGroup;
  collapsed: boolean;
  collapsedGroups: Record<string, boolean>;
  filter: string;
  onToggleGroup: (label: string) => void;
  onNavigateRequest: () => boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.label,
    data: { type: "group" },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hiddenSet = useMemo(() => {
    return new Set(
      group.items
        .filter(
          (item) => !item.label.toLowerCase().includes(filter.toLowerCase()) || collapsedGroups[group.label]
        )
        .map((item) => item.to)
    );
  }, [group.items, filter, collapsedGroups, group.label]);

  return (
    <div ref={setNodeRef} style={style} className="mb-6">
      {!collapsed && (
        <div className="flex items-center justify-between px-2 mb-2 text-xs uppercase tracking-wider text-slate-400 font-semibold">
          <button onClick={() => onToggleGroup(group.label)} className="flex items-center gap-1 focus:outline-none">
            <ChevronRightIcon
              className={`w-3 h-3 transition-transform ${collapsedGroups[group.label] ? "" : "rotate-90"}`}
            />
            {group.label}
          </button>
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab p-1 focus:outline-none"
            aria-label={`Drag group ${group.label}`}
          >
            <Bars3Icon className="w-3 h-3 text-slate-400" />
          </div>
        </div>
      )}
      <SortableContext items={group.items.map((i) => i.to)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1">
          {group.items.map((item) => (
            <SortableSidebarItem
              key={item.to}
              item={item}
              collapsed={collapsed}
              hidden={hiddenSet.has(item.to)}
              groupLabel={group.label}
              onNavigateRequest={onNavigateRequest}
            />
          ))}
        </ul>
      </SortableContext>
    </div>
  );
}

const DEFAULT_GROUPS: SidebarGroup[] = [
  {
    label: "System",
    items: [
      { to: "/", label: "Home", icon: HomeIcon },
      { to: "/simulation", label: "Simulation Sandbox", icon: CpuChipIcon },
      { to: "/settings", label: "Settings", icon: Cog6ToothIcon },
    ],
  },
  {
    label: "Gameplay",
    items: [
      { to: "/abilities", label: "Abilities", icon: SparklesIcon },
      { to: "/effects", label: "Effects", icon: BeakerIcon },
      { to: "/statuses", label: "Statuses", icon: BeakerIcon },
      { to: "/attributes", label: "Attributes", icon: ChartBarIcon },
      { to: "/characterclasses", label: "Character Classes", icon: AcademicCapIcon },
      { to: "/talent-trees", label: "Talent Trees", icon: Squares2X2Icon },
      { to: "/talent-nodes", label: "Talent Nodes", icon: PuzzlePieceIcon },
      { to: "/talent-node-links", label: "Talent Node Links", icon: ClipboardDocumentListIcon },
      { to: "/items", label: "Items", icon: CubeIcon },
      { to: "/currencies", label: "Currencies", icon: BanknotesIcon },
      { to: "/stats", label: "Stats", icon: ChartBarIcon },
      { to: "/shops", label: "Shops", icon: BuildingStorefrontIcon },
      { to: "/shops-inventory", label: "Shops Inventory", icon: ClipboardDocumentListIcon },
      { to: "/requirements", label: "Requirements", icon: PuzzlePieceIcon },
    ],
  },
  {
    label: "World",
    items: [
      { to: "/locations", label: "Locations", icon: MapIcon },
      { to: "/factions", label: "Factions", icon: UserGroupIcon },
      { to: "/lore-entries", label: "Lore Entries", icon: BookOpenIcon },
      { to: "/characters", label: "Characters", icon: UsersIcon },
      { to: "/combat-profiles", label: "Combat Profiles", icon: FlagIcon },
      { to: "/interaction-profiles", label: "Interaction Profiles", icon: ChatBubbleLeftRightIcon },
    ],
  },
  {
    label: "Narrative",
    items: [
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

export default function Sidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [menuGroups, setMenuGroups] = useState<SidebarGroup[]>(DEFAULT_GROUPS);
  const { confirmNavigate } = useDirtyState();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setMenuGroups(DEFAULT_GROUPS);
        setCollapsedGroups({});
        return;
      }

      const parsed = JSON.parse(stored);
      const defaultLabels = DEFAULT_GROUPS.map((g) => g.label);
      const storedGroupOrder: string[] = Array.isArray(parsed?.groupOrder) ? parsed.groupOrder : [];
      const mergedGroupOrder = [
        ...storedGroupOrder,
        ...defaultLabels.filter((label) => !storedGroupOrder.includes(label)),
      ];

      const reordered = mergedGroupOrder
        .map((label) => DEFAULT_GROUPS.find((group) => group.label === label))
        .filter((group): group is SidebarGroup => !!group)
        .map((defaultGroup) => {
          const defaultIds = defaultGroup.items.map((i) => i.to);
          const storedOrder = Array.isArray(parsed?.itemOrder?.[defaultGroup.label])
            ? parsed.itemOrder[defaultGroup.label]
            : [];
          const mergedItemOrder = [...storedOrder, ...defaultIds.filter((id) => !storedOrder.includes(id))];
          const sortedItems = mergedItemOrder
            .map((id: string) => defaultGroup.items.find((item) => item.to === id))
            .filter((item): item is SidebarItem => !!item);
          return { ...defaultGroup, items: sortedItems };
        });

      setMenuGroups(reordered.length > 0 ? reordered : DEFAULT_GROUPS);
      setCollapsedGroups(
        parsed?.collapsedGroups && typeof parsed.collapsedGroups === "object" ? parsed.collapsedGroups : {}
      );
    } catch {
      setMenuGroups(DEFAULT_GROUPS);
      setCollapsedGroups({});
    }
  }, []);

  useEffect(() => {
    try {
      const state = {
        groupOrder: menuGroups.map((g) => g.label),
        itemOrder: Object.fromEntries(menuGroups.map((g) => [g.label, g.items.map((i) => i.to)])),
        collapsedGroups,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore persistence failures in local mode.
    }
  }, [menuGroups, collapsedGroups]);

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeType = active.data.current?.type;
    if (activeType === "group") {
      setMenuGroups((prev) => {
        const oldIdx = prev.findIndex((group) => group.label === active.id);
        const newIdx = prev.findIndex((group) => group.label === over.id);
        if (oldIdx === -1 || newIdx === -1) return prev;
        return arrayMove(prev, oldIdx, newIdx);
      });
      return;
    }

    if (activeType === "item") {
      const activeGroup = active.data.current?.group;
      const overGroup = over.data.current?.group;
      if (!activeGroup || activeGroup !== overGroup) return;

      setMenuGroups((prev) => {
        const groupIdx = prev.findIndex((group) => group.label === activeGroup);
        if (groupIdx === -1) return prev;

        const items = prev[groupIdx].items;
        const oldIdx = items.findIndex((item) => item.to === active.id);
        const newIdx = items.findIndex((item) => item.to === over.id);
        if (oldIdx === -1 || newIdx === -1) return prev;

        const next = [...prev];
        next[groupIdx] = { ...next[groupIdx], items: arrayMove(items, oldIdx, newIdx) };
        return next;
      });
    }
  };

  return (
    <nav
      className={`flex flex-col h-screen ${collapsed ? "w-16" : "w-64"} bg-slate-800 text-white border-r border-slate-700 shadow-md transition-all duration-300`}
    >
      <div
        className={`flex items-center gap-2 px-4 py-4 mb-2 border-b border-slate-700 ${collapsed ? "justify-center" : ""}`}
      >
        <img src="/vite.svg" alt="SoA" className="w-8 h-8" />
        {!collapsed && <span className="text-xl font-bold text-primary tracking-tight">SoA Editor</span>}
      </div>
      <button
        className="bg-slate-700 text-white rounded-md p-2 hover:bg-primary hover:text-white transition self-end mx-2 mb-2"
        onClick={onToggleCollapse}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronDoubleRightIcon className="w-5 h-5" /> : <ChevronDoubleLeftIcon className="w-5 h-5" />}
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={menuGroups.map((g) => g.label)} strategy={verticalListSortingStrategy}>
            {menuGroups.map((group) => (
              <SortableSidebarGroup
                key={group.label}
                group={group}
                collapsed={collapsed}
                collapsedGroups={collapsedGroups}
                filter={filter}
                onToggleGroup={toggleGroup}
                onNavigateRequest={confirmNavigate}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </nav>
  );
}
