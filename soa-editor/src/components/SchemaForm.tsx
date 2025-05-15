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

  const renderFieldLabel = (label: string, description?: string) => (
    <div className="mb-1">
      <span className="font-medium text-gray-800">{label}</span>
      {description && (
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      )}
    </div>
  );

  const inputBaseClass = "w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 bg-white text-gray-800 transition-all duration-200 ease-in-out focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none hover:border-gray-400";

  return (
    <form className="space-y-6 bg-white rounded-lg shadow-sm p-6">
      {fields.map(([key, config]) => {
        const type = config.type;
        const ui = config.ui || {};
        const label = ui.label || key;
        const description = ui.description;
        const value = data[key];

        if (type === 'string' && ui.widget === 'select') {
          return (
            <div key={key} className="form-field">
              {renderFieldLabel(label, description)}
              <select
                className={inputBaseClass}
                value={value || ''}
                onChange={(e) => handleChange(key, e.target.value)}
              >
                <option value="">Select {label}</option>
                {ui.options?.map((opt: string) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          );
        }

        if (type === 'string' && ui.widget === 'textarea') {
          return (
            <div key={key} className="form-field">
              {renderFieldLabel(label, description)}
              <textarea
                className={`${inputBaseClass} resize-y min-h-[100px] max-h-[300px]`}
                value={value || ''}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={`Enter ${label.toLowerCase()}...`}
              />
            </div>
          );
        }

        if (type === 'string' && ui.reference) {
          const mockOptions = ['attr_strength', 'attr_dexterity', 'attr_intelligence'];
          return (
            <div key={key} className="form-field">
              {renderFieldLabel(label, description)}
              <div className="relative">
                <select
                  className={inputBaseClass}
                  value={value || ''}
                  onChange={(e) => handleChange(key, e.target.value)}
                >
                  <option value="">Select {label}</option>
                  {mockOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          );
        }

        if (type === 'string') {
          return (
            <div key={key} className="form-field">
              {renderFieldLabel(label, description)}
              <input
                type="text"
                className={inputBaseClass}
                value={value || ''}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={`Enter ${label.toLowerCase()}...`}
              />
            </div>
          );
        }

        if (type === 'number') {
          return (
            <div key={key} className="form-field">
              {renderFieldLabel(label, description)}
              <input
                type="number"
                className={inputBaseClass}
                value={value || ''}
                onChange={(e) => handleChange(key, parseFloat(e.target.value))}
                placeholder={`Enter ${label.toLowerCase()}...`}
              />
            </div>
          );
        }

        if (type === 'array' && config.items?.type === 'string' && ui.widget === 'multiselect') {
          const options = ui.options || ['effect1', 'effect2', 'effect3'];
          return (
            <div key={key} className="form-field">
              {renderFieldLabel(label, description)}
              <div className="border border-gray-300 rounded-md p-2 bg-white">
                <div className="flex flex-wrap gap-2 mb-2">
                  {(value || []).map((selected: string) => (
                    <span 
                      key={selected} 
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                    >
                      {selected}
                      <button
                        type="button"
                        onClick={() => handleChange(key, value.filter((v: string) => v !== selected))}
                        className="ml-1 inline-flex text-blue-600 hover:text-blue-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <select
                  multiple
                  className={`${inputBaseClass} min-h-[100px]`}
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
              </div>
            </div>
          );
        }

        if (type === 'object') {
          const nestedProps = config.properties || {};
          return (
            <fieldset key={key} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              {renderFieldLabel(label, description)}
              <div className="mt-3">
                <SchemaForm
                  schema={{ properties: nestedProps }}
                  data={value || {}}
                  onChange={(val) => handleChange(key, val)}
                />
              </div>
            </fieldset>
          );
        }

        if (type === 'array' && config.items?.type === 'object') {
          return (
            <fieldset key={key} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              {renderFieldLabel(label, description)}
              <div className="space-y-4">
                {(value || []).map((item: any, idx: number) => (
                  <div key={idx} className="relative p-4 border border-gray-200 rounded-lg bg-white">
                    <button
                      type="button"
                      onClick={() => {
                        const newArr = [...value];
                        newArr.splice(idx, 1);
                        handleChange(key, newArr);
                      }}
                      className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                    >
                      ×
                    </button>
                    <SchemaForm
                      schema={config.items}
                      data={item}
                      onChange={(updatedItem) => {
                        const newArr = [...value];
                        newArr[idx] = updatedItem;
                        handleChange(key, newArr);
                      }}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  onClick={() => handleChange(key, [...(value || []), {}])}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add {label.slice(0, -1)}
                </button>
              </div>
            </fieldset>
          );
        }

        return null;
      })}
    </form>
  );
}
