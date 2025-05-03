// src/components/SchemaForm.tsx


interface SchemaFormProps {
  schema: any;
  data: any;
  onChange: (updated: any) => void;
}

export default function SchemaForm({ schema, data, onChange }: SchemaFormProps) {
    const fields = Object.entries(schema.properties || {}) as [string, any][];


  const handleChange = (key: string, value: any) => {
    onChange({ ...data, [key]: value });
  };

  return (
    <form className="grid gap-4">
      {fields.map(([key, config]) => {
        const type = config.type;
        const ui = config.ui || {};
        const label = ui.label || key;

        if (type === 'string' && ui.widget === 'select') {
          return (
            <label key={key} className="flex flex-col">
              <span className="mb-1">{label}</span>
              <select
                className="border p-2 rounded"
                value={data[key] || ''}
                onChange={(e) => handleChange(key, e.target.value)}
              >
                <option value="">Select</option>
                {ui.options?.map((opt: string) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
          );
        }

        if (type === 'number') {
          return (
            <label key={key} className="flex flex-col">
              <span className="mb-1">{label}</span>
              <input
                type="number"
                className="border p-2 rounded"
                value={data[key] || ''}
                onChange={(e) => handleChange(key, parseFloat(e.target.value))}
              />
            </label>
          );
        }

        if (type === 'string') {
          return (
            <label key={key} className="flex flex-col">
              <span className="mb-1">{label}</span>
              <input
                type="text"
                className="border p-2 rounded"
                value={data[key] || ''}
                onChange={(e) => handleChange(key, e.target.value)}
              />
            </label>
          );
        }

        return null;
      })}
    </form>
  );
}
