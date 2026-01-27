import { createContext, useContext } from 'react';

export type ParentSummary = {
  title: string;
  data: Record<string, any>;
};

export type OpenEditorArgs = {
  schemaName: string;
  apiPath: string;
  parentSummary?: ParentSummary;
};

export type CreatedResult = {
  id: string;
  data: Record<string, any>;
};

export type EditorStackContextValue = {
  openEditor: (args: OpenEditorArgs) => Promise<CreatedResult | null>;
};

export const EditorStackContext = createContext<EditorStackContextValue | null>(null);

export function useEditorStack() {
  return useContext(EditorStackContext);
}
