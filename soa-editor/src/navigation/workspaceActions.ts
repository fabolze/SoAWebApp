import type { NavigateFunction } from "react-router-dom";
import { AUTHORING_MODES } from "../config/authoringModes";

export interface WorkspaceAction {
  id: string;
  title: string;
  subtitle: string;
  keywords: string[];
  route: string;
}

const SCHEMA_ROUTES: Array<{ schema: string; label: string; route: string; keywords?: string[] }> = [
  { schema: "abilities", label: "Abilities", route: "/abilities" },
  { schema: "effects", label: "Effects", route: "/effects" },
  { schema: "statuses", label: "Statuses", route: "/statuses" },
  { schema: "items", label: "Items", route: "/items" },
  { schema: "shops", label: "Shops", route: "/shops" },
  { schema: "shops_inventory", label: "Shops Inventory", route: "/shops-inventory" },
  { schema: "requirements", label: "Requirements", route: "/requirements" },
  { schema: "flags", label: "Flags", route: "/flags" },
  { schema: "locations", label: "Locations", route: "/locations" },
  { schema: "location_routes", label: "Location Routes", route: "/location-routes" },
  { schema: "location_pois", label: "Location POIs", route: "/location-pois" },
  { schema: "location_encounter_tables", label: "Encounter Tables", route: "/location-encounter-tables" },
  { schema: "route_event_bindings", label: "Route Events", route: "/route-event-bindings" },
  { schema: "travel_tuning", label: "Travel Tuning", route: "/travel-tuning" },
  { schema: "location_creative_briefs", label: "Creative Briefs", route: "/location-creative-briefs" },
  { schema: "characters", label: "Characters", route: "/characters" },
  { schema: "combat_profiles", label: "Combat Profiles", route: "/combat-profiles" },
  { schema: "interaction_profiles", label: "Interaction Profiles", route: "/interaction-profiles" },
  { schema: "character_story_profiles", label: "Character Story Profiles", route: "/character-story-profiles" },
  { schema: "character_relationships", label: "Character Relationships", route: "/character-relationships" },
  { schema: "character_story_beats", label: "Character Story Beats", route: "/character-story-beats" },
  { schema: "dialogues", label: "Dialogues", route: "/dialogues" },
  { schema: "dialogue_nodes", label: "Dialogue Nodes", route: "/dialogue-nodes" },
  { schema: "quests", label: "Quests", route: "/quests" },
  { schema: "events", label: "Events", route: "/events" },
  { schema: "encounters", label: "Encounters", route: "/encounters" },
  { schema: "story_arcs", label: "Story Arcs", route: "/story-arcs" },
  { schema: "timelines", label: "Timelines", route: "/timelines" },
  { schema: "adventure_beats", label: "Adventure Beats", route: "/adventure-beats" },
  { schema: "adventure_beat_links", label: "Adventure Beat Links", route: "/adventure-beat-links" },
  { schema: "factions", label: "Factions", route: "/factions" },
  { schema: "lore_entries", label: "Lore Entries", route: "/lore-entries" },
  { schema: "currencies", label: "Currencies", route: "/currencies" },
  { schema: "content_packs", label: "Content Packs", route: "/content-packs" },
];

const IMMERSIVE_SCHEMA_ROUTES: Record<string, (id: string) => string> = {
  items: (id) => `/author/items/${encodeURIComponent(id)}`,
  shops: (id) => `/author/shops/${encodeURIComponent(id)}`,
  characters: (id) => `/author/characters/${encodeURIComponent(id)}`,
  dialogues: (id) => `/author/dialogues/${encodeURIComponent(id)}`,
  encounters: (id) => `/author/encounters/${encodeURIComponent(id)}`,
  quests: (id) => `/author/quests/${encodeURIComponent(id)}`,
  locations: (id) => `/author/locations/${encodeURIComponent(id)}`,
  abilities: (id) => `/author/abilities/${encodeURIComponent(id)}`,
};

export function schemaListRoute(schemaName: string): string {
  return SCHEMA_ROUTES.find((entry) => entry.schema === schemaName)?.route || `/${schemaName.replace(/_/g, "-")}`;
}

export function entityRoute(schemaName: string, id: string, preferAuthoring = true): string {
  const encoded = encodeURIComponent(id);
  if (preferAuthoring && IMMERSIVE_SCHEMA_ROUTES[schemaName]) return IMMERSIVE_SCHEMA_ROUTES[schemaName](id);
  return `${schemaListRoute(schemaName)}?selected=${encoded}`;
}

export function workspaceActions(): WorkspaceAction[] {
  const authoring = AUTHORING_MODES.map((mode) => ({
    id: `authoring:${mode.id}`,
    title: mode.label,
    subtitle: mode.description,
    keywords: ["author", "workspace", mode.id, ...mode.supportedEntities],
    route: mode.route,
  }));
  const schemas = SCHEMA_ROUTES.map((entry) => ({
    id: `schema:${entry.schema}`,
    title: entry.label,
    subtitle: `Open ${entry.label} table editor`,
    keywords: ["table", "schema", "editor", entry.schema, ...(entry.keywords || [])],
    route: entry.route,
  }));
  return [
    { id: "home", title: "Home", subtitle: "Open the workspace index", keywords: ["home", "index"], route: "/" },
    { id: "simulation", title: "Simulation Sandbox", subtitle: "Open mechanical simulation tools", keywords: ["simulation", "sandbox", "test"], route: "/simulation" },
    ...authoring,
    ...schemas,
  ];
}

export function navigateToWorkspace(navigate: NavigateFunction, action: WorkspaceAction) {
  navigate(action.route);
}
