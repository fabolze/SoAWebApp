import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react';
import { generateSlug } from '../utils/generateId';
import { useEditorStack, ParentSummary } from './EditorStackContext';
import { apiFetch } from '../lib/api';
import { findDatasetBySchema } from '../config/editorDatasets';
import FieldLabel from './schemaForm/FieldLabel';
import ArrayObjectField from './schemaForm/ArrayObjectField';
import StringFieldRenderer from './schemaForm/StringFieldRenderer';
import ScalarFieldRenderer from './schemaForm/ScalarFieldRenderer';
import ArrayStringFieldRenderer from './schemaForm/ArrayStringFieldRenderer';
import ObjectFieldRenderer from './schemaForm/ObjectFieldRenderer';
import useDebouncedValue from './hooks/useDebouncedValue';
import { BUTTON_CLASSES, BUTTON_SIZES } from '../styles/uiTokens';
import {
  getNumberPlaceholder,
  formatNumberInputValue,
  isMissingScalarValue,
  normalizeNumberInput,
  parseNumberByType,
  type NumberInputFormat,
  resolveReferenceFromOptionsSource,
  resolveSchemaName,
  type NumberValueType,
} from './schemaForm/helpers';
import {
  asRecord,
  type EntryData,
  type ReferenceOptionsMap,
  type SchemaDefinition,
  type SchemaFieldConfig,
  type SchemaFieldUiConfig,
} from './schemaForm/types';

interface SchemaFormProps {
  schema: SchemaDefinition;
  schemaName?: string;
  data: EntryData;
  onChange: (updated: EntryData) => void;
  referenceOptions?: ReferenceOptionsMap;
  fetchReferenceOptions?: (refType: string) => void;
  isValidCallback?: (valid: boolean) => void;
  parentSummary?: ParentSummary;
  isNested?: boolean;
  changedFieldKeys?: string[];
  includedFieldKeys?: string[];
  compactControls?: boolean;
}

function referenceApiPath(refType: string): string {
  return findDatasetBySchema(refType)?.apiPath || refType;
}

