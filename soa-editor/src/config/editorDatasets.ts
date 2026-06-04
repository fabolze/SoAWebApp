export interface EditorDatasetConfig {
  schemaName: string;
  apiPath: string;
  routePath: string;
  label: string;
}

export const EDITOR_DATASETS: EditorDatasetConfig[] = [
  { schemaName: "abilities", apiPath: "abilities", routePath: "abilities", label: "Abilities" },
  { schemaName: "attributes", apiPath: "attributes", routePath: "attributes", label: "Attributes" },
  { schemaName: "effects", apiPath: "effects", routePath: "effects", label: "Effects" },
  { schemaName: "characterclasses", apiPath: "characterclasses", routePath: "characterclasses", label: "Character Classes" },
  { schemaName: "characters", apiPath: "characters", routePath: "characters", label: "Characters" },
  { schemaName: "combat_profiles", apiPath: "combat_profiles", routePath: "combat-profiles", label: "Combat Profiles" },
  { schemaName: "dialogue_nodes", apiPath: "dialogue-nodes", routePath: "dialogue-nodes", label: "Dialogue Nodes" },
  { schemaName: "dialogues", apiPath: "dialogues", routePath: "dialogues", label: "Dialogues" },
  { schemaName: "encounters", apiPath: "encounters", routePath: "encounters", label: "Encounters" },
  { schemaName: "events", apiPath: "events", routePath: "events", label: "Events" },
  { schemaName: "content_packs", apiPath: "content-packs", routePath: "content-packs", label: "Content Packs" },
  { schemaName: "factions", apiPath: "factions", routePath: "factions", label: "Factions" },
  { schemaName: "flags", apiPath: "flags", routePath: "flags", label: "Flags" },
  { schemaName: "items", apiPath: "items", routePath: "items", label: "Items" },
  { schemaName: "currencies", apiPath: "currencies", routePath: "currencies", label: "Currencies" },
  { schemaName: "interaction_profiles", apiPath: "interaction_profiles", routePath: "interaction-profiles", label: "Interaction Profiles" },
  { schemaName: "location_creative_briefs", apiPath: "location_creative_briefs", routePath: "location-creative-briefs", label: "Location Creative Briefs" },
  { schemaName: "location_encounter_tables", apiPath: "location_encounter_tables", routePath: "location-encounter-tables", label: "Location Encounter Tables" },
  { schemaName: "location_pois", apiPath: "location_pois", routePath: "location-pois", label: "Location POIs" },
  { schemaName: "location_routes", apiPath: "location_routes", routePath: "location-routes", label: "Location Routes" },
  { schemaName: "locations", apiPath: "locations", routePath: "locations", label: "Locations" },
  { schemaName: "lore_entries", apiPath: "lore-entries", routePath: "lore-entries", label: "Lore Entries" },
  { schemaName: "quests", apiPath: "quests", routePath: "quests", label: "Quests" },
  { schemaName: "requirements", apiPath: "requirements", routePath: "requirements", label: "Requirements" },
  { schemaName: "shops", apiPath: "shops", routePath: "shops", label: "Shops" },
  { schemaName: "shops_inventory", apiPath: "shop-inventory", routePath: "shops-inventory", label: "Shops Inventory" },
  { schemaName: "stats", apiPath: "stats", routePath: "stats", label: "Stats" },
  { schemaName: "statuses", apiPath: "statuses", routePath: "statuses", label: "Statuses" },
  { schemaName: "story_arcs", apiPath: "story-arcs", routePath: "story-arcs", label: "Story Arcs" },
  { schemaName: "route_event_bindings", apiPath: "route_event_bindings", routePath: "route-event-bindings", label: "Route Event Bindings" },
  { schemaName: "timelines", apiPath: "timelines", routePath: "timelines", label: "Timelines" },
  { schemaName: "travel_tuning", apiPath: "travel_tuning", routePath: "travel-tuning", label: "Travel Tuning" },
  { schemaName: "talent_trees", apiPath: "talent-trees", routePath: "talent-trees", label: "Talent Trees" },
  { schemaName: "talent_nodes", apiPath: "talent-nodes", routePath: "talent-nodes", label: "Talent Nodes" },
  { schemaName: "talent_node_links", apiPath: "talent-node-links", routePath: "talent-node-links", label: "Talent Node Links" },
];

export function findDatasetBySchema(schemaName: string): EditorDatasetConfig | undefined {
  return EDITOR_DATASETS.find((dataset) => dataset.schemaName === schemaName);
}
