// soa-editor/src/main.tsx
// This file is responsible for rendering the main application and setting up routing.
import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AbilitiesEditorPage from "./pages/AbilitiesEditor";
import EffectsEditorPage from "./pages/EffectsEditor";
import AttributesEditorPage from "./pages/AttributesEditor";
import CharacterClassesEditorPage from "./pages/CharacterClassesEditor";
import CharactersEditorPage from "./pages/CharactersEditor";
import CombatProfilesEditorPage from "./pages/CombatProfilesEditor";
import DialogueNodesEditorPage from "./pages/DialogueNodesEditor";
import DialoguesEditorPage from "./pages/DialoguesEditor";
import EncountersEditorPage from "./pages/EncountersEditor";
import EventsEditorPage from "./pages/EventsEditor";
import ContentPacksEditorPage from "./pages/ContentPacksEditor";
import FactionsEditorPage from "./pages/FactionsEditor";
import FlagsEditorPage from "./pages/FlagsEditor";
import IndexPageEditorPage from "./pages/IndexPageEditor";
import ItemsEditorPage from "./pages/ItemsEditor";
import CurrenciesEditorPage from "./pages/CurrenciesEditor";
import InteractionProfilesEditorPage from "./pages/InteractionProfilesEditor";
import LocationsEditorPage from "./pages/LocationsEditor";
import LoreEntriesEditorPage from "./pages/LoreEntriesEditor";
import QuestsEditorPage from "./pages/QuestsEditor";
import RequirementsEditorPage from "./pages/RequirementsEditor";
import ShopsEditorPage from "./pages/ShopsEditor";
import ShopsInventoryEditorPage from "./pages/ShopsInventoryEditor";
import StatsEditorPage from "./pages/StatsEditor";
import StoryArcsEditorPage from "./pages/StoryArcsEditor";
import TimelinesEditorPage from "./pages/TimelinesEditor";
import StatusesEditorPage from "./pages/StatusesEditor";
import TalentTreesEditorPage from "./pages/TalentTreesEditor";
import TalentNodesEditorPage from "./pages/TalentNodesEditor";
import TalentNodeLinksEditorPage from "./pages/TalentNodeLinksEditor";
import './index.css';
import './App.css';
import Layout from './components/Layout';
import SettingsPage from "./pages/SettingsPage";
import { EditorStackProvider } from "./components/EditorStack";
import SimulationSandboxPage from "./pages/SimulationSandboxPage";

const MainApp = () => {
  const [collapsed, setCollapsed] = useState(false);

  const handleToggleCollapse = () => {
    setCollapsed((prev) => !prev);
  };

  return (
    <React.StrictMode>
      <EditorStackProvider>
        <BrowserRouter>
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
              <Route path="currencies" element={<CurrenciesEditorPage />} />
              <Route path="interaction-profiles" element={<InteractionProfilesEditorPage />} />
              <Route path="locations" element={<LocationsEditorPage />} />
              <Route path="lore-entries" element={<LoreEntriesEditorPage />} />
              <Route path="quests" element={<QuestsEditorPage />} />
              <Route path="requirements" element={<RequirementsEditorPage />} />
              <Route path="shops" element={<ShopsEditorPage />} />
              <Route path="shops-inventory" element={<ShopsInventoryEditorPage />} />
              <Route path="stats" element={<StatsEditorPage />} />
              <Route path="statuses" element={<StatusesEditorPage />} />
              <Route path="story-arcs" element={<StoryArcsEditorPage />} />
              <Route path="timelines" element={<TimelinesEditorPage />} />
              <Route path="talent-trees" element={<TalentTreesEditorPage />} />
              <Route path="talent-nodes" element={<TalentNodesEditorPage />} />
              <Route path="talent-node-links" element={<TalentNodeLinksEditorPage />} />
              <Route path="simulation" element={<SimulationSandboxPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </EditorStackProvider>
    </React.StrictMode>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<MainApp />);



