export type DlgSeverity = "error" | "warning";
export interface DlgSpan { line: number; column: number; endColumn: number }
export interface DlgDiagnostic { code: string; message: string; severity: DlgSeverity; span: DlgSpan }
export interface DlgChoice { text: string; target: string; span: DlgSpan }
export interface DlgNode { label: string; speaker: string; text: string; choices: DlgChoice[]; continuation?: string; terminal: boolean; span: DlgSpan }
export interface DlgDocument {
  version: 1;
  title: string;
  slug?: string;
  owner?: string;
  location?: string;
  direction?: string;
  start: string;
  nodes: DlgNode[];
}
export interface DlgParseResult { document?: DlgDocument; diagnostics: DlgDiagnostic[]; source: string }
