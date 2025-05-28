import SchemaEditor from "../components/SchemaEditor";
export default function EnemiesEditorPage() {
  return <SchemaEditor schemaName="enemies" title="Enemies" apiPath="enemies" idField="enemy_id" />;
}
