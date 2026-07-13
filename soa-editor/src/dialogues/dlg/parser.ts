import type { DlgChoice, DlgDiagnostic, DlgDocument, DlgNode, DlgParseResult, DlgSpan } from "./types";

export const DLG_LIMITS = { characters: 200_000, lines: 5_000, nodes: 500, choicesPerNode: 50, lineLength: 10_000 } as const;
const LABEL = /^[A-Za-z][A-Za-z0-9_-]*$/;
const metadata = new Set(["title", "slug", "owner", "location", "direction", "start"]);
const forbidden = new Set(["entry", "requires", "sets", "beat"]);

const span = (line: number, raw: string, column = 1): DlgSpan => ({ line, column, endColumn: Math.max(column, raw.length + 1) });
const diagnostic = (diagnostics: DlgDiagnostic[], code: string, message: string, line: number, raw: string) => diagnostics.push({ code, message, severity: "error", span: span(line, raw) });

function unwrap(source: string, diagnostics: DlgDiagnostic[]) {
  const fenceLines = [...source.matchAll(/^```([^\r\n]*)\r?$/gm)];
  if (!fenceLines.length) return source;
  const blocks = [...source.matchAll(/^```dlg\s*\r?\n([\s\S]*?)^```\s*$/gim)];
  if (blocks.length !== 1 || fenceLines.length !== 2) {
    diagnostic(diagnostics, "fence.count", "Provide exactly one complete fenced dlg block.", 1, source.split(/\r?\n/, 1)[0] || "");
    return "";
  }
  return blocks[0][1];
}

function decodeChoice(value: string, line: number, raw: string, diagnostics: DlgDiagnostic[]) {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "\\") { result += value[index]; continue; }
    const escaped = value[++index];
    if (escaped === "n") result += "\n";
    else if (escaped === '"' || escaped === "\\") result += escaped;
    else {
      diagnostic(diagnostics, "choice.escape", `Unsupported choice escape \\${escaped || "<end>"}.`, line, raw);
      return value;
    }
  }
  return result;
}

export function parseDlg(input: string): DlgParseResult {
  const diagnostics: DlgDiagnostic[] = [];
  let source = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (source.length > DLG_LIMITS.characters) diagnostic(diagnostics, "limit.document", `Document exceeds ${DLG_LIMITS.characters} characters.`, 1, "");
  source = unwrap(source, diagnostics);
  const lines = source.split("\n");
  if (lines.length > DLG_LIMITS.lines) diagnostic(diagnostics, "limit.lines", `Document exceeds ${DLG_LIMITS.lines} lines.`, 1, "");
  lines.forEach((line, index) => { if (line.length > DLG_LIMITS.lineLength) diagnostic(diagnostics, "limit.line", `Line exceeds ${DLG_LIMITS.lineLength} characters.`, index + 1, line); });
  const first = lines.findIndex((line) => line.trim() && !line.trim().startsWith("//"));
  if (first < 0 || lines[first].trim() !== "!DLG 1") diagnostic(diagnostics, "header", "The first meaningful line must be !DLG 1.", Math.max(1, first + 1), lines[first] || "");

  const values: Record<string, string> = {};
  const nodes: DlgNode[] = [];
  let current: DlgNode | undefined;
  const labels = new Set<string>();
  for (let index = Math.max(0, first + 1); index < lines.length; index += 1) {
    const raw = lines[index]; const line = index + 1; const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    if (trimmed.startsWith("::")) {
      const name = trimmed.slice(2).trim();
      if (!LABEL.test(name)) diagnostic(diagnostics, "node.label", `Invalid node label '${name}'.`, line, raw);
      if (labels.has(name)) diagnostic(diagnostics, "node.duplicate", `Duplicate node label '${name}'.`, line, raw);
      labels.add(name);
      current = { label: name, speaker: "", text: "", choices: [], terminal: false, span: span(line, raw) };
      nodes.push(current);
      continue;
    }
    if (trimmed.startsWith("@")) {
      const match = trimmed.match(/^@([A-Za-z][A-Za-z0-9_-]*)(?:\s+(.*))?$/);
      if (!match) { diagnostic(diagnostics, "directive.syntax", "Malformed directive.", line, raw); continue; }
      const [, name, value = ""] = match;
      if (name === "speaker" && current) { current.speaker = value; continue; }
      if (name === "end" && current && !value) { current.terminal = true; continue; }
      if (forbidden.has(name)) { diagnostic(diagnostics, "directive.authority", `@${name} is not allowed in the DLG/1 AI profile.`, line, raw); continue; }
      if (!current && metadata.has(name)) { values[name] = value; continue; }
      diagnostic(diagnostics, "directive.unknown", `Unknown or misplaced directive @${name}.`, line, raw); continue;
    }
    if (!current) { diagnostic(diagnostics, "content.outside-node", "Content must appear inside a node.", line, raw); continue; }
    if (raw === "|" || raw.startsWith("| ")) { current.text += `${current.text ? "\n" : ""}${raw === "|" ? "" : raw.slice(2)}`; continue; }
    if (trimmed.startsWith("?")) {
      if (/[“”→]/.test(raw)) { diagnostic(diagnostics, "choice.punctuation", "Use straight quotes and -> in choice syntax.", line, raw); continue; }
      const match = trimmed.match(/^\?\s+"((?:[^"\\]|\\["\\n])*)"\s+->\s+([A-Za-z][A-Za-z0-9_-]*)$/);
      if (!match) { diagnostic(diagnostics, "choice.syntax", "Choices must use ? \"text\" -> target.", line, raw); continue; }
      const choice: DlgChoice = { text: decodeChoice(match[1], line, raw, diagnostics), target: match[2], span: span(line, raw) };
      current.choices.push(choice); continue;
    }
    if (trimmed.startsWith(">")) {
      const target = trimmed.slice(1).trim();
      if (!LABEL.test(target)) diagnostic(diagnostics, "continuation.syntax", "Continuations must use > target.", line, raw);
      else if (current.continuation) diagnostic(diagnostics, "continuation.multiple", "A node may have only one continuation.", line, raw);
      else current.continuation = target;
      continue;
    }
    diagnostic(diagnostics, "syntax.unknown", "Unrecognized DLG/1 line.", line, raw);
  }

  if (nodes.length > DLG_LIMITS.nodes) diagnostic(diagnostics, "limit.nodes", `Document exceeds ${DLG_LIMITS.nodes} nodes.`, 1, "");
  nodes.forEach((node) => {
    if (!node.speaker.trim()) diagnostic(diagnostics, "node.speaker", `Node '${node.label}' requires @speaker.`, node.span.line, "");
    if (!node.text && !node.terminal) diagnostic(diagnostics, "node.text", `Node '${node.label}' requires spoken text.`, node.span.line, "");
    if (node.choices.length > DLG_LIMITS.choicesPerNode) diagnostic(diagnostics, "limit.choices", `Node '${node.label}' exceeds ${DLG_LIMITS.choicesPerNode} choices.`, node.span.line, "");
    if (node.continuation && node.choices.length) diagnostic(diagnostics, "node.mixed-edges", `Node '${node.label}' cannot mix choices and a continuation.`, node.span.line, "");
    if (node.terminal && (node.continuation || node.choices.length)) diagnostic(diagnostics, "node.terminal-edges", `Terminal node '${node.label}' cannot have outgoing edges.`, node.span.line, "");
    if (!node.terminal && !node.continuation && !node.choices.length) diagnostic(diagnostics, "node.truncated", `Node '${node.label}' needs @end or an outgoing edge.`, node.span.line, "");
    [...node.choices.map((choice) => choice.target), ...(node.continuation ? [node.continuation] : [])].forEach((target) => {
      if (!labels.has(target)) diagnostic(diagnostics, "target.missing", `Node '${node.label}' targets missing node '${target}'.`, node.span.line, "");
    });
  });
  if (!values.title?.trim()) diagnostic(diagnostics, "metadata.title", "@title is required.", 1, "");
  if (!values.start?.trim()) diagnostic(diagnostics, "metadata.start", "Exactly one @start is required.", 1, "");
  else if (!labels.has(values.start)) diagnostic(diagnostics, "metadata.start-target", `@start targets missing node '${values.start}'.`, 1, "");
  if (diagnostics.some((item) => item.severity === "error")) return { diagnostics, source };
  const document: DlgDocument = { version: 1, title: values.title, slug: values.slug, owner: values.owner, location: values.location, direction: values.direction, start: values.start, nodes };
  return { document, diagnostics, source };
}
