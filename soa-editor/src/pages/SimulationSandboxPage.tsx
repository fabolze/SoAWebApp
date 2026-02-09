import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import SimulationWorkbench from "../components/simulation/SimulationWorkbench";
import { isSimulationSchemaName, type SimulationSchemaName } from "../simulation";

export default function SimulationSandboxPage() {
  const [params] = useSearchParams();
  const schemaParam = params.get("schema") || "";
  const idParam = params.get("id") || "";

  const initialSchema = useMemo<SimulationSchemaName | undefined>(() => {
    return isSimulationSchemaName(schemaParam) ? schemaParam : undefined;
  }, [schemaParam]);

  return (
    <div className="p-6">
      <SimulationWorkbench
        initialSchemaName={initialSchema}
        initialEntityId={idParam || undefined}
        title="Simulation Sandbox"
      />
    </div>
  );
}
