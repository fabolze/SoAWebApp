import SchemaEditor from "../components/SchemaEditor";

export default function EffectEditorPage() {
  return (
    <SchemaEditor
      schemaName="effects"
      title="Effect Editor"
      apiPath="effects"
      idField="effect_id"
    />
  );
}
