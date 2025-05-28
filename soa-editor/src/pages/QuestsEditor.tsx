import SchemaEditor from "../components/SchemaEditor";
export default function QuestsEditorPage() {
  return <SchemaEditor schemaName="quests" title="Quests" apiPath="quests" idField="quest_id" />;
}
