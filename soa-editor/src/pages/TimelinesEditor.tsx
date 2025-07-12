import SchemaEditor from "../components/SchemaEditor";
export default function TimelinesEditorPage() {
  return <SchemaEditor schemaName="timelines" title="Timelines" apiPath="timelines" idField="timeline_id" />;
}
