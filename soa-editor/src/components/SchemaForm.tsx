import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react';
import { generateSlug } from '../utils/generateId';
import { useEditorStack, ParentSummary } from './EditorStackContext';
import { apiFetch } from '../lib/api';
import FieldLabel from './schemaForm/FieldLabel';
import ArrayObjectField from './schemaForm/ArrayObjectField';
import StringFieldRenderer from './schemaForm/StringFieldRenderer';
import ScalarFieldRenderer from './schemaForm/ScalarFieldRenderer';
import ArrayStringFieldRenderer from './schemaForm/ArrayStringFieldRenderer';
import ObjectFieldRenderer from './schemaForm/ObjectFieldRenderer';
import {
  getNumberPlaceholder,
  isMissingScalarValue,
  normalizeDecimalInput,
  parseNumberByType,
  resolveReferenceFromOptionsSource,
  resolveSchemaName,
  type NumberValueType,
} from './schemaForm/helpers';

interface SchemaFormProps {
  schema: any;
  data: any;
  onChange: (updated: any) => void;
  referenceOptions?: Record<string, any[]>;
  fetchReferenceOptions?: (refType: string) => void;
  isValidCallback?: (valid: boolean) => void;
  parentSummary?: ParentSummary;
  isNested?: boolean;
}

function isVisibleByRule(ui: any, sourceData: Record<string, any>): boolean {
  if (!ui?.visible_if) return true;
  for (const depField in ui.visible_if) {
    const expected = ui.visible_if[depField];
    const actual = sourceData?.[depField];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

export default function SchemaForm({ schema, data, onChange, referenceOptions: parentReferenceOptions, fetchReferenceOptions: parentFetchReferenceOptions, isValidCallback, parentSummary, isNested = false }: SchemaFormProps) {
  const fields = Object.entries(schema.properties || {}) as [string, any][];
  const editorStack = useEditorStack();
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Determine the id field name (e.g. id)
  const idField = Object.keys(schema.properties || {}).find(
    (k) => k === 'id' || k.endsWith('_id')
  );
  // Detect a slug field
  const hasSlugField = !!(schema.properties && 'slug' in schema.properties);

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
      apiFetch(`/api/${refType}`)
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
    apiFetch(`/api/${refType}`)
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
      const url = `/api/${refType}?search=${encodeURIComponent(search)}`;
      const res = await apiFetch(url);
      return res.json();
    },
    []
  );

  useEffect(() => {
    // For each field with ui.reference or ui.options_source, fetch options from backend.
    const collectReferences = (schemaObj: any): string[] => {
      let refs: string[] = [];
      if (!schemaObj || !schemaObj.properties) return refs;
      for (const [_, configUnknown] of Object.entries(schemaObj.properties)) {
        const config = configUnknown as any;
        if (config.ui?.reference) refs.push(config.ui.reference);
        const sourceRef = resolveReferenceFromOptionsSource(config.ui?.options_source);
        if (sourceRef) refs.push(sourceRef);
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
  const fieldVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {};
    for (const [key, config] of fields) {
      visibility[key] = isVisibleByRule(config?.ui || {}, data || {});
    }
    return visibility;
  }, [data, fields]);

  const scalarRequiredFields = requiredFields.filter((key) => {
    const config = schema.properties?.[key];
    if (!config) return false;
    if (fieldVisibility[key] === false) return false;
    return config.type !== 'array' && config.type !== 'object';
  });

  const missingFields = scalarRequiredFields.filter((key) => isMissingScalarValue(data[key]));
  const missingFieldSet = useMemo(() => new Set(missingFields), [missingFields]);
  const requiredTotal = scalarRequiredFields.length;
  const requiredCompleted = requiredTotal - missingFields.length;
  const requiredProgress = requiredTotal === 0 ? 100 : Math.round((requiredCompleted / requiredTotal) * 100);
  const firstMissingField = missingFields.length > 0 ? missingFields[0] : null;
  const isValid = missingFields.length === 0;
  useEffect(() => {
    if (typeof isValidCallback === 'function') isValidCallback(isValid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid]);

  const scrollToField = (key: string) => {
    const container = fieldRefs.current[key];
    if (!container) return;
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const target = container.querySelector('input, textarea, select, button') as HTMLElement | null;
    if (target) target.focus();
  };

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

  const getNumberInputValue = (key: string, value: any) => {
    if (numberInputs[key] !== undefined) return numberInputs[key];
    if (value === null || value === undefined) return '';
    return String(value);
  };

  const handleNumberChange = (key: string, raw: string) => {
    const normalized = normalizeDecimalInput(raw);
    setNumberInputs((prev) => ({ ...prev, [key]: normalized }));
  };

  const handleNumberBlur = (
    key: string,
    raw: string,
    valueType: NumberValueType,
    applyChange?: (val: number | '') => void
  ) => {
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
    const num = parseNumberByType(normalized, valueType);
    if (num !== null) {
      setNumberInputs((prev) => ({ ...prev, [key]: normalized }));
      if (applyChange) applyChange(num);
    }
  };

  const renderFieldLabel = (label: string, description?: string, action?: ReactNode) => (
    <FieldLabel label={label} description={description} action={action} />
  );

  const inputBaseClass = "w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 bg-white text-gray-800 transition-all duration-200 ease-in-out focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none hover:border-gray-400";

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
      {!isNested && (
        <div className="sticky top-0 z-20 rounded-lg border border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur mb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-800">
              Required fields: {requiredCompleted}/{requiredTotal}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">{requiredProgress}% complete</span>
              {firstMissingField && (
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  onClick={() => scrollToField(firstMissingField)}
                >
                  Jump to first missing
                </button>
              )}
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full rounded bg-slate-200">
            <div
              className={`h-1.5 rounded ${requiredProgress === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${requiredProgress}%` }}
            />
          </div>
          {missingFields.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {missingFields.slice(0, 6).map((missingKey) => (
                <button
                  key={missingKey}
                  type="button"
                  className="text-xs px-2 py-1 rounded bg-white border border-amber-200 text-amber-800 hover:bg-amber-50"
                  onClick={() => scrollToField(missingKey)}
                >
                  {missingKey}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {missingFields.length > 0 && !isNested && (
        <div className="mb-4 alert alert-error shadow-sm">
          <span>Please fill all required fields: {missingFields.join(', ')}</span>
        </div>
      )}
      {fields.map(([key, config]) => {
        const type = config.type;
        const ui = config.ui || {};
        const label = ui.label || key;
        const description = ui.description || config.description;
        const value = data[key];

        if (!isVisibleByRule(ui, data || {})) return null;

        let fieldNode: ReactNode = null;

        if (type === 'string') {
          fieldNode = (
            <StringFieldRenderer
              fieldKey={key}
              idField={idField}
              ui={ui}
              config={config}
              label={label}
              description={description}
              value={value}
              inputBaseClass={inputBaseClass}
              parentReferenceOptions={parentReferenceOptions}
              referenceOptions={referenceOptions}
              createdLabels={createdLabels}
              setCreatedLabels={setCreatedLabels}
              previewUrls={previewUrls}
              setPreviewUrls={setPreviewUrls}
              canCreateReference={!!editorStack?.openEditor}
              handleChange={handleChange}
              handleCreateReference={handleCreateReference}
              fetchReferenceAutocomplete={fetchReferenceAutocomplete}
              renderFieldLabel={renderFieldLabel}
            />
          );
        } else if (type === 'boolean' || type === 'number' || type === 'integer' || ui.widget === 'checkbox') {
          fieldNode = (
            <ScalarFieldRenderer
              fieldKey={key}
              type={type}
              ui={ui}
              label={label}
              description={description}
              value={value}
              inputBaseClass={inputBaseClass}
              handleChange={handleChange}
              getNumberInputValue={getNumberInputValue}
              handleNumberChange={handleNumberChange}
              handleNumberBlur={handleNumberBlur}
              getNumberPlaceholder={getNumberPlaceholder}
              renderFieldLabel={renderFieldLabel}
            />
          );
        } else if (type === 'array' && config.items?.type === 'string' && (ui.widget === 'multiselect' || ui.widget === 'tags')) {
          fieldNode = (
            <ArrayStringFieldRenderer
              fieldKey={key}
              ui={ui}
              config={config}
              label={label}
              description={description}
              value={value}
              parentReferenceOptions={parentReferenceOptions}
              referenceOptions={referenceOptions}
              canCreateReference={!!editorStack?.openEditor}
              recentlyAdded={recentlyAdded}
              handleChange={handleChange}
              markRecentlyAdded={markRecentlyAdded}
              handleCreateReference={handleCreateReference}
              renderFieldLabel={renderFieldLabel}
            />
          );
        } else if (type === 'object') {
          const nestedProps = config.properties || {};
          fieldNode = (
            <ObjectFieldRenderer
              fieldKey={key}
              label={label}
              description={description}
              nestedProps={nestedProps}
              value={value}
              renderNestedForm={(fieldKeyValue, nestedPropsValue, nestedValue) => (
                <SchemaForm
                  schema={{ properties: nestedPropsValue }}
                  data={nestedValue || {}}
                  onChange={(val) => handleChange(fieldKeyValue, val)}
                  referenceOptions={parentReferenceOptions || referenceOptions}
                  fetchReferenceOptions={fetchReferenceOptions}
                  parentSummary={parentSummary}
                  isNested
                />
              )}
            />
          );
        } else if (type === 'array' && config.items?.type === 'object') {
          fieldNode = (
            <ArrayObjectField
              fieldKey={key}
              label={label}
              description={description}
              value={value || []}
              itemSchema={config.items}
              widget={ui.widget}
              inputBaseClass={inputBaseClass}
              parentData={data}
              parentReferenceOptions={parentReferenceOptions}
              referenceOptions={referenceOptions}
              canCreateReference={!!editorStack?.openEditor}
              handleCreateReference={(refType, onSelect) => handleCreateReference(refType, (id) => onSelect(id))}
              handleChange={handleChange}
              getNumberInputValue={getNumberInputValue}
              handleNumberChange={handleNumberChange}
              handleNumberBlur={handleNumberBlur}
              getNumberPlaceholder={getNumberPlaceholder}
              renderFieldLabel={renderFieldLabel}
            />
          );
        }

        if (!fieldNode) return null;

        const isMissing = missingFieldSet.has(key);
        return (
          <div
            key={key}
            ref={(el) => {
              fieldRefs.current[key] = el;
            }}
            data-schema-field={key}
            className={isMissing ? 'rounded-md ring-1 ring-amber-300 p-1' : undefined}
          >
            {fieldNode}
          </div>
        );
      })}
    </form>
  );
}
