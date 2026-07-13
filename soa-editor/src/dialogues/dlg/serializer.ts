import type { DlgDocument } from "./types";

const escapeChoice = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

export function serializeDlg(document: DlgDocument) {
  const lines = ["!DLG 1", `@title ${document.title}`];
  if (document.slug) lines.push(`@slug ${document.slug}`);
  if (document.owner) lines.push(`@owner ${document.owner}`);
  if (document.location) lines.push(`@location ${document.location}`);
  if (document.direction) lines.push(`@direction ${document.direction}`);
  lines.push(`@start ${document.start}`);
  document.nodes.forEach((node) => {
    lines.push("", `:: ${node.label}`, `@speaker ${node.speaker}`);
    node.text.split("\n").forEach((part) => lines.push(part ? `| ${part}` : "|"));
    node.choices.forEach((choice) => lines.push(`? "${escapeChoice(choice.text)}" -> ${choice.target}`));
    if (node.continuation) lines.push(`> ${node.continuation}`);
    if (node.terminal) lines.push("@end");
  });
  return `${lines.join("\n")}\n`;
}
