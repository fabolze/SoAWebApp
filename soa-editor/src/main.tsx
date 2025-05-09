import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AbilitiesEditor from "./pages/AbilitiesEditor";
import EffectEditorPage from "./pages/EffectsEditor"; // import your new page

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AbilitiesEditor />} />
        <Route path="/effects" element={<EffectEditorPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
