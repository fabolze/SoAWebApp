import type { ReactNode } from 'react';
import SearchableSelect from '../SearchableSelect';
import ArrayStringMultiSelectField from '../SchemaFields/ArrayStringMultiSelectField';
import TagInput from '../TagInput';
import { BUTTON_CLASSES, BUTTON_SIZES } from '../../styles/uiTokens';
import {
  formatCompactNumber,
  mapReferenceOptions,
  mapSelectOptions,
  resolveReferenceFromOptionsSource,
  type NumberValueType,
  toNumberOrNull,
} from './helpers';
import {
  asRecord,
  type EntryData,
  type ReferenceOptionsMap,
  type SchemaFieldConfig,
  type SchemaFieldUiConfig,
  type UnknownRecord,
} from './types';

interface ArrayObjectFieldProps {
  fieldKey: string;
  label: string;
  description?: string;
  value: UnknownRecord[];
  itemSchema: SchemaFieldConfig;
  widget?: string;
  inputBaseClass: string;
  parentData?: EntryData;
  parentReferenceOptions?: ReferenceOptionsMap;
  referenceOptions: ReferenceOptionsMap;
  canCreateReference: boolean;
  handleCreateReference: (refType: string, onSelect: (id: string) => void) => Promise<void> | void;
  fetchReferenceById?: (refType: string, id: string) => Promise<unknown | null>;
  handleChange: (key: string, value: unknown) => void;
  getNumberInputValue: (key: string, value: unknown) => string;
  handleNumberChange: (key: string, raw: string) => void;
  handleNumberBlur: (
    key: string,
    raw: string,
    valueType: NumberValueType,
    applyChange?: (val: number | '') => void
  ) => void;
  getNumberPlaceholder: (labelText: string, keyName?: string) => string;
  renderFieldLabel: (label: string, description?: string, action?: ReactNode) => ReactNode;
}

function getRefOptions(parentReferenceOptions: ReferenceOptionsMap | undefined, referenceOptions: ReferenceOptionsMap, refType: string): unknown[] {
  const options = (parentReferenceOptions || referenceOptions)[refType];
  return Array.isArray(options) ? options : [];
}

function applyPricingLayer(currentPrice: number, multiplier: number | null, modifier: number | null, override: number | null): number {
  if (override !== null) return override;
  let next = currentPrice;
  if (multiplier !== null) next *= multiplier;
  if (modifier !== null) next += modifier;
  return next;
}

