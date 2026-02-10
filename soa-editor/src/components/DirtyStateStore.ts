import { createContext } from "react";

type DirtySources = Record<string, true>;

export interface DirtyStateContextValue {
  isDirty: boolean;
  setDirty: (sourceId: string, dirty: boolean) => void;
  confirmNavigate: () => boolean;
}

export const DirtyStateContext = createContext<DirtyStateContextValue | null>(null);

export type { DirtySources };
