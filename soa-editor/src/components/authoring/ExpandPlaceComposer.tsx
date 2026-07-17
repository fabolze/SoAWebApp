import type { CreationFlowOrigin, CreationFlowRef } from "../../authoring/creationFlow";
import CreationFlowCapture, { ContinueWhereStopped } from "./CreationFlowCapture";

export default function ExpandPlaceComposer({ title, origin, context, returnFrame }: { title: string; origin: CreationFlowOrigin; context: CreationFlowRef; returnFrame?: { workspace: string; context?: CreationFlowRef; selectedId?: string; localViewState?: Record<string, unknown> } }) {
  return <div className="space-y-3"><ContinueWhereStopped context={context} /><CreationFlowCapture variant="expand" title={title} origin={origin} shape="hybrid" returnFrame={returnFrame} /></div>;
}
