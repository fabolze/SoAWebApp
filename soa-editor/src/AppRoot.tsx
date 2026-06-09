import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { DirtyStateProvider } from "./components/DirtyStateContext";
import { EditorStackProvider } from "./components/EditorStack";
import AbilitiesEditorPage from "./pages/AbilitiesEditor";
import AttributesEditorPage from "./pages/AttributesEditor";
import CharacterClassesEditorPage from "./pages/CharacterClassesEditor";
import CharactersEditorPage from "./pages/CharactersEditor";
import CombatProfilesEditorPage from "./pages/CombatProfilesEditor";
import ContentPacksEditorPage from "./pages/ContentPacksEditor";
import CurrenciesEditorPage from "./pages/CurrenciesEditor";
import DialogueNodesEditorPage from "./pages/DialogueNodesEditor";
import DialoguesEditorPage from "./pages/DialoguesEditor";
import EffectsEditorPage from "./pages/EffectsEditor";
import EncountersEditorPage from "./pages/EncountersEditor";
import EventsEditorPage from "./pages/EventsEditor";
import FactionsEditorPage from "./pages/FactionsEditor";
import FlagsEditorPage from "./pages/FlagsEditor";
import IndexPageEditorPage from "./pages/IndexPageEditor";
import InteractionProfilesEditorPage from "./pages/InteractionProfilesEditor";
import ItemsEditorPage from "./pages/ItemsEditor";
import LocationCreativeBriefsEditorPage from "./pages/LocationCreativeBriefsEditor";
import LocationEncounterTablesEditorPage from "./pages/LocationEncounterTablesEditor";
import LocationPoisEditorPage from "./pages/LocationPoisEditor";
import LocationRoutesEditorPage from "./pages/LocationRoutesEditor";
import LocationsEditorPage from "./pages/LocationsEditor";
import LoreEntriesEditorPage from "./pages/LoreEntriesEditor";
import QuestsEditorPage from "./pages/QuestsEditor";
import RequirementsEditorPage from "./pages/RequirementsEditor";
import RouteEventBindingsEditorPage from "./pages/RouteEventBindingsEditor";
import SettingsPage from "./pages/SettingsPage";
import ShopsEditorPage from "./pages/ShopsEditor";
import ShopsInventoryEditorPage from "./pages/ShopsInventoryEditor";
import StatsEditorPage from "./pages/StatsEditor";
import StatusesEditorPage from "./pages/StatusesEditor";
import StoryArcsEditorPage from "./pages/StoryArcsEditor";
import TalentNodeLinksEditorPage from "./pages/TalentNodeLinksEditor";
import TalentNodesEditorPage from "./pages/TalentNodesEditor";
import TalentTreesEditorPage from "./pages/TalentTreesEditor";
import TimelinesEditorPage from "./pages/TimelinesEditor";
import TravelTuningEditorPage from "./pages/TravelTuningEditor";

const ItemInspectorPage = lazy(() => import("./pages/ItemInspectorPage"));
const SimulationSandboxPage = lazy(() => import("./pages/SimulationSandboxPage"));
const WorldBuilderPage = lazy(() => import("./pages/WorldBuilderPage"));
const DialogueFlowPage = lazy(() => import("./pages/DialogueFlowPage"));
const CharacterAuthoringPage = lazy(() => import("./authoringViews/CharacterCreatorPage"));
const ItemAuthoringPage = lazy(() => import("./authoringViews/ImmersiveAuthoringPage").then((module) => ({ default: module.ItemAuthoringPage })));
const LocationAuthoringPage = lazy(() => import("./authoringViews/ImmersiveAuthoringPage").then((module) => ({ default: module.LocationAuthoringPage })));
const LocationMapAuthoringPage = lazy(() => import("./authoringViews/ImmersiveAuthoringPage").then((module) => ({ default: module.LocationMapAuthoringPage })));
const ShopAuthoringPage = lazy(() => import("./authoringViews/ImmersiveAuthoringPage").then((module) => ({ default: module.ShopAuthoringPage })));

const SIDEBAR_COLLAPSED_KEY = "soa.sidebar.collapsed";

function getInitialSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
}

