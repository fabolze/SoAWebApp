import SchemaEditor from "../components/SchemaEditor";
export default function EncountersEditorPage() {
  return <SchemaEditor schemaName="encounters" title="Encounters" apiPath="encounters" idField="encounter_id" />;
}
