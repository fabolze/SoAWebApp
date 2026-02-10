// soa-editor/src/main.tsx
// Entry point for rendering the app root.
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import AppRoot from "./AppRoot";
import "./index.css";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>
);
