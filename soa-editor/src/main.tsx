// soa-editor/src/main.tsx
// This file is responsible for rendering the main application and setting up routing.
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AbilitiesEditorPage from "./pages/AbilitiesEditor";
import EffectsEditorPage from "./pages/EffectsEditor";
import AttributesEditorPage from "./pages/AttributesEditor";
import CharacterClassesEditorPage from "./pages/CharacterClassesEditor";
import DialogueNodesEditorPage from "./pages/DialogueNodesEditor";
import DialoguesEditorPage from "./pages/DialoguesEditor";
import EncountersEditorPage from "./pages/EncountersEditor";
import EnemiesEditorPage from "./pages/EnemiesEditor";
import EventsEditorPage from "./pages/EventsEditor";
import FactionsEditorPage from "./pages/FactionsEditor";
import FlagsEditorPage from "./pages/FlagsEditor";
import IndexPageEditorPage from "./pages/IndexPageEditor";
import ItemsEditorPage from "./pages/ItemsEditor";
import LocationsEditorPage from "./pages/LocationsEditor";
import LoreEntriesEditorPage from "./pages/LoreEntriesEditor";
import NpcsEditorPage from "./pages/NpcsEditor";
import QuestsEditorPage from "./pages/QuestsEditor";
import RequirementsEditorPage from "./pages/RequirementsEditor";
import ShopsEditorPage from "./pages/ShopsEditor";
import ShopsInventoryEditorPage from "./pages/ShopsInventoryEditor";
import StatsEditorPage from "./pages/StatsEditor";
import StoryArcsEditorPage from "./pages/StoryArcsEditor";
import TimelinesEditorPage from "./pages/TimelinesEditor";
import './App.css';

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<IndexPageEditorPage />} />
        <Route path="/abilities" element={<AbilitiesEditorPage />} />
        <Route path="/attributes" element={<AttributesEditorPage />} />
        <Route path="/effects" element={<EffectsEditorPage />} />
        <Route path="/characterclasses" element={<CharacterClassesEditorPage />} />
        <Route path="/dialogue-nodes" element={<DialogueNodesEditorPage />} />
        <Route path="/dialogues" element={<DialoguesEditorPage />} />
        <Route path="/encounters" element={<EncountersEditorPage />} />
        <Route path="/enemies" element={<EnemiesEditorPage />} />
        <Route path="/events" element={<EventsEditorPage />} />
        <Route path="/factions" element={<FactionsEditorPage />} />
        <Route path="/flags" element={<FlagsEditorPage />} />
        <Route path="/items" element={<ItemsEditorPage />} />
        <Route path="/locations" element={<LocationsEditorPage />} />
        <Route path="/lore-entries" element={<LoreEntriesEditorPage />} />
        <Route path="/npcs" element={<NpcsEditorPage />} />
        <Route path="/quests" element={<QuestsEditorPage />} />
        <Route path="/requirements" element={<RequirementsEditorPage />} />
        <Route path="/shops" element={<ShopsEditorPage />} />
        <Route path="/shops-inventory" element={<ShopsInventoryEditorPage />} />
        <Route path="/stats" element={<StatsEditorPage />} />
        <Route path="/story-arcs" element={<StoryArcsEditorPage />} />
        <Route path="/timelines" element={<TimelinesEditorPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
