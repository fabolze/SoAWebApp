import { useState } from "react";
import ThenComposer from "../components/authoring/ThenComposer";
import SchemaEditor from "../components/SchemaEditor";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
export default function EventsEditorPage() {
  const [flow, setFlow] = useState<{ id: string; label: string } | null>(null);
  return <><SchemaEditor schemaName="events" title="Events" apiPath="events" renderSelectedAccessory={({ data, persisted, label }) => {
    const id = typeof data.id === "string" ? data.id : "";
    return <div className="mx-1 flex items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm dark:border-violet-900 dark:bg-violet-950"><div><b>Event outcome</b><p className="text-xs text-slate-600 dark:text-slate-300">Capture and compile what follows this saved event.</p></div><button type="button" className={`${BUTTON_CLASSES.violet} ${BUTTON_SIZES.sm}`} disabled={!persisted || !id} onClick={() => setFlow({ id, label })}>On completion, then…</button></div>;
  }} />{flow && <ThenComposer open mode="then" origin={{ ref: { kind: "event", canonicalId: flow.id, label: flow.label } }} originLabel={flow.label} returnFrame={{ workspace: "events", context: { kind: "event", canonicalId: flow.id, label: flow.label }, selectedId: flow.id, localViewState: { outcome: "complete" } }} onClose={() => setFlow(null)} />}</>;
}
