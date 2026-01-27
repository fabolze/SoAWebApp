import SchemaEditor from "../components/SchemaEditor";

export default function StatusesEditorPage() {
  return (
    <SchemaEditor
      schemaName="statuses"
      title="Statuses Editor"
      apiPath="statuses"
    />
  );
}
