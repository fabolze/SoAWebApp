import SchemaEditor from "../components/SchemaEditor";
export default function LocationsEditorPage() {
  return <SchemaEditor schemaName="locations" title="Locations" apiPath="locations" idField="location_id" />;
}