export default function AppRoot() {
  const [collapsed, setCollapsed] = useState(getInitialSidebarCollapsed);

  const handleToggleCollapse = () => {
    setCollapsed((prev) => !prev);
  };

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <DirtyStateProvider>
      <EditorStackProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="p-6 text-sm text-slate-600 dark:text-slate-300">Loading workspace...</div>}>
          <Routes>
            <Route
              path="/"
              element={<Layout collapsed={collapsed} onToggleCollapse={handleToggleCollapse} />}
            >
              <Route index element={<IndexPageEditorPage />} />
              <Route path="abilities" element={<AbilitiesEditorPage />} />
              <Route path="attributes" element={<AttributesEditorPage />} />
              <Route path="effects" element={<EffectsEditorPage />} />
              <Route path="characterclasses" element={<CharacterClassesEditorPage />} />
              <Route path="characters" element={<CharactersEditorPage />} />
              <Route path="combat-profiles" element={<CombatProfilesEditorPage />} />
              <Route path="dialogue-nodes" element={<DialogueNodesEditorPage />} />
              <Route path="dialogues" element={<DialoguesEditorPage />} />
              <Route path="encounters" element={<EncountersEditorPage />} />
              <Route path="events" element={<EventsEditorPage />} />
              <Route path="content-packs" element={<ContentPacksEditorPage />} />
              <Route path="factions" element={<FactionsEditorPage />} />
              <Route path="flags" element={<FlagsEditorPage />} />
              <Route path="items" element={<ItemsEditorPage />} />
              <Route path="inspect/items/:id" element={<ItemInspectorPage />} />
              <Route path="author/items/new" element={<ItemAuthoringPage />} />
              <Route path="author/items/:id" element={<ItemAuthoringPage />} />
              <Route path="author/shops/new" element={<ShopAuthoringPage />} />
              <Route path="author/shops/:id" element={<ShopAuthoringPage />} />
              <Route path="author/characters/new" element={<CharacterAuthoringPage />} />
              <Route path="author/characters/:id" element={<CharacterAuthoringPage />} />
              <Route path="author/locations/new" element={<LocationAuthoringPage />} />
              <Route path="author/locations/map" element={<LocationMapAuthoringPage />} />
              <Route path="author/locations/:id" element={<LocationAuthoringPage />} />
              <Route path="author/world" element={<WorldBuilderPage />} />
              <Route path="author/dialogues" element={<DialogueFlowPage />} />
              <Route path="author/dialogues/new" element={<DialogueFlowPage />} />
              <Route path="author/dialogues/:id" element={<DialogueFlowPage />} />
              <Route path="currencies" element={<CurrenciesEditorPage />} />
              <Route path="interaction-profiles" element={<InteractionProfilesEditorPage />} />
              <Route path="location-creative-briefs" element={<LocationCreativeBriefsEditorPage />} />
              <Route path="location-encounter-tables" element={<LocationEncounterTablesEditorPage />} />
              <Route path="location-pois" element={<LocationPoisEditorPage />} />
              <Route path="location-routes" element={<LocationRoutesEditorPage />} />
              <Route path="locations" element={<LocationsEditorPage />} />
              <Route path="lore-entries" element={<LoreEntriesEditorPage />} />
              <Route path="quests" element={<QuestsEditorPage />} />
              <Route path="requirements" element={<RequirementsEditorPage />} />
              <Route path="route-event-bindings" element={<RouteEventBindingsEditorPage />} />
              <Route path="shops" element={<ShopsEditorPage />} />
              <Route path="shops-inventory" element={<ShopsInventoryEditorPage />} />
              <Route path="stats" element={<StatsEditorPage />} />
              <Route path="statuses" element={<StatusesEditorPage />} />
              <Route path="story-arcs" element={<StoryArcsEditorPage />} />
              <Route path="timelines" element={<TimelinesEditorPage />} />
              <Route path="travel-tuning" element={<TravelTuningEditorPage />} />
              <Route path="talent-trees" element={<TalentTreesEditorPage />} />
              <Route path="talent-nodes" element={<TalentNodesEditorPage />} />
              <Route path="talent-node-links" element={<TalentNodeLinksEditorPage />} />
              <Route path="simulation" element={<SimulationSandboxPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
          </Suspense>
        </BrowserRouter>
      </EditorStackProvider>
    </DirtyStateProvider>
  );
}
