import type { Dispatch, ReactNode, SetStateAction } from 'react';
import SearchableSelect from '../SearchableSelect';
import ReferenceSelectField from '../SchemaFields/ReferenceSelectField';
import { mapSelectOptions, resolveReferenceFromOptionsSource } from './helpers';
import type {
  EntryData,
  ReferenceOptionsMap,
  SchemaFieldConfig,
  SchemaFieldUiConfig,
} from './types';

interface StringFieldRendererProps {
  fieldKey: string;
  idField?: string;
  ui: SchemaFieldUiConfig;
  config: SchemaFieldConfig;
  label: string;
  description?: string;
  value: unknown;
  inputBaseClass: string;
  parentReferenceOptions?: ReferenceOptionsMap;
  referenceOptions: ReferenceOptionsMap;
  createdLabels: Record<string, { id: string; label: string }>;
  setCreatedLabels: Dispatch<SetStateAction<Record<string, { id: string; label: string }>>>;
  previewUrls: Record<string, string>;
  setPreviewUrls: Dispatch<SetStateAction<Record<string, string>>>;
  canCreateReference: boolean;
  handleChange: (key: string, value: unknown) => void;
  handleCreateReference: (
    refType: string,
    onSelect: (id: string, createdData: EntryData) => void
  ) => Promise<void>;
  fetchReferenceAutocomplete: (refType: string, search: string) => Promise<unknown[]>;
  renderFieldLabel: (label: string, description?: string, action?: ReactNode) => ReactNode;
}

export default function StringFieldRenderer({
  fieldKey,
  idField,
  ui,
  config,
  label,
  description,
  value,
  inputBaseClass,
  parentReferenceOptions,
  referenceOptions,
  createdLabels,
  setCreatedLabels,
  previewUrls,
  setPreviewUrls,
  canCreateReference,
  handleChange,
  handleCreateReference,
  fetchReferenceAutocomplete,
  renderFieldLabel,
}: StringFieldRendererProps) {
  if (ui.widget === 'hidden') return null;

  const sourceRefType = resolveReferenceFromOptionsSource(ui.options_source);
  if (ui.reference || sourceRefType) {
    const refType = String(ui.reference || sourceRefType);
    const refOptions = (parentReferenceOptions || referenceOptions)[refType] || [];
    const useAutocomplete = !ui.options && (!refOptions || refOptions.length > 50);
    const handleCreateReferenceForField = async () => {
      if (!canCreateReference) return null;
      let created: { id: string; label?: string } | null = null;
      await handleCreateReference(refType, (id, createdData) => {
        const labelValue = createdData?.name || createdData?.title || createdData?.slug || createdData?.id;
        created = { id, label: labelValue ? String(labelValue) : undefined };
      });
      return created;
    };
    const valueLabel = createdLabels[fieldKey]?.id === value ? createdLabels[fieldKey]?.label : undefined;
    return (
      <ReferenceSelectField
        key={fieldKey}
        label={label}
        description={description}
        value={String(value ?? '')}
        refType={refType}
        options={refOptions}
        useAutocomplete={useAutocomplete}
        valueLabel={valueLabel}
        canCreate={canCreateReference}
        onCreateReference={canCreateReference ? handleCreateReferenceForField : undefined}
        onCreatedLabel={(id, labelText) => {
          setCreatedLabels((prev) => ({ ...prev, [fieldKey]: { id, label: labelText } }));
        }}
        onChange={(val) => handleChange(fieldKey, val)}
        fetchReferenceAutocomplete={fetchReferenceAutocomplete}
        renderFieldLabel={renderFieldLabel}
      />
    );
  }

  if (ui.widget === 'select') {
    const selectOptions = (ui.options as unknown[] | undefined) || config.enum || [];
    const mappedOptions = mapSelectOptions(selectOptions || []);
    return (
      <div key={fieldKey} className="form-field">
        {renderFieldLabel(label, description)}
        <SearchableSelect
          value={String(value ?? '')}
          onChange={(val) => handleChange(fieldKey, val)}
          options={mappedOptions}
          placeholder={`Select ${label}`}
          disabled={mappedOptions.length === 0}
        />
      </div>
    );
  }

  if (ui.widget === 'textarea') {
    const currentText = String(value || '');
    return (
      <div key={fieldKey} className="form-field">
        {renderFieldLabel(label, description)}
        <textarea
          className={`${inputBaseClass} resize-y min-h-[100px] max-h-[300px]`}
          value={currentText}
          onChange={(e) => handleChange(fieldKey, e.target.value)}
          placeholder={`Enter ${label.toLowerCase()}...`}
        />
        <div className="mt-1 text-xs text-gray-500">{currentText.length} chars</div>
      </div>
    );
  }

  if (ui.widget === 'date') {
    return (
      <div key={fieldKey} className="form-field">
        {renderFieldLabel(label, description)}
        <input
          type="date"
          className={inputBaseClass}
          value={String(value ?? '')}
          onChange={(e) => handleChange(fieldKey, e.target.value)}
        />
      </div>
    );
  }

  if (fieldKey === idField) {
    return (
      <div key={fieldKey} className="form-field">
        {renderFieldLabel(label, description)}
        <input
          type="text"
          className={inputBaseClass + ' bg-gray-100 text-gray-500 cursor-not-allowed'}
          value={String(value ?? '')}
          readOnly
          tabIndex={-1}
          style={{ pointerEvents: 'none' }}
        />
      </div>
    );
  }

  if (ui.widget === 'filepicker') {
    return (
      <div key={fieldKey} className="form-field">
        {renderFieldLabel(label, description)}
        <input
          type="file"
          className={inputBaseClass}
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            handleChange(fieldKey, file.name);
            const reader = new FileReader();
            reader.onload = (ev) => {
              const url = ev.target?.result as string;
              setPreviewUrls((prev) => ({ ...prev, [fieldKey]: url }));
            };
            reader.readAsDataURL(file);
          }}
        />
        {typeof value === 'string' && value.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) && previewUrls[fieldKey] && (
          <div className="mt-2 flex items-center gap-2">
            <img src={previewUrls[fieldKey]} alt="preview" style={{ maxHeight: '60px' }} />
            <button
              type="button"
              className="ml-2 px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-xs"
              onClick={() => {
                handleChange(fieldKey, '');
                setPreviewUrls((prev) => {
                  const copy = { ...prev };
                  delete copy[fieldKey];
                  return copy;
                });
              }}
            >
              Remove
            </button>
          </div>
        )}
        {typeof value === 'string' && !value.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-gray-500">{String(value)}</span>
            <button
              type="button"
              className="ml-2 px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-xs"
              onClick={() => {
                handleChange(fieldKey, '');
                setPreviewUrls((prev) => {
                  const copy = { ...prev };
                  delete copy[fieldKey];
                  return copy;
                });
              }}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div key={fieldKey} className="form-field">
      {renderFieldLabel(label, description)}
      <input
        type="text"
        className={inputBaseClass}
        value={String(value ?? '')}
        onChange={(e) => handleChange(fieldKey, e.target.value)}
        placeholder={`Enter ${label.toLowerCase()}...`}
      />
    </div>
  );
}
