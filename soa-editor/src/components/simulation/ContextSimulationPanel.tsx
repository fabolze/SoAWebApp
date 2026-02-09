import SimulationWorkbench from "./SimulationWorkbench";
import { isSimulationSchemaName } from "../../simulation";

interface ContextSimulationPanelProps {
  schemaName: string;
  data: Record<string, unknown>;
}

export default function ContextSimulationPanel({
  schemaName,
  data,
}: ContextSimulationPanelProps) {
  if (!isSimulationSchemaName(schemaName)) return null;
  return (
    <SimulationWorkbench
      fixedSchemaName={schemaName}
      draftEntity={data}
      compact
      title="Quick Simulation"
    />
  );
}
