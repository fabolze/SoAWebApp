import React, { useCallback, useMemo, useState } from 'react';
import SchemaForm from './SchemaForm';
import { generateUlid, generateSlug } from '../utils/generateId';
import {
  EditorStackContext,
  ParentSummary,
  OpenEditorArgs,
  CreatedResult,
} from './EditorStackContext';

type StackItem = OpenEditorArgs & {
  id: string;
  resolve: (result: CreatedResult | null) => void;
};

function getSummaryFields(data: Record<string, any>) {
  const candidates = ['name', 'title', 'slug', 'id', 'type'];
  const fields = candidates
    .filter((key) => data && data[key] !== undefined && data[key] !== '')
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
  const [schema, setSchema] = useState<any | null>(null);
  const [data, setData] = useState<any>({ id: generateUlid() });
  const [formValid, setFormValid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    import(`../../../backend/app/schemas/${schemaName}.json`).then(setSchema);
  }, [schemaName]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = { ...data };
      if (!payload.slug && payload.name) {
        payload.slug = generateSlug(payload.name);
      }
      const res = await fetch(`http://localhost:5000/api/${apiPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let msg = 'Save failed';
        try {
          const err = await res.json();
          if (err && err.message) msg += `: ${err.message}`;
        } catch {}
        throw new Error(msg);
      }
      onSaved({ id: payload.id, data: payload });
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!schema) {
    return <div className="p-6">Loading schema...</div>;
  }

  const headerTitle = schema?.title || schemaName;

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
        <button className="px-3 py-2 rounded border border-slate-300" onClick={onClose}>
          Cancel
        </button>
        <button
          className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
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
