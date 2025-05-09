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
        const value = data[key];

        if (type === 'string' && ui.widget === 'select') {
          return (
            <label key={key} className="flex flex-col">
              <span className="mb-1">{label}</span>
              <select
                className="border p-2 rounded"
                value={value || ''}
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

        if (type === 'string' && ui.widget === 'textarea') {
          return (
            <label key={key} className="flex flex-col">
              <span className="mb-1">{label}</span>
              <textarea
                className="border p-2 rounded"
                value={value || ''}
                onChange={(e) => handleChange(key, e.target.value)}
              />
            </label>
          );
        }

        if (type === 'string' && ui.reference) {
          const mockOptions = ['attr_strength', 'attr_dexterity', 'attr_intelligence']; // mock for reference field
          return (
            <label key={key} className="flex flex-col">
              <span className="mb-1">{label}</span>
              <select
                className="border p-2 rounded"
                value={value || ''}
                onChange={(e) => handleChange(key, e.target.value)}
              >
                <option value="">Select</option>
                {mockOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
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
                value={value || ''}
                onChange={(e) => handleChange(key, e.target.value)}
              />
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
                value={value || ''}
                onChange={(e) => handleChange(key, parseFloat(e.target.value))}
              />
            </label>
          );
        }

        if (type === 'array' && config.items?.type === 'string' && ui.widget === 'multiselect') {
          const options = ui.options || ['effect1', 'effect2', 'effect3']; // mock reference
          return (
            <label key={key} className="flex flex-col">
              <span className="mb-1">{label}</span>
              <select
                multiple
                className="border p-2 rounded"
                value={value || []}
                onChange={(e) =>
                  handleChange(
                    key,
                    Array.from(e.target.selectedOptions, (opt) => opt.value)
                  )
                }
              >
                {options.map((opt: string) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
          );
        }

        if (type === 'object') {
          const nestedProps = config.properties || {};
          return (
            <fieldset key={key} className="border p-3 rounded">
              <legend className="font-semibold mb-2">{label}</legend>
              <SchemaForm
                schema={{ properties: nestedProps }}
                data={value || {}}
                onChange={(val) => handleChange(key, val)}
              />
            </fieldset>
          );
        }

        if (type === 'array' && config.items?.type === 'object') {
          return (
            <fieldset key={key} className="border p-3 rounded">
              <legend className="font-semibold mb-2">{label}</legend>
              {(value || []).map((item: any, idx: number) => (
                <SchemaForm
                  key={idx}
                  schema={config.items}
                  data={item}
                  onChange={(updatedItem) => {
                    const newArr = [...value];
                    newArr[idx] = updatedItem;
                    handleChange(key, newArr);
                  }}
                />
              ))}
              <button
                type="button"
                className="mt-2 text-sm text-blue-500 hover:underline"
                onClick={() => handleChange(key, [...(value || []), {}])}
              >
                ➕ Add {label.slice(0, -1)}
              </button>
            </fieldset>
          );
        }

        return null;
      })}
    </form>
  );
}
