import type { EntryRecord } from "../../types/editorQol";

const value = (entry: EntryRecord, key: string) => typeof entry[key] === "string" ? entry[key] as string : "";
const display = (entry: EntryRecord) => value(entry, "name") || value(entry, "title") || value(entry, "slug") || value(entry, "id");

export function buildDialoguePrompt(brief: string, context: EntryRecord[], phase: "outline" | "prose" = "prose") {
  const task = phase === "outline"
    ? "Propose only a concise branch outline with local labels, branch decisions, facts revealed or concealed, and intended outcomes. Do not write dialogue prose or DLG/1 yet."
    : "Write dialogue for the author-approved topology. Produce exactly one fenced dlg block and no other prose.";
  return `Create a short dialogue draft. ${task}\nDo not invent or attach requirements, flags, reputation, consequences, story beats, or gameplay state.\nScene brief and approved topology:\n${brief.trim()}\n\nApproved context:\n${context.map((entry) => `- ${display(entry)}: ${value(entry, "voice_notes") || value(entry, "description") || "No additional notes."}`).join("\n") || "- None selected."}${phase === "prose" ? '\n\nRequired structure: !DLG 1, @title, @start, then nodes with :: label, @speaker, | text, choices using ? "text" -> target or one > target, and @end on every ending.' : ""}`;
}
