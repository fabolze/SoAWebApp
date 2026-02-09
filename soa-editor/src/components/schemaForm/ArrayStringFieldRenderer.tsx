import type { ReactNode } from 'react';
import ArrayStringMultiSelectField from '../SchemaFields/ArrayStringMultiSelectField';
import TagInput from '../TagInput';
import { resolveReferenceFromOptionsSource } from './helpers';

interface ArrayStringFieldRendererProps {
  fieldKey: string;
  ui: any;
  config: any;
  label: string;
  description?: string;
  value: any;
  parentReferenceOptions?: Record<string, any[]>;
  referenceOptions: Record<string, any[]>;
  canCreateReference: boolean;
  recentlyAdded: Record<string, string>;
  handleChange: (key: string, value: any) => void;
  markRecentlyAdded: (key: string, id: string) => void;
  handleCreateReference: (
    refType: string,
    onSelect: (id: string, createdData: Record<string, any>) => void
  ) => Promise<void>;
  renderFieldLabel: (label: string, description?: string, action?: ReactNode) => ReactNode;
}

export default function ArrayStringFieldRenderer({
  fieldKey,
  ui,
  config,
  label,
  description,
  value,
  parentReferenceOptions,
  referenceOptions,
  canCreateReference,
  recentlyAdded,
  handleChange,
  markRecentlyAdded,
  handleCreateReference,
  renderFieldLabel,
}: ArrayStringFieldRendererProps) {
  if (ui.widget === 'tags') {
    return (
      <TagInput
        key={fieldKey}
        value={value || []}
        onChange={(tags) => handleChange(fieldKey, tags)}
        label={label}
        placeholder={description || 'Add a tag...'}
        disabled={ui.disabled}
      />
    );
  }

  let options: any[] = [];
  let refType: string | null = null;
  if (ui.reference) {
    const referenceType = String(ui.reference);
    refType = referenceType;
    const refList = (parentReferenceOptions || referenceOptions)[referenceType] || [];
    options = refList;
  } else if (ui.options_source) {
    const sourceRef = resolveReferenceFromOptionsSource(ui.options_source);
    if (sourceRef) {
      refType = sourceRef;
      const refList = (parentReferenceOptions || referenceOptions)[sourceRef] || [];
      options = refList;
    }
  } else if (ui.options) {
    options = ui.options.map((opt: string) => ({ id: opt, name: opt }));
  } else if (Array.isArray(config.items?.enum)) {
    options = config.items.enum.map((opt: string) => ({ id: opt, name: opt }));
  } else if (Array.isArray(config.enum)) {
    options = config.enum.map((opt: string) => ({ id: opt, name: opt }));
  }

  const onCreateReference =
    refType && canCreateReference
      ? async () => {
          let createdId: string | null = null;
          await handleCreateReference(refType, (id) => {
            createdId = id;
          });
          return createdId;
        }
      : undefined;

  return (
    <ArrayStringMultiSelectField
      key={fieldKey}
      label={label}
      description={description}
      value={Array.isArray(value) ? value : []}
      options={options}
      refType={refType}
      recentlyAddedId={recentlyAdded[fieldKey]}
      onChange={(next) => handleChange(fieldKey, next)}
      onCreateReference={onCreateReference}
      onMarkRecentlyAdded={(id) => markRecentlyAdded(fieldKey, id)}
      renderFieldLabel={renderFieldLabel}
    />
  );
}
