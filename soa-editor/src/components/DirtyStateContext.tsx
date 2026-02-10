import { createContext, useCallback, useMemo, useState } from "react";

type DirtySources = Record<string, true>;

interface DirtyStateContextValue {
  isDirty: boolean;
  setDirty: (sourceId: string, dirty: boolean) => void;
  confirmNavigate: () => boolean;
}

export const DirtyStateContext = createContext<DirtyStateContextValue | null>(null);

export function DirtyStateProvider({ children }: { children: React.ReactNode }) {
  const [dirtySources, setDirtySources] = useState<DirtySources>({});

  const setDirty = useCallback((sourceId: string, dirty: boolean) => {
    if (!sourceId) return;
    setDirtySources((prev) => {
      const exists = !!prev[sourceId];
      if (dirty && exists) return prev;
      if (!dirty && !exists) return prev;

      const next = { ...prev };
      if (dirty) {
        next[sourceId] = true;
      } else {
        delete next[sourceId];
      }
      return next;
    });
  }, []);

  const isDirty = useMemo(() => Object.keys(dirtySources).length > 0, [dirtySources]);

  const confirmNavigate = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm("You have unsaved changes. Discard them?");
  }, [isDirty]);

  const value = useMemo(
    () => ({
      isDirty,
      setDirty,
      confirmNavigate,
    }),
    [isDirty, setDirty, confirmNavigate]
  );

  return <DirtyStateContext.Provider value={value}>{children}</DirtyStateContext.Provider>;
}
