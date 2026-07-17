import { useState } from "react";
import ThenComposer from "../components/authoring/ThenComposer";
import SchemaEditor from "../components/SchemaEditor";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";

export default function LocationPoisEditorPage() {
  const [flow, setFlow] = useState<{ id: string; label: string } | null>(null);
  return <><SchemaEditor schemaName="location_pois" title="Location POIs" apiPath="location_pois" renderSelectedAccessory={({ data, persisted, label }) => {
    const id = typeof data.id === "string" ? data.id : "";
    return <div className="mx-1 flex items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm dark:border-violet-900 dark:bg-violet-950"><div><b>POI interaction</b><p className="text-xs text-slate-600 dark:text-slate-300">Capture what happens after the player uses this saved interactable.</p></div><button type="button" className={`${BUTTON_CLASSES.violet} ${BUTTON_SIZES.sm}`} disabled={!persisted || !id} onClick={() => setFlow({ id, label })}>On interaction, then…</button></div>;
  }} />{flow && <ThenComposer open mode="then" origin={{ ref: { kind: "location_poi", canonicalId: flow.id, label: flow.label } }} originLabel={flow.label} returnFrame={{ workspace: "location-pois", context: { kind: "location_poi", canonicalId: flow.id, label: flow.label }, selectedId: flow.id, localViewState: { outcome: "interaction_closed" } }} onClose={() => setFlow(null)} />}</>;
}
