import React, { useCallback, useMemo, useState } from 'react';
import SchemaForm from './SchemaForm';
import { generateUlid, generateSlug } from '../utils/generateId';
import {
  EditorStackContext,
  ParentSummary,
  OpenEditorArgs,
  CreatedResult,
} from './EditorStackContext';
import { apiFetch } from '../lib/api';
import { BUTTON_CLASSES, BUTTON_SIZES } from '../styles/uiTokens';
import { asRecord, type EntryData, type SchemaDefinition } from './schemaForm/types';

type StackItem = OpenEditorArgs & {
  id: string;
  resolve: (result: CreatedResult | null) => void;
};

function getSummaryFields(data: EntryData) {
  const candidates = ['name', 'title', 'slug', 'id', 'type'];
  const fields = candidates
    .filter((key) => data[key] !== undefined && data[key] !== '')
    .map((key) => ({ label: key, value: String(data[key]) }));
  return fields.slice(0, 4);
}

function ParentSummaryPanel({ summary }: { summary: ParentSummary }) {
  const fields = getSummaryFields(summary.data || {});
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="font-semibold text-slate-700 mb-2">Parent entry</div>
      <div className="text-slate-600 mb-2">{summary.title}</div>
      {fields.length > 0 ? (
        <div className="grid grid-cols-1 gap-1">
          {fields.map((f) => (
            <div key={f.label} className="flex items-center gap-2">
              <span className="text-slate-500 w-20">{f.label}</span>
              <span className="text-slate-800 truncate">{f.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-slate-500">No details yet.</div>
      )}
    </div>
  );
}

function InlineSchemaEditor({
  schemaName,
  apiPath,
  parentSummary,
  onClose,
  onSaved,
}: {
  schemaName: string;
  apiPath: string;
  parentSummary?: ParentSummary;
  onClose: () => void;
  onSaved: (result: CreatedResult) => void;
}) {
  const [schema, setSchema] = useState<SchemaDefinition | null>(null);
  const [data, setData] = useState<EntryData>({ id: generateUlid() });
  const [formValid, setFormValid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    let isCancelled = false;
    void import(`../../../backend/app/schemas/${schemaName}.json`)
      .then((loaded: unknown) => {
        if (isCancelled) return;
        const maybeModule = loaded as { default?: unknown };
        const resolved = maybeModule.default ?? loaded;
        setSchema(asRecord(resolved) as SchemaDefinition);
      })
      .catch(() => {
        if (isCancelled) return;
        setSchema({ properties: {} });
      });
    return () => {
      isCancelled = true;
    };
  }, [schemaName]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: EntryData = { ...data };
      const payloadSlug = typeof payload.slug === 'string' ? payload.slug : '';
      const payloadName = typeof payload.name === 'string' ? payload.name : '';
      if (!payloadSlug && payloadName) {
        payload.slug = generateSlug(payloadName);
      }
      const res = await apiFetch(`/api/${apiPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let msg = 'Save failed';
        try {
          const err = asRecord(await res.json());
          if (typeof err.message === 'string' && err.message.trim()) msg += `: ${err.message}`;
        } catch {
          // Ignore invalid JSON error payloads.
        }
        throw new Error(msg);
      }
      const savedId = typeof payload.id === 'string' ? payload.id : String(payload.id ?? '');
      if (!savedId) {
        throw new Error('Save failed: entry has no ID');
      }
      onSaved({ id: savedId, data: payload });
    } catch (e: unknown) {
      const message = e instanceof Error && e.message ? e.message : 'Save failed';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (!schema) {
    return <div className="p-6">Loading schema...</div>;
  }

  const headerTitle = typeof schema?.title === 'string' ? schema.title : schemaName;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="text-lg font-semibold text-slate-900">{headerTitle}</div>
        {parentSummary && <div className="mt-3"><ParentSummaryPanel summary={parentSummary} /></div>}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 rounded bg-red-50 text-red-700 p-2 text-sm">{error}</div>}
        <SchemaForm
          schema={schema}
          data={data}
          onChange={setData}
          isValidCallback={setFormValid}
          parentSummary={parentSummary}
        />
      </div>
      <div className="p-4 border-t flex items-center gap-2 justify-end">
        <button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`} onClick={onClose}>
          Cancel
        </button>
        <button
          className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`}
          onClick={handleSave}
          disabled={!formValid || saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function EditorDrawer({
  item,
  zIndex,
  isTop,
  onClose,
  onSaved,
}: {
  item: StackItem;
  zIndex: number;
  isTop: boolean;
  onClose: () => void;
  onSaved: (result: CreatedResult) => void;
}) {
  return (
    <div className="fixed inset-0 flex" style={{ zIndex }}>
      {isTop && <div className="absolute inset-0 bg-black/40" onClick={onClose} />}
      <div className="ml-auto h-full w-full max-w-2xl bg-white text-slate-900 shadow-2xl relative">
        <InlineSchemaEditor
          schemaName={item.schemaName}
          apiPath={item.apiPath}
          parentSummary={item.parentSummary}
          onClose={onClose}
          onSaved={onSaved}
        />
      </div>
    </div>
  );
}

export function EditorStackProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<StackItem[]>([]);

  const openEditor = useCallback((args: OpenEditorArgs) => {
    return new Promise<CreatedResult | null>((resolve) => {
      setStack((prev) => [
        ...prev,
        {
          id: generateUlid(),
          ...args,
          resolve,
        },
      ]);
    });
  }, []);

  const closeTop = useCallback((result?: CreatedResult | null) => {
    setStack((prev) => {
      if (prev.length === 0) return prev;
      const top = prev[prev.length - 1];
      top.resolve(result ?? null);
      return prev.slice(0, -1);
    });
  }, []);

  const ctxValue = useMemo(() => ({ openEditor }), [openEditor]);

  return (
    <EditorStackContext.Provider value={ctxValue}>
      {children}
      {stack.map((item, index) => (
        <EditorDrawer
          key={item.id}
          item={item}
          zIndex={50 + index * 10}
          isTop={index === stack.length - 1}
          onClose={() => closeTop(null)}
          onSaved={(result) => closeTop(result)}
        />
      ))}
    </EditorStackContext.Provider>
  );
}
