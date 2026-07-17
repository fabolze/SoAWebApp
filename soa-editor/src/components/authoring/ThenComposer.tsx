import type { CreationFlowOrigin, CreationFlowRef } from "../../authoring/creationFlow";
import CreationFlowCapture from "./CreationFlowCapture";

export default function ThenComposer({ title, origin, returnFrame }: { title: string; origin: CreationFlowOrigin; returnFrame?: { workspace: string; context?: CreationFlowRef; selectedId?: string; localViewState?: Record<string, unknown> } }) {
  return <CreationFlowCapture variant="then" title={title} origin={origin} shape="sequence" returnFrame={returnFrame} />;
}
