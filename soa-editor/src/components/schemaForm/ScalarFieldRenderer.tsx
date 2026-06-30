import type { ReactNode } from 'react';
import type { NumberInputFormat, NumberValueType } from './helpers';
import type { SchemaFieldUiConfig } from './types';

interface ScalarFieldRendererProps {
  fieldKey: string;
  type: string;
  ui: SchemaFieldUiConfig;
  label: string;
  description?: string;
  value: unknown;
  inputBaseClass: string;
  handleChange: (key: string, value: unknown) => void;
  getNumberInputValue: (key: string, value: unknown, inputFormat?: NumberInputFormat) => string;
  handleNumberChange: (key: string, raw: string, inputFormat?: NumberInputFormat) => void;
  handleNumberBlur: (
    key: string,
    raw: string,
    valueType: NumberValueType,
    inputFormat?: NumberInputFormat,
    applyChange?: (val: number | '') => void
  ) => void;
  getNumberPlaceholder: (labelText: string, keyName?: string, inputFormat?: NumberInputFormat) => string;
  renderFieldLabel: (label: string, description?: string, action?: ReactNode) => ReactNode;
}

export default function ScalarFieldRenderer({
  fieldKey,
  type,
  ui,
  label,
  description,
  value,
  inputBaseClass,
  handleChange,
  getNumberInputValue,
  handleNumberChange,
  handleNumberBlur,
  getNumberPlaceholder,
  renderFieldLabel,
}: ScalarFieldRendererProps) {
  if (type === 'boolean' || ui.widget === 'checkbox') {
    return (
      <div key={fieldKey} className="form-field">
        {renderFieldLabel(label, description)}
        <label className="inline-flex items-center gap-2 text-gray-800 dark:text-slate-200">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-slate-700 accent-slate-600 focus:ring-slate-400"
            checked={Boolean(value)}
            onChange={(e) => handleChange(fieldKey, e.target.checked)}
          />
          <span>Enabled</span>
        </label>
      </div>
    );
  }

  const valueType: NumberValueType = type === 'integer' ? 'integer' : 'number';
  const inputFormat: NumberInputFormat = ui.number_format === 'dragon_era_year' ? 'dragon_era_year' : 'standard';
  return (
    <div key={fieldKey} className="form-field">
      {renderFieldLabel(label, description)}
      <input
        type="text"
        inputMode="decimal"
        className={inputBaseClass}
        value={getNumberInputValue(fieldKey, value, inputFormat)}
        onChange={(e) => handleNumberChange(fieldKey, e.target.value, inputFormat)}
        onBlur={(e) => handleNumberBlur(fieldKey, e.target.value, valueType, inputFormat, (val) => handleChange(fieldKey, val))}
        placeholder={getNumberPlaceholder(label, fieldKey, inputFormat)}
      />
    </div>
  );
}
