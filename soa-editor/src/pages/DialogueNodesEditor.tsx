import SchemaEditor from "../components/SchemaEditor";
export default function DialogueNodesEditorPage() {
  return <SchemaEditor schemaName="dialogue_nodes" title="Dialogue Nodes" apiPath="dialogue_nodes" idField="node_id" />;
}