function shouldShowByVisibleIf(visibleIf: unknown, rowData: UnknownRecord): boolean {
  const visible = asRecord(visibleIf);
  if (!visibleIf || typeof visibleIf !== 'object') return true;
  for (const depField in visible) {
    const expected = visible[depField];
    const actual = rowData?.[depField];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

export default function ArrayObjectField({
  fieldKey,
  label,
  description,
  value,
  itemSchema,
  widget,
  inputBaseClass,
  parentData,
  parentReferenceOptions,
  referenceOptions,
  canCreateReference,
  handleCreateReference,
  fetchReferenceById,
  handleChange,
  getNumberInputValue,
  handleNumberChange,
  handleNumberBlur,
  getNumberPlaceholder,
  renderFieldLabel,
}: ArrayObjectFieldProps) {
  const safeValue = Array.isArray(value) ? value : [];
  const isPriceTable = widget === 'item_price_table';
  const isDropTable = widget === 'item_drop_table';
  const isObjectivesEditor = widget === 'objectives_editor';
  const isGenericTable = widget === 'table';

  const itemOptions = getRefOptions(parentReferenceOptions, referenceOptions, 'items');
  const itemById = new Map<string, UnknownRecord>(
    itemOptions.map((opt) => {
      const record = asRecord(opt);
      const id = String(record.id || record.item_id || '');
      return [id, record];
    })
  );

  const dropChanceSum = isDropTable
    ? safeValue.reduce((sum, row) => sum + (toNumberOrNull(row?.drop_chance) || 0), 0)
    : 0;

  const addRow = () => {
    const nextIndex = safeValue.length + 1;
    const defaultRow =
      isObjectivesEditor
        ? { objective_id: `obj_${nextIndex}`, description: '' }
        : {};
    handleChange(fieldKey, [...safeValue, defaultRow]);
  };

  const removeRow = (idx: number) => {
    const next = [...safeValue];
    next.splice(idx, 1);
    handleChange(fieldKey, next);
  };

  const duplicateRow = (idx: number) => {
    const src = safeValue[idx] || {};
    const clone = JSON.parse(JSON.stringify(src));
    if (isObjectivesEditor && clone.objective_id) {
      clone.objective_id = `${clone.objective_id}_copy`;
    }
    const next = [...safeValue];
    next.splice(idx + 1, 0, clone);
    handleChange(fieldKey, next);
  };

  const moveRow = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= safeValue.length) return;
    const next = [...safeValue];
    const [row] = next.splice(idx, 1);
    next.splice(target, 0, row);
    handleChange(fieldKey, next);
  };

  const computePricePreview = (row: UnknownRecord): number | null => {
    if (!isPriceTable) return null;
    const directPrice = toNumberOrNull(row?.price);
    if (directPrice !== null) return Math.max(directPrice, 0);

    const itemId = String(row?.item_id || '');
    const item = itemById.get(itemId);
    const basePrice = toNumberOrNull(item?.base_price) ?? 0;

    const shopPrice = applyPricingLayer(
      basePrice,
      toNumberOrNull(parentData?.price_multiplier) ?? 1,
      toNumberOrNull(parentData?.price_modifier) ?? 0,
      toNumberOrNull(parentData?.price_override)
    );

    const rowPrice = applyPricingLayer(
      shopPrice,
      toNumberOrNull(row?.price_multiplier) ?? 1,
      toNumberOrNull(row?.price_modifier) ?? 0,
      toNumberOrNull(row?.price_override)
    );
    return Math.max(rowPrice, 0);
  };

  const getRowHeadline = (row: UnknownRecord, idx: number) => {
    if (isObjectivesEditor) {
      const objectiveId = String(row?.objective_id || `Objective ${idx + 1}`);
      const summary = row?.description ? String(row.description) : '';
      return { title: objectiveId, subtitle: summary };
    }
    if (isPriceTable || isDropTable) {
      const itemId = String(row?.item_id || '');
      const item = itemById.get(itemId);
      const itemName = item ? String(item?.name || item?.title || item?.slug || itemId) : itemId;
      return { title: itemName || `${label} ${idx + 1}`, subtitle: '' };
    }
    return { title: `${label} ${idx + 1}`, subtitle: '' };
  };

  const renderSpecialTopInfo = () => {
    if (isDropTable) {
      const isOverflow = dropChanceSum > 100;
      return (
        <div className={`text-xs px-2 py-1 rounded border ${isOverflow ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          Total Drop Chance: {formatCompactNumber(dropChanceSum)}%
        </div>
      );
    }
    if (isPriceTable) {
      return (
        <div className="text-xs px-2 py-1 rounded border bg-sky-50 border-sky-200 text-sky-700">
          Price Preview uses item base price + shop modifiers + row overrides.
        </div>
      );
    }
    if (isObjectivesEditor) {
      return (
        <div className="text-xs px-2 py-1 rounded border bg-indigo-50 border-indigo-200 text-indigo-700">
          Define objective order with drag-style controls (up/down) and duplicate for faster authoring.
        </div>
      );
    }
    return null;
  };

  const renderArrayStringCell = (params: {
    row: UnknownRecord;
    rowIndex: number;
    itemKey: string;
    itemConfig: SchemaFieldConfig;
    itemUi: SchemaFieldUiConfig;
    itemLabel: string;
    itemValue: unknown;
  }) => {
    const { row, rowIndex, itemKey, itemConfig, itemUi, itemLabel, itemValue } = params;
    if (!(itemConfig.type === 'array' && itemConfig.items?.type === 'string')) return null;

    const updateRowValue = (nextValue: unknown) => {
      const next = [...safeValue];
      next[rowIndex] = { ...row, [itemKey]: nextValue };
      handleChange(fieldKey, next);
    };

    if (itemUi.widget === 'tags') {
      return (
        <TagInput
          key={itemKey}
          value={Array.isArray(itemValue) ? itemValue : []}
          onChange={(tags) => updateRowValue(tags)}
          label={itemLabel}
          placeholder={itemConfig.description || 'Add tag...'}
        />
      );
    }

    if (itemUi.widget === 'multiselect') {
      let options: unknown[] = [];
      let refType: string | null = null;
      if (itemUi.reference) {
        const referenceType = String(itemUi.reference);
        refType = referenceType;
        options = getRefOptions(parentReferenceOptions, referenceOptions, referenceType);
      } else if (itemUi.options_source) {
        const sourceRef = resolveReferenceFromOptionsSource(itemUi.options_source);
        if (sourceRef) {
          refType = sourceRef;
          options = getRefOptions(parentReferenceOptions, referenceOptions, sourceRef);
        }
      } else if (itemUi.options) {
        options = itemUi.options.map((opt) => ({ id: String(opt), name: String(opt) }));
      } else if (Array.isArray(itemConfig.items?.enum)) {
        options = itemConfig.items.enum.map((opt) => ({ id: String(opt), name: String(opt) }));
      }

      const onCreateReference =
        refType && canCreateReference
          ? async () => {
              const activeRefType = refType;
              if (!activeRefType) return null;
              let createdId: string | null = null;
              await handleCreateReference(activeRefType, (id) => {
                createdId = id;
              });
              return createdId;
            }
          : undefined;

      return (
        <ArrayStringMultiSelectField
          key={itemKey}
          label={itemLabel}
          value={Array.isArray(itemValue) ? itemValue : []}
          options={options}
          refType={refType}
          onChange={(next) => updateRowValue(next)}
          onCreateReference={onCreateReference}
          fetchReferenceById={fetchReferenceById}
          renderFieldLabel={renderFieldLabel}
        />
      );
    }

    return null;
  };

  return (
    <fieldset className="border border-gray-200 rounded-lg p-4 bg-gray-50 mb-6 shadow-sm">
      <legend className="px-2 text-base font-semibold text-primary mb-2">{label}</legend>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        {description ? <p className="text-sm text-gray-500">{description}</p> : <span />}
        {renderSpecialTopInfo()}
      </div>
      <div className="space-y-4">
        {safeValue.map((item, idx: number) => {
          const headline = getRowHeadline(item, idx);
          const pricePreview = computePricePreview(item);
          const dropChance = toNumberOrNull(item?.drop_chance);
          const invalidDrop = isDropTable && (dropChance === null || dropChance < 0 || dropChance > 100);

          return (
            <div key={idx} className="relative p-4 border border-gray-200 rounded-lg bg-white">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{headline.title}</div>
                  {headline.subtitle && <div className="text-xs text-gray-500 truncate">{headline.subtitle}</div>}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {pricePreview !== null && (
                    <span className="text-xs px-2 py-1 rounded border bg-slate-50 border-slate-200 text-slate-700">
                      Preview: {formatCompactNumber(pricePreview)}
                    </span>
                  )}
                  {invalidDrop && (
                    <span className="text-xs px-2 py-1 rounded border bg-rose-50 border-rose-200 text-rose-700">
                      Drop chance should be 0-100
                    </span>
                  )}
                  <button
                    type="button"
                    className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
                    onClick={() => moveRow(idx, -1)}
                    disabled={idx === 0}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
                    onClick={() => moveRow(idx, 1)}
                    disabled={idx === safeValue.length - 1}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
                    onClick={() => duplicateRow(idx)}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.xs}`}
                    onClick={() => removeRow(idx)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {Object.entries(itemSchema.properties || {}).map(([itemKey, rawItemConfig]) => {
                const itemConfig = rawItemConfig as SchemaFieldConfig;
                const itemUi = (itemConfig.ui || {}) as SchemaFieldUiConfig;
                const itemLabel = itemUi.label || itemKey;
                const itemValue = item[itemKey];
                if (!shouldShowByVisibleIf(itemUi.visible_if, item)) return null;

                const arrayCell = renderArrayStringCell({
                  row: item,
                  rowIndex: idx,
                  itemKey,
                  itemConfig,
                  itemUi,
                  itemLabel,
                  itemValue,
                });
                if (arrayCell) return arrayCell;

                const updateValue = (nextValue: unknown) => {
                  const updatedItem = { ...item, [itemKey]: nextValue };
                  const next = [...safeValue];
                  next[idx] = updatedItem;
                  handleChange(fieldKey, next);
                };

                const sourceRef = resolveReferenceFromOptionsSource(itemUi.options_source);
                if (itemUi.reference || sourceRef) {
                  const refType = String(itemUi.reference || sourceRef);
                  const options = getRefOptions(parentReferenceOptions, referenceOptions, refType);
                  const mappedOptions = mapReferenceOptions(options, refType);
                  return (
                    <div key={itemKey} className="form-field mb-2">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <label className="block text-sm font-medium text-gray-700">{itemLabel}</label>
                        {canCreateReference && (
                          <button
                            type="button"
                            className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
                            onClick={() => handleCreateReference(refType, (id) => updateValue(id))}
                          >
                            Create new
                          </button>
                        )}
                      </div>
                      <SearchableSelect
                        value={String(itemValue ?? '')}
                        onChange={(val) => updateValue(val)}
                        options={mappedOptions}
                        placeholder={mappedOptions.length === 0 ? 'No options available' : `Select ${itemLabel}`}
                        disabled={mappedOptions.length === 0}
                      />
                      {isPriceTable && itemKey === 'item_id' && Boolean(itemValue) && (
                        <div className="mt-1 text-xs text-gray-500">
                          {(() => {
                            const opt = itemById.get(String(itemValue));
                            if (!opt) return null;
                            const base = toNumberOrNull(opt?.base_price);
                            if (base === null) return null;
                            return `Base Price: ${formatCompactNumber(base)}`;
                          })()}
                        </div>
                      )}
                    </div>
                  );
                }

                if (itemConfig.type === 'string' && itemUi.widget === 'select') {
                  const mappedOptions = mapSelectOptions(itemUi.options || itemConfig.enum || []);
                  return (
                    <div key={itemKey} className="form-field mb-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">{itemLabel}</label>
                      <SearchableSelect
                        value={String(itemValue ?? '')}
                        onChange={(val) => updateValue(val)}
                        options={mappedOptions}
                        placeholder={`Select ${itemLabel}`}
                        disabled={mappedOptions.length === 0}
                      />
                    </div>
                  );
                }

                if (itemConfig.type === 'number' || itemConfig.type === 'integer') {
                  const itemKeyPath = `${fieldKey}.${idx}.${itemKey}`;
                  const itemNumberType: NumberValueType = itemConfig.type === 'integer' ? 'integer' : 'number';
                  return (
                    <div key={itemKey} className="form-field mb-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">{itemLabel}</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        className={inputBaseClass}
                      value={getNumberInputValue(itemKeyPath, itemValue)}
                      onChange={(e) => handleNumberChange(itemKeyPath, e.target.value)}
                        onBlur={(e) =>
                          handleNumberBlur(itemKeyPath, e.target.value, itemNumberType, (val) => updateValue(val))
                        }
                        placeholder={getNumberPlaceholder(itemLabel, itemKey)}
                      />
                    </div>
                  );
                }

                if (itemConfig.type === 'boolean' || itemUi.widget === 'checkbox') {
                  return (
                    <div key={itemKey} className="form-field mb-2">
                      <label className="inline-flex items-center gap-2 text-gray-800">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-slate-700 accent-slate-600 focus:ring-slate-400"
                          checked={Boolean(itemValue)}
                          onChange={(e) => updateValue(e.target.checked)}
                        />
                        <span>{itemLabel}</span>
                      </label>
                    </div>
                  );
                }

                if (itemConfig.type === 'string' && itemUi.widget === 'textarea') {
                  const currentText = String(itemValue || '');
                  return (
                    <div key={itemKey} className="form-field mb-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">{itemLabel}</label>
                      <textarea
                        className={`${inputBaseClass} resize-y min-h-[80px]`}
                        value={currentText}
                        onChange={(e) => updateValue(e.target.value)}
                      />
                      <div className="mt-1 text-xs text-gray-500">{currentText.length} chars</div>
                    </div>
                  );
                }

                if (itemConfig.type === 'string' && itemUi.widget === 'date') {
                  return (
                    <div key={itemKey} className="form-field mb-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">{itemLabel}</label>
                      <input type="date" className={inputBaseClass} value={String(itemValue ?? '')} onChange={(e) => updateValue(e.target.value)} />
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
                        value={String(itemValue ?? '')}
                        onChange={(e) => updateValue(e.target.value)}
                      />
                    </div>
                  );
                }
                return null;
              })}
            </div>
          );
        })}

        <button
          type="button"
          className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`}
          onClick={addRow}
          aria-label={`Add ${label.slice(0, -1)}`}
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {isGenericTable ? 'Add Row' : `Add ${label.slice(0, -1)}`}
        </button>
      </div>
    </fieldset>
  );
}
