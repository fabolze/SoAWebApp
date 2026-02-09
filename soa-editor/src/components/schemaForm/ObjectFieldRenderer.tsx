import type { ReactNode } from 'react';

interface ObjectFieldRendererProps {
  fieldKey: string;
  label: string;
  description?: string;
  nestedProps: any;
  value: any;
  renderNestedForm: (fieldKey: string, nestedProps: any, value: any) => ReactNode;
}

export default function ObjectFieldRenderer({
  fieldKey,
  label,
  description,
  nestedProps,
  value,
  renderNestedForm,
}: ObjectFieldRendererProps) {
  return (
    <fieldset key={fieldKey} className="border border-gray-200 rounded-lg p-4 bg-gray-50 mb-6 shadow-sm">
      <legend className="px-2 text-base font-semibold text-primary mb-2">{label}</legend>
      {description && <p className="text-sm text-gray-500">{description}</p>}
      <div className="mt-3">{renderNestedForm(fieldKey, nestedProps, value)}</div>
    </fieldset>
  );
}
