import type { ElementType } from "react";
import {
  BuildingStorefrontIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentListIcon,
  CubeIcon,
  DocumentTextIcon,
  MapIcon,
  Squares2X2Icon,
  SparklesIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

export interface AuthoringModeConfig {
  id: string;
  route: string;
  label: string;
  description: string;
  supportedEntities: readonly string[];
  icon: ElementType;
}

export const AUTHORING_MODES: readonly AuthoringModeConfig[] = [
  {
    id: "world-builder",
    route: "/author/world",
    label: "World Builder",
    description: "Author locations, routes, POIs, encounter placement, travel, and creative context together.",
    supportedEntities: [
      "locations",
      "location_routes",
      "location_pois",
      "location_encounter_tables",
      "route_event_bindings",
      "travel_tuning",
      "location_creative_briefs",
    ],
    icon: MapIcon,
  },
  {
    id: "location-atlas",
    route: "/author/locations/map",
    label: "Location Atlas",
    description: "Review and arrange the world through its location map.",
    supportedEntities: ["locations"],
    icon: MapIcon,
  },
  {
    id: "location-authoring",
    route: "/author/locations/new",
    label: "Location Authoring",
    description: "Create a location with its hierarchy, ecology, map placement, and encounter hooks.",
    supportedEntities: ["locations"],
    icon: MapIcon,
  },
  {
    id: "item-authoring",
    route: "/author/items/new",
    label: "Item Authoring",
    description: "Create an item through its player-facing mechanics and presentation.",
    supportedEntities: ["items"],
    icon: CubeIcon,
  },
  {
    id: "item-ecosystem",
    route: "/author/items/new/ecosystem",
    label: "Item Ecosystem",
    description: "Author an item together with acquisition sources, rewards, placement, and economy context.",
    supportedEntities: ["items", "shops_inventory", "combat_profiles", "quests", "encounters", "events", "location_pois"],
    icon: Squares2X2Icon,
  },
  {
    id: "shop-authoring",
    route: "/author/shops/new",
    label: "Shop Authoring",
    description: "Create a shop and its inventory as one merchant-facing workspace.",
    supportedEntities: ["shops", "shops_inventory"],
    icon: BuildingStorefrontIcon,
  },
  {
    id: "character-creator",
    route: "/author/characters/new",
    label: "Character Creator",
    description: "Create a character with combat, interaction, progression, and world-presence context.",
    supportedEntities: ["characters", "combat_profiles", "interaction_profiles", "encounters"],
    icon: UsersIcon,
  },
  {
    id: "dialogue-flow",
    route: "/author/dialogues",
    label: "Dialogue Scene Room",
    description: "Stage dialogue branches, story beats, rehearsal paths, and downstream world impact.",
    supportedEntities: ["dialogues", "dialogue_nodes", "character_story_beats"],
    icon: ChatBubbleLeftRightIcon,
  },
  {
    id: "encounter-stage",
    route: "/author/encounters",
    label: "Encounter Stage",
    description: "Compose encounters with participants, gates, rewards, placement, and simulation context.",
    supportedEntities: ["encounters", "characters", "combat_profiles", "requirements", "location_encounter_tables"],
    icon: ClipboardDocumentListIcon,
  },
  {
    id: "quest-journey-board",
    route: "/author/quests",
    label: "Quest Journey Board",
    description: "Author quests with ordered objectives, gates, rewards, arcs, and quest givers.",
    supportedEntities: ["quests", "requirements", "story_arcs", "interaction_profiles"],
    icon: DocumentTextIcon,
  },
  {
    id: "ability-spellcraft",
    route: "/author/abilities",
    label: "Ability Spellcraft Lab",
    description: "Compose trigger, reach, payload, scaling, cadence, effects, statuses, and test-bench feedback together.",
    supportedEntities: ["abilities", "effects", "statuses", "stats", "requirements", "combat_profiles"],
    icon: SparklesIcon,
  },
  {
    id: "dependency-map",
    route: "/author/dependencies",
    label: "Dependency Map",
    description: "Review dependencies across gameplay, world, and narrative content.",
    supportedEntities: ["items", "quests", "encounters", "events", "requirements", "flags"],
    icon: Squares2X2Icon,
  },
];
