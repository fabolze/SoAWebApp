import { useEffect, useState, useCallback } from 'react';
import { generateId } from '../utils/generateId';

interface SchemaFormProps {
  schema: any;
  data: any;
  onChange: (updated: any) => void;
  referenceOptions?: Record<string, any[]>;
  fetchReferenceOptions?: (refType: string) => void;
  isValidCallback?: (valid: boolean) => void;
}

export default function SchemaForm({ schema, data, onChange, referenceOptions: parentReferenceOptions, fetchReferenceOptions: parentFetchReferenceOptions, isValidCallback }: SchemaFormProps) {
  const fields = Object.entries(schema.properties || {}) as [string, any][];

  // Determine the id field name (e.g. class_id, npc_id, etc.)
  const idField = Object.keys(schema.properties || {}).find(
    (k) => k.endsWith('_id') || k === 'id'
  );
  // Try to infer the type from the schema title or idField
  const type = (schema.title || idField?.replace(/_id$/, '') || 'entity').toLowerCase();

  // --- Reference dropdowns state ---
  const [referenceOptions, setReferenceOptions] = useState<Record<string, any>>(parentReferenceOptions || {});

  // Fetch reference options, but only if not provided by parent
  const fetchReferenceOptions = useCallback((refType: string) => {
    if (parentFetchReferenceOptions) {
      parentFetchReferenceOptions(refType);
      return;
    }
    if (!referenceOptions[refType]) {
      fetch(`http://localhost:5000/api/${refType}`)
        .then((res) => res.json())
        .then((list) => {
          setReferenceOptions((prev) => ({ ...prev, [refType]: list }));
        })
        .catch(() => {
          setReferenceOptions((prev) => ({ ...prev, [refType]: [] }));
        });
    }
  }, [parentFetchReferenceOptions, referenceOptions]);

  useEffect(() => {
    // For each field with ui.reference, fetch options from backend
    const refs = fields.filter(([_, config]) => config.ui && config.ui.reference);
    refs.forEach(([, config]) => {
      const refType = config.ui.reference;
      fetchReferenceOptions(refType);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  // --- Required fields validation ---
  const requiredFields: string[] = schema.required || [];
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const missingFields = requiredFields.filter((key) => {
    // For nested/array fields, skip here (handled in subforms)
    const config = schema.properties?.[key];
    if (!config) return false;
    if (config.type === 'array' || config.type === 'object') return false;
    return !data[key] && data[key] !== 0;
  });
  const isValid = missingFields.length === 0;
  useEffect(() => {
    if (typeof isValidCallback === 'function') isValidCallback(isValid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid]);

  // Auto-generate ID if name changes and id is empty
  const handleChange = (key: string, value: any) => {
    setTouched((prev) => ({ ...prev, [key]: true }));
    let updated = { ...data, [key]: value };
    if (idField && key === 'name' && (!data[idField] || data[idField].startsWith('id_'))) {
      updated[idField] = generateId(type, value);
    }
    onChange(updated);
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
      {missingFields.length > 0 && (
        <div className="mb-4 p-2 bg-red-100 text-red-700 rounded border border-red-300">
          Please fill all required fields: {missingFields.join(', ')}
        </div>
      )}
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
          const refType = ui.reference;
          const options = (parentReferenceOptions || referenceOptions)[refType] || [];
          return (
            <div key={key} className="form-field">
              {renderFieldLabel(label, description)}
              <div className="relative">
                <select
                  className={inputBaseClass}
                  value={value || ''}
                  onChange={(e) => handleChange(key, e.target.value)}
                  disabled={options.length === 0}
                >
                  <option value="">{options.length === 0 ? 'No options available' : `Select ${label}`}</option>
                  {(options as any[]).map((opt: any) => {
                    // Try to show a human-friendly label
                    const display = opt.name || opt.title || opt.id || opt[`${refType.slice(0, -1)}_id`] || opt[`${refType}_id`] || JSON.stringify(opt);
                    const val = opt.id || opt[`${refType.slice(0, -1)}_id`] || opt[`${refType}_id`] || opt;
                    return (
                      <option key={val} value={val}>{display}</option>
                    );
                  })}
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

        if (type === 'string' && (key === idField)) {
          // Render the ID field as read-only and greyed out
          return (
            <div key={key} className="form-field">
              {renderFieldLabel(label, description)}
              <input
                type="text"
                className={inputBaseClass + ' bg-gray-100 text-gray-500 cursor-not-allowed'}
                value={value || ''}
                readOnly
                tabIndex={-1}
                style={{ pointerEvents: 'none' }}
              />
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
          // If this is a reference multiselect, use referenceOptions
          let options: string[] = [];
          if (ui.reference) {
            const refType = ui.reference;
            const refList = (parentReferenceOptions || referenceOptions)[refType] || [];
            options = (refList as any[]).map((opt: any) =>
              opt.id || opt[`${refType.slice(0, -1)}_id`] || opt[`${refType}_id`] || opt
            );
          } else if (ui.options) {
            options = ui.options;
          }
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
                  disabled={options.length === 0}
                >
                  {options.length === 0 ? (
                    <option value="">No options available</option>
                  ) : (
                    options.map((opt: string) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))
                  )}
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
                  referenceOptions={parentReferenceOptions || referenceOptions}
                  fetchReferenceOptions={fetchReferenceOptions}
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
                      referenceOptions={parentReferenceOptions || referenceOptions}
                      fetchReferenceOptions={fetchReferenceOptions}
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