function isVisibleByRule(ui: SchemaFieldUiConfig, sourceData: EntryData): boolean {
  const visibleIf = asRecord(ui.visible_if);
  if (Object.keys(visibleIf).length === 0) return true;
  for (const depField in visibleIf) {
    const expected = visibleIf[depField];
    const actual = sourceData?.[depField];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

function inferSectionName(key: string, config: SchemaFieldConfig): string {
  const explicit = config.ui?.section;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();

  const normalized = key.toLowerCase();
  if (normalized === 'id' || normalized === 'slug' || normalized === 'name' || normalized === 'title' || normalized === 'description' || normalized === 'summary') {
    return 'Identity';
  }
  if (normalized.includes('requirement') || normalized.includes('flag') || normalized.includes('condition')) {
    return 'Gating';
  }
  if (normalized.includes('reward') || normalized.includes('currency') || normalized.includes('price') || normalized.includes('cost') || normalized.includes('loot') || normalized.includes('xp')) {
    return 'Economy';
  }
  if (normalized.includes('effect') || normalized.includes('status') || normalized.includes('modifier') || normalized.includes('scaling') || normalized.includes('stat') || normalized.includes('attribute') || normalized.includes('damage') || normalized.includes('cooldown') || normalized.includes('target')) {
    return 'Mechanics';
  }
  if (normalized.includes('location') || normalized.includes('biome') || normalized.includes('faction') || normalized.includes('character') || normalized.includes('encounter') || normalized.includes('event') || normalized.includes('quest') || normalized.includes('dialogue')) {
    return 'World Links';
  }
  if (normalized.includes('tag') || normalized.includes('icon') || normalized.includes('notes') || normalized.includes('content_pack')) {
    return 'Metadata';
  }
  if (config.type === 'array' || config.type === 'object') {
    return 'Details';
  }
  return 'Core';
}

export default function SchemaForm({ schema, schemaName = '', data, onChange, referenceOptions: parentReferenceOptions, fetchReferenceOptions: parentFetchReferenceOptions, isValidCallback, parentSummary, isNested = false, changedFieldKeys = [], includedFieldKeys, compactControls = false }: SchemaFormProps) {
  const fields = Object.entries(schema.properties || {}) as [string, SchemaFieldConfig][];
  const editorStack = useEditorStack();
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const includedFieldSet = useMemo(() => {
    if (isNested || !includedFieldKeys) return null;
    return new Set(includedFieldKeys);
  }, [includedFieldKeys, isNested]);

  // Determine the id field name (e.g. id)
  const idField = Object.keys(schema.properties || {}).find(
    (k) => k === 'id' || k.endsWith('_id')
  );
  // Detect a slug field
  const hasSlugField = !!(schema.properties && 'slug' in schema.properties);

  // --- Reference dropdowns state ---
  const [referenceOptions, setReferenceOptions] = useState<ReferenceOptionsMap>(parentReferenceOptions || {});
  const [createdLabels, setCreatedLabels] = useState<Record<string, { id: string; label: string }>>({});
  const [recentlyAdded, setRecentlyAdded] = useState<Record<string, string>>({});
  const [numberInputs, setNumberInputs] = useState<Record<string, string>>({});
  const [fieldFilter, setFieldFilter] = useState('');
  const [fieldViewMode, setFieldViewMode] = useState<'all' | 'missing' | 'changed'>('all');
  const [activeSection, setActiveSection] = useState<string>('All');
  const debouncedFieldFilter = useDebouncedValue(fieldFilter, 120);

  // Fetch reference options, but only if not provided by parent
  const fetchReferenceOptions = useCallback((refType: string) => {
    if (parentFetchReferenceOptions) {
      parentFetchReferenceOptions(refType);
      return;
    }
    if (!referenceOptions[refType]) {
      apiFetch(`/api/${referenceApiPath(refType)}`)
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
    apiFetch(`/api/${referenceApiPath(refType)}`)
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
      const url = `/api/${referenceApiPath(refType)}?search=${encodeURIComponent(search)}`;
      const res = await apiFetch(url);
      return res.json();
    },
    []
  );

  const fetchReferenceById = useCallback(
    async (refType: string, id: string) => {
      const normalizedId = String(id || '').trim();
      if (!normalizedId) return null;
      try {
        const res = await apiFetch(`/api/${referenceApiPath(refType)}/${encodeURIComponent(normalizedId)}`);
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    []
  );

  useEffect(() => {
    // For each field with ui.reference or ui.options_source, fetch options from backend.
    const collectReferences = (schemaObj: SchemaDefinition | SchemaFieldConfig): string[] => {
      let refs: string[] = [];
      if (!schemaObj || !schemaObj.properties) return refs;
      for (const [, config] of Object.entries(schemaObj.properties)) {
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
    if (includedFieldSet && !includedFieldSet.has(key)) return false;
    const config = schema.properties?.[key];
    if (!config) return false;
    if (fieldVisibility[key] === false) return false;
    return config.type !== 'array' && config.type !== 'object';
  });

  const missingFields = scalarRequiredFields.filter((key) => isMissingScalarValue(data[key]));
  const missingFieldSet = useMemo(() => new Set(missingFields), [missingFields]);
  const changedFieldSet = useMemo(() => new Set(changedFieldKeys.filter((key) => typeof key === 'string' && key.length > 0)), [changedFieldKeys]);
  const requiredTotal = scalarRequiredFields.length;
  const requiredCompleted = requiredTotal - missingFields.length;
  const requiredProgress = requiredTotal === 0 ? 100 : Math.round((requiredCompleted / requiredTotal) * 100);
  const firstMissingField = missingFields.length > 0 ? missingFields[0] : null;
  const isValid = missingFields.length === 0;
  useEffect(() => {
    if (typeof isValidCallback === 'function') isValidCallback(isValid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid]);

  useEffect(() => {
    if (isNested) return;
    setFieldFilter('');
    setFieldViewMode('all');
  }, [isNested, schema]);

  const scrollToField = (key: string) => {
    const container = fieldRefs.current[key];
    if (!container) return;
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const target = container.querySelector('input, textarea, select, button') as HTMLElement | null;
    if (target) target.focus();
  };

  const normalizedFieldFilter = debouncedFieldFilter.trim().toLowerCase();

  const shouldIncludeField = useCallback((key: string, label: string, descriptionText?: string) => {
    if (isNested) return true;
    if (fieldViewMode === 'missing' && !missingFieldSet.has(key)) return false;
    if (fieldViewMode === 'changed' && !changedFieldSet.has(key)) return false;
    if (!normalizedFieldFilter) return true;
    const haystack = `${key} ${label} ${descriptionText || ''}`.toLowerCase();
    return haystack.includes(normalizedFieldFilter);
  }, [changedFieldSet, fieldViewMode, isNested, missingFieldSet, normalizedFieldFilter]);

  const totalVisibleByRules = useMemo(() => {
    return fields.reduce((count, [, config]) => {
      if (!isVisibleByRule(config?.ui || {}, data || {})) return count;
      return count + 1;
    }, 0);
  }, [data, fields]);

  const filteredVisibleCount = useMemo(() => {
    return fields.reduce((count, [key, config]) => {
      const ui = config.ui || {};
      const label = ui.label || key;
      const description = ui.description || config.description;
      if (!isVisibleByRule(ui, data || {})) return count;
      if (includedFieldSet && !includedFieldSet.has(key)) return count;
      if (!shouldIncludeField(key, label, description)) return count;
      return count + 1;
    }, 0);
  }, [data, fields, includedFieldSet, shouldIncludeField]);

  const sectionGroups = useMemo(() => {
    const groups = new Map<string, { total: number; filtered: number; missing: number; changed: number }>();
    for (const [key, config] of fields) {
      const ui = config.ui || {};
      if (!isVisibleByRule(ui, data || {})) continue;
      if (includedFieldSet && !includedFieldSet.has(key)) continue;
      const sectionName = inferSectionName(key, config);
      const label = ui.label || key;
      const description = ui.description || config.description;
      const existing = groups.get(sectionName) || { total: 0, filtered: 0, missing: 0, changed: 0 };
      existing.total += 1;
      if (missingFieldSet.has(key)) existing.missing += 1;
      if (changedFieldSet.has(key)) existing.changed += 1;
      if (shouldIncludeField(key, label, description)) existing.filtered += 1;
      groups.set(sectionName, existing);
    }
    return Array.from(groups.entries()).map(([name, counts]) => ({ name, ...counts }));
  }, [changedFieldSet, data, fields, includedFieldSet, missingFieldSet, shouldIncludeField]);

  const availableSections = useMemo(() => ['All', ...sectionGroups.map((group) => group.name)], [sectionGroups]);

  useEffect(() => {
    if (isNested) return;
    if (!availableSections.includes(activeSection)) {
      setActiveSection('All');
    }
  }, [activeSection, availableSections, isNested]);

  // Auto-fill slug from name when slug is empty; do NOT auto-generate id
  const handleChange = (key: string, value: unknown) => {
    // setTouched((prev) => ({ ...prev, [key]: true }));
    const updated: EntryData = { ...data, [key]: value };
    if (hasSlugField && key === 'name') {
      const currentSlug = typeof data?.slug === 'string' ? data.slug : '';
      if (!currentSlug || currentSlug.trim() === '') {
        updated.slug = generateSlug(String(value ?? ''));
      }
    }
    onChange(updated);
  };

  const getNumberInputValue = (key: string, value: unknown, inputFormat: NumberInputFormat = 'standard') => {
    if (numberInputs[key] !== undefined) return numberInputs[key];
    return formatNumberInputValue(value, inputFormat);
  };

  const handleNumberChange = (key: string, raw: string, inputFormat: NumberInputFormat = 'standard') => {
    const normalized = normalizeNumberInput(raw, inputFormat);
    setNumberInputs((prev) => ({ ...prev, [key]: normalized }));
  };

  const handleNumberBlur = (
    key: string,
    raw: string,
    valueType: NumberValueType,
    inputFormat: NumberInputFormat = 'standard',
    applyChange?: (val: number | '') => void
  ) => {
    const normalized = normalizeNumberInput(raw, inputFormat).trim();
    if (normalized === '') {
      setNumberInputs((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      if (applyChange) applyChange('');
      return;
    }
    const num = parseNumberByType(normalized, valueType, inputFormat);
    if (num !== null) {
      setNumberInputs((prev) => ({ ...prev, [key]: formatNumberInputValue(num, inputFormat) }));
      if (applyChange) applyChange(num);
    }
  };

  const renderFieldLabel = (label: string, description?: string, action?: ReactNode) => (
    <FieldLabel label={label} description={description} action={action} />
  );

  const inputBaseClass = "w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 bg-white text-gray-800 transition-all duration-200 ease-in-out focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none hover:border-gray-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:focus:ring-blue-900";

  const handleCreateReference = async (
    refType: string,
    onSelect: (id: string, createdData: EntryData) => void
  ) => {
    if (!editorStack?.openEditor) return;
    const dataset = findDatasetBySchema(refType);
    const result = await editorStack.openEditor({
      schemaName: dataset?.schemaName || resolveSchemaName(refType),
      apiPath: dataset?.apiPath || refType,
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
    <form className="space-y-5">
      {!isNested && (
        <div className="sticky top-0 z-20 border-y border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Required fields: {requiredCompleted}/{requiredTotal}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600 dark:text-slate-400">{requiredProgress}% complete</span>
              {firstMissingField && (
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  onClick={() => scrollToField(firstMissingField)}
                >
                  Jump to first missing
                </button>
              )}
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full rounded bg-slate-200 dark:bg-slate-800">
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
                  className="text-xs px-2 py-1 rounded bg-white border border-amber-200 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300"
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
      {!isNested && (
        <div className="border-y border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 flex-wrap">
            {!compactControls && (
              <input
                type="text"
                className="flex-1 min-w-[220px] border border-slate-300 rounded-md px-3 py-1.5 text-sm text-slate-900 bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="Filter fields (name, label, description)"
                value={fieldFilter}
                onChange={(e) => setFieldFilter(e.target.value)}
              />
            )}
            {!compactControls && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={`${fieldViewMode === 'all' ? BUTTON_CLASSES.primary : BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`}
                  onClick={() => setFieldViewMode('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`${fieldViewMode === 'missing' ? BUTTON_CLASSES.primary : BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`}
                  onClick={() => setFieldViewMode('missing')}
                >
                  Missing ({missingFields.length})
                </button>
                <button
                  type="button"
                  className={`${fieldViewMode === 'changed' ? BUTTON_CLASSES.primary : BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`}
                  onClick={() => setFieldViewMode('changed')}
                >
                  Changed ({changedFieldSet.size})
                </button>
                {fieldFilter && (
                  <button
                    type="button"
                    className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
                    onClick={() => setFieldFilter('')}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
            {compactControls && firstMissingField && (
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  onClick={() => scrollToField(firstMissingField)}
                >
                  Jump to first missing
                </button>
            )}
          </div>
          {!compactControls && (
            <div className="mt-2 text-xs text-slate-600">
              Showing {filteredVisibleCount} / {totalVisibleByRules} visible fields
            </div>
          )}
          {!compactControls && sectionGroups.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1 border-t border-slate-200 pt-3 dark:border-slate-800">
              {availableSections.map((sectionName) => {
                const group = sectionGroups.find((section) => section.name === sectionName);
                const count = sectionName === 'All' ? filteredVisibleCount : group?.filtered || 0;
                const missingCount = sectionName === 'All' ? missingFields.length : group?.missing || 0;
                const changedCount = sectionName === 'All' ? changedFieldSet.size : group?.changed || 0;
                const active = activeSection === sectionName;
                return (
                  <button
                    key={sectionName}
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                      active
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                    onClick={() => setActiveSection(sectionName)}
                  >
                    <span>{sectionName}</span>
                    <span className={active ? 'text-blue-100' : 'text-slate-500'}>{count}</span>
                    {missingCount > 0 && (
                      <span className={active ? 'text-amber-100' : 'text-amber-700'}>{missingCount} missing</span>
                    )}
                    {changedCount > 0 && (
                      <span className={active ? 'text-emerald-100' : 'text-emerald-700'}>{changedCount} changed</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {fields.map(([key, config]) => {
        const type = config.type;
        const ui = config.ui || {};
        const label = ui.label || key;
        const description = ui.description || config.description;
        const value = data[key];

        if (!isVisibleByRule(ui, data || {})) return null;
        if (includedFieldSet && !includedFieldSet.has(key)) return null;
        if (!shouldIncludeField(key, label, description)) return null;
        if (!isNested && activeSection !== 'All' && inferSectionName(key, config) !== activeSection) return null;

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
              fetchReferenceById={fetchReferenceById}
              renderFieldLabel={renderFieldLabel}
            />
          );
        } else if (type === 'boolean' || type === 'number' || type === 'integer' || ui.widget === 'checkbox') {
          fieldNode = (
                <ScalarFieldRenderer
                  fieldKey={key}
                  type={type || 'number'}
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
              fetchReferenceById={fetchReferenceById}
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
                  schemaName={schemaName}
                  data={nestedValue}
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
              schemaName={schemaName}
              fieldPath={key}
              label={label}
              description={description}
              value={Array.isArray(value) ? value.map((row) => asRecord(row)) : []}
              itemSchema={config.items || {}}
              widget={ui.widget}
              inputBaseClass={inputBaseClass}
              parentData={data}
              parentReferenceOptions={parentReferenceOptions}
              referenceOptions={referenceOptions}
              canCreateReference={!!editorStack?.openEditor}
              handleCreateReference={(refType, onSelect) => handleCreateReference(refType, (id) => onSelect(id))}
              fetchReferenceById={fetchReferenceById}
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
          className={isMissing ? 'rounded-md ring-1 ring-amber-300 p-1 dark:ring-amber-700' : undefined}
          >
            {fieldNode}
          </div>
        );
      })}
    </form>
  );
}
