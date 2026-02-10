import type { ReactNode } from 'react';
import type { NumberValueType } from './helpers';
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
        <label className="inline-flex items-center gap-2 text-gray-800">
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
  return (
    <div key={fieldKey} className="form-field">
      {renderFieldLabel(label, description)}
      <input
        type="text"
        inputMode="decimal"
        className={inputBaseClass}
        value={getNumberInputValue(fieldKey, value)}
        onChange={(e) => handleNumberChange(fieldKey, e.target.value)}
        onBlur={(e) => handleNumberBlur(fieldKey, e.target.value, valueType, (val) => handleChange(fieldKey, val))}
        placeholder={getNumberPlaceholder(label, fieldKey)}
      />
    </div>
  );
}
