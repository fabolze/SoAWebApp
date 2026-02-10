import type { ReactNode } from 'react';
import ArrayStringMultiSelectField from '../SchemaFields/ArrayStringMultiSelectField';
import TagInput from '../TagInput';
import { resolveReferenceFromOptionsSource } from './helpers';
import type {
  EntryData,
  ReferenceOptionsMap,
  SchemaFieldConfig,
  SchemaFieldUiConfig,
} from './types';

interface ArrayStringFieldRendererProps {
  fieldKey: string;
  ui: SchemaFieldUiConfig;
  config: SchemaFieldConfig;
  label: string;
  description?: string;
  value: unknown;
  parentReferenceOptions?: ReferenceOptionsMap;
  referenceOptions: ReferenceOptionsMap;
  canCreateReference: boolean;
  recentlyAdded: Record<string, string>;
  handleChange: (key: string, value: unknown) => void;
  markRecentlyAdded: (key: string, id: string) => void;
  handleCreateReference: (
    refType: string,
    onSelect: (id: string, createdData: EntryData) => void
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
        value={Array.isArray(value) ? value.map((tag) => String(tag)) : typeof value === 'string' ? value : []}
        onChange={(tags) => handleChange(fieldKey, tags)}
        label={label}
        placeholder={description || 'Add a tag...'}
        disabled={ui.disabled}
      />
    );
  }

  let options: unknown[] = [];
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
    options = ui.options.map((opt) => ({ id: String(opt), name: String(opt) }));
  } else if (Array.isArray(config.items?.enum)) {
    options = config.items.enum.map((opt) => ({ id: String(opt), name: String(opt) }));
  } else if (Array.isArray(config.enum)) {
    options = config.enum.map((opt) => ({ id: String(opt), name: String(opt) }));
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
