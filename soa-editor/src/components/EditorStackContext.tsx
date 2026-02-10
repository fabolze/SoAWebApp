import { createContext, useContext } from 'react';
import type { EntryData } from './schemaForm/types';

export type ParentSummary = {
  title: string;
  data: EntryData;
};

export type OpenEditorArgs = {
  schemaName: string;
  apiPath: string;
  parentSummary?: ParentSummary;
};

export type CreatedResult = {
  id: string;
  data: EntryData;
};

export type EditorStackContextValue = {
  openEditor: (args: OpenEditorArgs) => Promise<CreatedResult | null>;
};

export const EditorStackContext = createContext<EditorStackContextValue | null>(null);

export function useEditorStack() {
  return useContext(EditorStackContext);
}
