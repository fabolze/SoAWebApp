import type { ReactNode } from 'react';

interface FieldLabelProps {
  label: string;
  description?: string;
  action?: ReactNode;
}

export default function FieldLabel({ label, description, action }: FieldLabelProps) {
  return (
    <div className="mb-1 flex items-start justify-between gap-2">
      <div>
        <span className="font-medium text-gray-800">{label}</span>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}
