import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Autocomplete from '../Autocomplete';
import SearchableSelect from '../SearchableSelect';
import { BUTTON_CLASSES, BUTTON_SIZES } from '../../styles/uiTokens';
import { getReferenceOptionLabel, getReferenceOptionValue } from '../schemaForm/helpers';
import ReferenceDetailsCard from './ReferenceDetailsCard';
import FloatingReferenceInspector from './FloatingReferenceInspector';

interface ReferenceSelectFieldProps {
  label: string;
  description?: string;
  value: string | null;
  refType: string;
  options: unknown[];
  useAutocomplete: boolean;
  valueLabel?: string;
  canCreate?: boolean;
  onCreateReference?: () => Promise<{ id: string; label?: string } | null>;
  onCreatedLabel?: (id: string, label: string) => void;
  onChange: (value: string | null) => void;
  fetchReferenceAutocomplete: (refType: string, search: string) => Promise<unknown[]>;
  fetchReferenceById?: (refType: string, id: string) => Promise<unknown | null>;
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
  fetchReferenceById,
  renderFieldLabel,
}: ReferenceSelectFieldProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<unknown | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewCacheRef = useRef<Map<string, unknown>>(new Map());
  const requestSeqRef = useRef(0);
  const inspectorIdRef = useRef(`ref-inspector-${Math.random().toString(36).slice(2)}`);
  const safeOptions = Array.isArray(options) ? options : [];
  const mappedOptions = safeOptions.map((opt) => {
    return {
      label: getReferenceOptionLabel(opt, refType),
      value: getReferenceOptionValue(opt, refType),
    };
  });
  const selectedId = value ? String(value) : '';
  const selectedEntryFromOptions = useMemo(
    () => safeOptions.find((opt) => getReferenceOptionValue(opt, refType) === selectedId) ?? null,
    [refType, safeOptions, selectedId]
  );

  useEffect(() => {
    safeOptions.forEach((opt) => {
      const optionId = getReferenceOptionValue(opt, refType);
      if (optionId) {
        previewCacheRef.current.set(optionId, opt);
      }
    });
  }, [refType, safeOptions]);

  useEffect(() => {
    const onInspectorOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (!detail?.id || detail.id === inspectorIdRef.current) return;
      setPreviewOpen(false);
    };
    window.addEventListener('soa:reference-inspector-open', onInspectorOpen as EventListener);
    return () => {
      window.removeEventListener('soa:reference-inspector-open', onInspectorOpen as EventListener);
    };
  }, []);

  const handleTogglePreview = () => {
    setPreviewOpen((prev) => {
      const next = !prev;
      if (next) {
        window.dispatchEvent(
          new CustomEvent('soa:reference-inspector-open', {
            detail: { id: inspectorIdRef.current },
          })
        );
      }
      return next;
    });
  };

  const handleCreate = async () => {
    if (!onCreateReference) return;
    const created = await onCreateReference();
    if (!created?.id) return;
    onChange(created.id);
    if (created.label && onCreatedLabel) {
      onCreatedLabel(created.id, created.label);
    }
  };

  useEffect(() => {
    if (!previewOpen) return;
    if (!selectedId) {
      setPreviewEntry(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    const cached = previewCacheRef.current.get(selectedId);
    if (cached) {
      setPreviewEntry(cached);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    if (selectedEntryFromOptions) {
      previewCacheRef.current.set(selectedId, selectedEntryFromOptions);
      setPreviewEntry(selectedEntryFromOptions);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    if (!fetchReferenceById) {
      setPreviewEntry(null);
      setPreviewError('Unable to load details for this selection.');
      setPreviewLoading(false);
      return;
    }

    const requestId = ++requestSeqRef.current;
    setPreviewLoading(true);
    setPreviewError(null);
    void fetchReferenceById(refType, selectedId)
      .then((item) => {
        if (requestId !== requestSeqRef.current) return;
        if (item) {
          previewCacheRef.current.set(selectedId, item);
          setPreviewEntry(item);
          setPreviewError(null);
        } else {
          setPreviewEntry(null);
          setPreviewError('No preview data found for this entry.');
        }
      })
      .catch(() => {
        if (requestId !== requestSeqRef.current) return;
        setPreviewEntry(null);
        setPreviewError('Failed to load details.');
      })
      .finally(() => {
        if (requestId === requestSeqRef.current) {
          setPreviewLoading(false);
        }
      });
  }, [fetchReferenceById, previewOpen, refType, selectedEntryFromOptions, selectedId]);

  const previewAction = (
    <button
      type="button"
      className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs} whitespace-nowrap`}
      onClick={handleTogglePreview}
      disabled={!selectedId}
      title={selectedId ? 'Inspect selected entry details' : 'Select an entry first'}
    >
      {previewOpen ? 'Hide peek' : 'Quick peek'}
    </button>
  );

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
              getOptionLabel={(opt) => getReferenceOptionLabel(opt, refType)}
              getOptionValue={(opt) => getReferenceOptionValue(opt, refType)}
              placeholder={`Search ${label}...`}
              disabled={false}
              description={description}
              valueLabel={valueLabel}
              hideLabel
              hideDescription
            />
          </div>
          <div className="flex flex-col items-end gap-1">
            {previewAction}
            {inlineCreate}
          </div>
        </div>
        <FloatingReferenceInspector
          open={previewOpen}
          title={label}
          subtitle={selectedId || undefined}
          onClose={() => setPreviewOpen(false)}
        >
          {!selectedId ? (
            <div className="text-xs text-slate-500">Select an entry to preview details.</div>
          ) : previewLoading ? (
            <div className="text-xs text-slate-500">Loading details...</div>
          ) : previewEntry ? (
            <ReferenceDetailsCard entry={previewEntry} refType={refType} />
          ) : (
            <div className="text-xs text-amber-700">{previewError || 'No details available.'}</div>
          )}
        </FloatingReferenceInspector>
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
        <div className="flex flex-col items-end gap-1">
          {previewAction}
          {inlineCreate}
        </div>
      </div>
      <FloatingReferenceInspector
        open={previewOpen}
        title={label}
        subtitle={selectedId || undefined}
        onClose={() => setPreviewOpen(false)}
      >
        {!selectedId ? (
          <div className="text-xs text-slate-500">Select an entry to preview details.</div>
        ) : previewLoading ? (
          <div className="text-xs text-slate-500">Loading details...</div>
        ) : previewEntry ? (
          <ReferenceDetailsCard entry={previewEntry} refType={refType} />
        ) : (
          <div className="text-xs text-amber-700">{previewError || 'No details available.'}</div>
        )}
      </FloatingReferenceInspector>
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
