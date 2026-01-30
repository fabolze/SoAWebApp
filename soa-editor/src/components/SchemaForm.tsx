import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { generateSlug } from '../utils/generateId';
import TagInput from './TagInput';
import { useEditorStack, ParentSummary } from './EditorStackContext';
import SearchableSelect from './SearchableSelect';
import ArrayStringMultiSelectField from './SchemaFields/ArrayStringMultiSelectField';
import ReferenceSelectField from './SchemaFields/ReferenceSelectField';

interface SchemaFormProps {
  schema: any;
  data: any;
  onChange: (updated: any) => void;
  referenceOptions?: Record<string, any[]>;
  fetchReferenceOptions?: (refType: string) => void;
  isValidCallback?: (valid: boolean) => void;
  parentSummary?: ParentSummary;
}

export default function SchemaForm({ schema, data, onChange, referenceOptions: parentReferenceOptions, fetchReferenceOptions: parentFetchReferenceOptions, isValidCallback, parentSummary }: SchemaFormProps) {
  const fields = Object.entries(schema.properties || {}) as [string, any][];
  const editorStack = useEditorStack();

  // Determine the id field name (e.g. id)
  const idField = Object.keys(schema.properties || {}).find(
    (k) => k === 'id' || k.endsWith('_id')
  );
  // Detect a slug field
  const hasSlugField = !!(schema.properties && 'slug' in schema.properties);
  // Try to infer the type from the schema title or idField
  const type = (schema.title || idField?.replace(/_id$/, '') || 'entity').toLowerCase();

  // --- Reference dropdowns state ---
  const [referenceOptions, setReferenceOptions] = useState<Record<string, any>>(parentReferenceOptions || {});
  const [createdLabels, setCreatedLabels] = useState<Record<string, { id: string; label: string }>>({});
  const [recentlyAdded, setRecentlyAdded] = useState<Record<string, string>>({});
  const [numberInputs, setNumberInputs] = useState<Record<string, string>>({});

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

  const refreshReferenceOptions = useCallback((refType: string) => {
    if (parentFetchReferenceOptions) {
      parentFetchReferenceOptions(refType);
      return;
    }
    fetch(`http://localhost:5000/api/${refType}`)
      .then((res) => res.json())
      .then((list) => {
        setReferenceOptions((prev) => ({ ...prev, [refType]: list }));
      })
      .catch(() => {
        setReferenceOptions((prev) => ({ ...prev, [refType]: [] }));
      });
  }, [parentFetchReferenceOptions]);

  // --- Reference autocomplete fetcher ---
  const fetchReferenceAutocomplete = useCallback(
    async (refType: string, search: string) => {
      const url = `http://localhost:5000/api/${refType}?search=${encodeURIComponent(search)}`;
      const res = await fetch(url);
      return res.json();
    },
    []
  );

  useEffect(() => {
    // For each field with ui.reference, fetch options from backend (top-level and nested)
    const collectReferences = (schemaObj: any): string[] => {
      let refs: string[] = [];
      if (!schemaObj || !schemaObj.properties) return refs;
      for (const [_, configUnknown] of Object.entries(schemaObj.properties)) {
        const config = configUnknown as any;
        if (config.ui && config.ui.reference) refs.push(config.ui.reference);
        // If array of objects, check nested
        if (config.type === 'array' && config.items?.type === 'object') {
          refs = refs.concat(collectReferences(config.items));
        }
      }
      return refs;
    };
    const refs = collectReferences(schema);
    refs.forEach((refType) => fetchReferenceOptions(refType));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  // --- Required fields validation ---
  const requiredFields: string[] = schema.required || [];
  // const [touched, setTouched] = useState<Record<string, boolean>>({});
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

  // Auto-fill slug from name when slug is empty; do NOT auto-generate id
  const handleChange = (key: string, value: any) => {
    // setTouched((prev) => ({ ...prev, [key]: true }));
    let updated = { ...data, [key]: value };
    if (hasSlugField && key === 'name') {
      const currentSlug = (data && data.slug) || '';
      if (!currentSlug || currentSlug.trim() === '') {
        updated.slug = generateSlug(value || '');
      }
    }
    onChange(updated);
  };

  const normalizeDecimalInput = (raw: string) => raw.replace(',', '.');

  const getNumberInputValue = (key: string, value: any) => {
    if (numberInputs[key] !== undefined) return numberInputs[key];
    if (value === null || value === undefined) return '';
    return String(value);
  };

  const handleNumberChange = (key: string, raw: string) => {
    const normalized = normalizeDecimalInput(raw);
    setNumberInputs((prev) => ({ ...prev, [key]: normalized }));
  };

  const handleNumberBlur = (key: string, raw: string, applyChange?: (val: number | '') => void) => {
    const normalized = normalizeDecimalInput(raw).trim();
    if (normalized === '') {
      setNumberInputs((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      if (applyChange) applyChange('');
      return;
    }
    const num = parseFloat(normalized);
    if (!Number.isNaN(num)) {
      setNumberInputs((prev) => ({ ...prev, [key]: normalized }));
      if (applyChange) applyChange(num);
    }
  };

  const getNumberPlaceholder = (labelText: string, keyName?: string) => {
    const lower = `${labelText} ${keyName || ''}`.toLowerCase();
    if (lower.includes('multiplier')) return 'e.g. 0.8';
    if (lower.includes('chance') || lower.includes('%')) return 'e.g. 25';
    if (lower.includes('min') || lower.includes('max')) return 'e.g. 0';
    return `e.g. 1.0`;
  };

  const renderFieldLabel = (label: string, description?: string, action?: ReactNode) => (
    <div className="mb-1 flex items-start justify-between gap-2">
      <div>
        <span className="font-medium text-gray-800">{label}</span>
        {description && (
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      {action}
    </div>
  );

  const inputBaseClass = "w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 bg-white text-gray-800 transition-all duration-200 ease-in-out focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none hover:border-gray-400";

  const schemaNameOverrides: Record<string, string> = {
    'content-packs': 'content_packs',
    'dialogue-nodes': 'dialogue_nodes',
    'lore-entries': 'lore_entries',
    'story-arcs': 'story_arcs',
    'talent-nodes': 'talent_nodes',
    'talent-node-links': 'talent_node_links',
    'talent-trees': 'talent_trees',
    'shop-inventory': 'shops_inventory',
  };

  const resolveSchemaName = (refType: string) => schemaNameOverrides[refType] || refType;

  const handleCreateReference = async (
    refType: string,
    onSelect: (id: string, createdData: Record<string, any>) => void
  ) => {
    if (!editorStack?.openEditor) return;
    const result = await editorStack.openEditor({
      schemaName: resolveSchemaName(refType),
      apiPath: refType,
      parentSummary,
    });
    if (result?.id) {
      onSelect(result.id, result.data);
      refreshReferenceOptions(refType);
    }
  };

  const markRecentlyAdded = (key: string, id: string) => {
    setRecentlyAdded((prev) => ({ ...prev, [key]: id }));
    setTimeout(() => {
      setRecentlyAdded((prev) => {
        if (prev[key] !== id) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 2500);
  };


  // --- Preview URLs state for file uploads ---
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  return (
    <form className="space-y-6 bg-white rounded-lg shadow-sm p-6">
      {missingFields.length > 0 && (
        <div className="mb-4 alert alert-error shadow-sm">
          <span>Please fill all required fields: {missingFields.join(', ')}</span>
        </div>
      )}
      {fields.map(([key, config]) => {
        const type = config.type;
        const ui = config.ui || {};
        const label = ui.label || key;
        const description = ui.description;
        const value = data[key];

        // --- Conditional field display (ui.visible_if) ---
        if (ui.visible_if) {
          // visible_if: { field: value } or { field: [value1, value2] }
          let shouldShow = true;
          for (const depField in ui.visible_if) {
            const expected = ui.visible_if[depField];
            const actual = data[depField];
            if (Array.isArray(expected)) {
              if (!expected.includes(actual)) shouldShow = false;
            } else {
              if (actual !== expected) shouldShow = false;
            }
          }
          if (!shouldShow) return null;
        }

        if (type === 'string' && ui.reference) {
          const refType = ui.reference;
          // Use Autocomplete for large lists, fallback to dropdown for small lists
          const refOptions = (parentReferenceOptions || referenceOptions)[refType] || [];
          const useAutocomplete = !ui.options && (!refOptions || refOptions.length > 50);
          const handleCreateReferenceForField = async () => {
            let created: { id: string; label?: string } | null = null;
            await handleCreateReference(refType, (id, createdData) => {
              const labelValue = createdData?.name || createdData?.title || createdData?.slug || createdData?.id;
              created = { id, label: labelValue ? String(labelValue) : undefined };
            });
            return created;
          };

          const valueLabel = createdLabels[key]?.id === value ? createdLabels[key]?.label : undefined;
          return (
            <ReferenceSelectField
              key={key}
              label={label}
              description={description}
              value={value || ''}
              refType={refType}
              options={refOptions}
              useAutocomplete={useAutocomplete}
              valueLabel={valueLabel}
              canCreate={!!editorStack?.openEditor}
              onCreateReference={editorStack?.openEditor ? handleCreateReferenceForField : undefined}
              onCreatedLabel={(id, labelText) => {
                setCreatedLabels((prev) => ({ ...prev, [key]: { id, label: labelText } }));
              }}
              onChange={(val) => handleChange(key, val)}
              fetchReferenceAutocomplete={fetchReferenceAutocomplete}
              renderFieldLabel={renderFieldLabel}
            />
          );
        }

        if (type === 'string' && ui.widget === 'select') {
          // Use ui.options if present, otherwise fallback to config.enum
          const selectOptions = ui.options || config.enum || [];
          const mappedOptions = (selectOptions || []).map((opt: string) => ({
            label: String(opt),
            value: String(opt),
          }));
          return (
            <div key={key} className="form-field">
              {renderFieldLabel(label, description)}
              <SearchableSelect
                value={value || ''}
                onChange={(val) => handleChange(key, val)}
                options={mappedOptions}
                placeholder={`Select ${label}`}
                disabled={mappedOptions.length === 0}
              />
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

        if (type === 'string' && ui.widget === 'filepicker') {
          // File picker: store file name in data, show preview if image, allow removal
          return (
            <div key={key} className="form-field">
              {renderFieldLabel(label, description)}
              <input
                type="file"
                className={inputBaseClass}
                accept="image/*"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleChange(key, file.name);
                    const reader = new FileReader();
                    reader.onload = ev => {
                      const url = ev.target?.result as string;
                      setPreviewUrls(prev => ({ ...prev, [key]: url }));
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />
              {/* Show preview if image */}
              {value && value.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) && previewUrls[key] && (
                <div className="mt-2 flex items-center gap-2">
                  <img src={previewUrls[key]} alt="preview" style={{ maxHeight: '60px' }} />
                  <button
                    type="button"
                    className="ml-2 px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-xs"
                    onClick={() => {
                      handleChange(key, '');
                      setPreviewUrls(prev => {
                        const copy = { ...prev };
                        delete copy[key];
                        return copy;
                      });
                    }}
                  >Remove</button>
                </div>
              )}
              {/* Show file name if not image */}
              {value && !value.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500">{value}</span>
                  <button
                    type="button"
                    className="ml-2 px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-xs"
                    onClick={() => {
                      handleChange(key, '');
                      setPreviewUrls(prev => {
                        const copy = { ...prev };
                        delete copy[key];
                        return copy;
                      });
                    }}
                  >Remove</button>
                </div>
              )}
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
                type="text"
                inputMode="decimal"
                className={inputBaseClass}
                value={getNumberInputValue(key, value)}
                onChange={(e) => handleNumberChange(key, e.target.value)}
                onBlur={(e) => handleNumberBlur(key, e.target.value, (val) => handleChange(key, val))}
                placeholder={getNumberPlaceholder(label, key)}
              />
            </div>
          );
        }

        if (type === 'array' && config.items?.type === 'string' && ui.widget === 'multiselect') {
          // If this is a reference multiselect, use referenceOptions
          let options: any[] = [];
          let refType = null;
          if (ui.reference) {
            refType = ui.reference;
            const refList = (parentReferenceOptions || referenceOptions)[refType] || [];
            options = refList;
          } else if (ui.options) {
            options = ui.options.map((opt: string) => ({ id: opt, name: opt }));
          } else if (Array.isArray(config.items?.enum)) {
            options = config.items.enum.map((opt: string) => ({ id: opt, name: opt }));
          } else if (Array.isArray(config.enum)) {
            options = config.enum.map((opt: string) => ({ id: opt, name: opt }));
          }

          const onCreateReference = refType && editorStack?.openEditor
            ? async () => {
              let createdId: string | null = null;
              await handleCreateReference(refType as string, (id) => {
                createdId = id;
              });
              return createdId;
            }
            : undefined;

          return (
            <ArrayStringMultiSelectField
              key={key}
              label={label}
              description={description}
              value={Array.isArray(value) ? value : []}
              options={options}
              refType={refType}
              recentlyAddedId={recentlyAdded[key]}
              onChange={(next) => handleChange(key, next)}
              onCreateReference={onCreateReference}
              onMarkRecentlyAdded={(id) => markRecentlyAdded(key, id)}
              renderFieldLabel={renderFieldLabel}
            />
          );
        }

        if (type === 'array' && config.items?.type === 'string' && ui.widget === 'tags') {
          return (
            <TagInput
              key={key}
              value={value || []}
              onChange={(tags) => handleChange(key, tags)}
              label={label}
              placeholder={description || 'Add a tag...'}
              disabled={ui.disabled}
            />
          );
        }

        if (type === 'object') {
          const nestedProps = config.properties || {};
          return (
            <fieldset key={key} className="border border-gray-200 rounded-lg p-4 bg-gray-50 mb-6 shadow-sm">
              <legend className="px-2 text-base font-semibold text-primary mb-2">{label}</legend>
              {renderFieldLabel(label, description)}
              <div className="mt-3">
                <SchemaForm
                  schema={{ properties: nestedProps }}
                  data={value || {}}
                  onChange={(val) => handleChange(key, val)}
                  referenceOptions={parentReferenceOptions || referenceOptions}
                  fetchReferenceOptions={fetchReferenceOptions}
                  parentSummary={parentSummary}
                />
              </div>
            </fieldset>
          );
        }

        if (type === 'array' && config.items?.type === 'object') {
          // Special handling for reference fields inside array of objects (e.g., results_in.stat_id)
          const itemSchema = config.items;
          return (
            <fieldset key={key} className="border border-gray-200 rounded-lg p-4 bg-gray-50 mb-6 shadow-sm">
              <legend className="px-2 text-base font-semibold text-primary mb-2">{label}</legend>
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
                      aria-label={`Remove ${label} item`}
                    >
                      x
                    </button>
                    {/* Render each property in the object, with reference dropdown for stat_id if specified */}
                    {Object.entries(itemSchema.properties || {}).map(([itemKey, itemConfig]: any) => {
                      const itemUi = itemConfig.ui || {};
                      const itemLabel = itemUi.label || itemKey;
                      const itemValue = item[itemKey];
                      if (itemUi.reference) {
                        const refType = itemUi.reference;
                        const options = (parentReferenceOptions || referenceOptions)[refType] || [];
                        // Defensive: ensure options is always an array
                        const safeOptions = Array.isArray(options) ? options : [];
                        const mappedOptions = safeOptions.map((opt: any) => {
                          const labelText = opt.name || opt.title || opt.id || opt[`${refType.slice(0, -1)}_id`] || opt[`${refType}_id`] || JSON.stringify(opt);
                          const valueText = opt.id || opt[`${refType.slice(0, -1)}_id`] || opt[`${refType}_id`] || opt;
                          return { label: String(labelText), value: String(valueText) };
                        });
                        return (
                          <div key={itemKey} className="form-field mb-2">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <label className="block text-sm font-medium text-gray-700">{itemLabel}</label>
                              {editorStack?.openEditor && (
                                <button
                                  type="button"
                                  className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-700 bg-slate-100 hover:bg-slate-200"
                                  onClick={() =>
                                    handleCreateReference(refType, (id) => {
                                    const updatedItem = { ...item, [itemKey]: id };
                                      const newArr = [...(value || [])];
                                      newArr[idx] = updatedItem;
                                      handleChange(key, newArr);
                                    })
                                  }
                                >
                                  Create new
                                </button>
                              )}
                            </div>
                            <SearchableSelect
                              value={itemValue || ''}
                              onChange={(val) => {
                                const updatedItem = { ...item, [itemKey]: val };
                                const newArr = [...(value || [])];
                                newArr[idx] = updatedItem;
                                handleChange(key, newArr);
                              }}
                              options={mappedOptions}
                              placeholder={safeOptions.length === 0 ? 'No options available' : `Select ${itemLabel}`}
                              disabled={safeOptions.length === 0}
                            />
                            {safeOptions.length === 0 && editorStack?.openEditor && (
                              <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                                <span>No options yet.</span>
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded border border-slate-300 text-slate-700 bg-slate-100 hover:bg-slate-200"
                                  onClick={() =>
                                    handleCreateReference(refType, (id) => {
                                      const updatedItem = { ...item, [itemKey]: id };
                                      const newArr = [...(value || [])];
                                      newArr[idx] = updatedItem;
                                      handleChange(key, newArr);
                                    })
                                  }
                                >
                                  Create new
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      }
                      if (itemConfig.type === 'string' && itemUi.widget === 'select') {
                        const selectOptions = itemUi.options || itemConfig.enum || [];
                        const mappedOptions = (selectOptions || []).map((opt: string) => ({
                          label: String(opt),
                          value: String(opt),
                        }));
                        return (
                          <div key={itemKey} className="form-field mb-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">{itemLabel}</label>
                            <SearchableSelect
                              value={itemValue || ''}
                              onChange={(val) => {
                                const updatedItem = { ...item, [itemKey]: val };
                                const newArr = [...(value || [])];
                                newArr[idx] = updatedItem;
                                handleChange(key, newArr);
                              }}
                              options={mappedOptions}
                              placeholder={`Select ${itemLabel}`}
                              disabled={mappedOptions.length === 0}
                            />
                          </div>
                        );
                      }
                      // Fallback for other types
                      if (itemConfig.type === 'number') {
                        const itemKeyPath = `${key}.${idx}.${itemKey}`;
                        return (
                          <div key={itemKey} className="form-field mb-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">{itemLabel}</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              className={inputBaseClass}
                              value={getNumberInputValue(itemKeyPath, itemValue)}
                              onChange={e => {
                                handleNumberChange(itemKeyPath, e.target.value);
                                const updatedItem = { ...item, [itemKey]: item[itemKey] };
                                const newArr = [...(value || [])];
                                newArr[idx] = updatedItem;
                                handleChange(key, newArr);
                              }}
                              onBlur={(e) => {
                                handleNumberBlur(itemKeyPath, e.target.value, (val) => {
                                  const updatedItem = { ...item, [itemKey]: val };
                                  const newArr = [...(value || [])];
                                  newArr[idx] = updatedItem;
                                  handleChange(key, newArr);
                                });
                              }}
                              placeholder={getNumberPlaceholder(itemLabel, itemKey)}
                            />
                          </div>
                        );
                      }
                      if (itemConfig.type === 'string') {
                        return (
                          <div key={itemKey} className="form-field mb-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">{itemLabel}</label>
                            <input
                              type="text"
                              className={inputBaseClass}
                              value={itemValue || ''}
                              onChange={e => {
                                const updatedItem = { ...item, [itemKey]: e.target.value };
                                const newArr = [...value];
                                newArr[idx] = updatedItem;
                                handleChange(key, newArr);
                              }}
                            />
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                ))}
                <button
                  type="button"
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                  onClick={() => handleChange(key, [...(value || []), {}])}
                  aria-label={`Add ${label.slice(0, -1)}`}
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
