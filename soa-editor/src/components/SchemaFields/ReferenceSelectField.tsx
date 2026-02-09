import type { ReactNode } from 'react';
import Autocomplete from '../Autocomplete';
import SearchableSelect from '../SearchableSelect';
import { BUTTON_CLASSES, BUTTON_SIZES } from '../../styles/uiTokens';

interface ReferenceSelectFieldProps {
  label: string;
  description?: string;
  value: string | null;
  refType: string;
  options: any[];
  useAutocomplete: boolean;
  valueLabel?: string;
  canCreate?: boolean;
  onCreateReference?: () => Promise<{ id: string; label?: string } | null>;
  onCreatedLabel?: (id: string, label: string) => void;
  onChange: (value: string | null) => void;
  fetchReferenceAutocomplete: (refType: string, search: string) => Promise<any[]>;
  renderFieldLabel: (label: string, description?: string, action?: ReactNode) => ReactNode;
}

export default function ReferenceSelectField({
  label,
  description,
  value,
  refType,
  options,
  useAutocomplete,
  valueLabel,
  canCreate,
  onCreateReference,
  onCreatedLabel,
  onChange,
  fetchReferenceAutocomplete,
  renderFieldLabel,
}: ReferenceSelectFieldProps) {
  const safeOptions = Array.isArray(options) ? options : [];
  const mappedOptions = safeOptions.map((opt: any) => {
    const labelText = opt?.name || opt?.title || opt?.id || opt?.[`${refType.slice(0, -1)}_id`] || opt?.[`${refType}_id`] || JSON.stringify(opt);
    const valueText = opt?.id || opt?.[`${refType.slice(0, -1)}_id`] || opt?.[`${refType}_id`] || opt;
    return { label: String(labelText), value: String(valueText) };
  });

  const handleCreate = async () => {
    if (!onCreateReference) return;
    const created = await onCreateReference();
    if (!created?.id) return;
    onChange(created.id);
    if (created.label && onCreatedLabel) {
      onCreatedLabel(created.id, created.label);
    }
  };

  const inlineCreate = canCreate ? (
    <button
      type="button"
      className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs} whitespace-nowrap`}
      onClick={handleCreate}
    >
      Create new
    </button>
  ) : null;

  if (useAutocomplete) {
    return (
      <div className="form-field">
        {renderFieldLabel(label, description)}
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Autocomplete
              label={label}
              value={value || ''}
              onChange={(val) => onChange(val)}
              fetchOptions={(search) => fetchReferenceAutocomplete(refType, search)}
              getOptionLabel={(opt) => opt.name || opt.title || opt.id || opt[`${refType.slice(0, -1)}_id`] || opt[`${refType}_id`] || JSON.stringify(opt)}
              getOptionValue={(opt) => opt.id || opt[`${refType.slice(0, -1)}_id`] || opt[`${refType}_id`] || opt}
              placeholder={`Search ${label}...`}
              disabled={false}
              description={description}
              valueLabel={valueLabel}
              hideLabel
              hideDescription
            />
          </div>
          {inlineCreate}
        </div>
      </div>
    );
  }

  const showEmptyCreate = safeOptions.length === 0 && canCreate;

  return (
    <div className="form-field">
      {renderFieldLabel(label, description)}
      <div className="flex items-start gap-2">
        <div className="relative flex-1">
          <SearchableSelect
            value={value || ''}
            onChange={(val) => onChange(val)}
            options={mappedOptions}
            placeholder={safeOptions.length === 0 ? 'No options available' : `Select ${label}`}
            disabled={safeOptions.length === 0}
            valueLabel={valueLabel}
          />
        </div>
        {inlineCreate}
      </div>
      {showEmptyCreate && (
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
          <span>No options yet.</span>
          <button
            type="button"
            className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`}
            onClick={handleCreate}
          >
            Create new
          </button>
        </div>
      )}
    </div>
  );
}
