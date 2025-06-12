import SchemaForm from "./SchemaForm";

interface EntryFormPanelProps {
  schema: any;
  data: any;
  onChange: (updated: any) => void;
  onSave: () => void;
  onCancel: () => void;
  formHeader: string;
  formValid: boolean;
  setFormValid: (valid: boolean) => void;
  isNew: boolean;
  referenceOptionsVersion: number;
}

const EntryFormPanel = ({
  schema,
  data,
  onChange,
  onSave,
  onCancel,
  formHeader,
  formValid,
  setFormValid,
  isNew,
  referenceOptionsVersion,
}: EntryFormPanelProps) => (
  <div className="flex-1 min-w-0 flex flex-col h-full max-h-full overflow-hidden bg-white p-6">
    <div className="sticky top-0 z-10 bg-white p-4 border-b">
      <h1 className="text-xl font-bold mb-2">{formHeader}</h1>
      {!isNew && data?.id && (
        <span className="ml-2 text-blue-700 font-semibold">Editing: {data.id}</span>
      )}
    </div>
    <div className="flex-1 overflow-y-auto min-h-0 p-4">
      <SchemaForm
        schema={schema}
        data={data}
        onChange={onChange}
        referenceOptions={undefined}
        fetchReferenceOptions={undefined}
        isValidCallback={setFormValid}
        key={referenceOptionsVersion}
      />
      <div className="flex gap-2 mt-4">
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onSave}
          disabled={!formValid}
        >
          💾 Save
        </button>
        {!isNew && (
          <button
            className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  </div>
);

export default EntryFormPanel;
