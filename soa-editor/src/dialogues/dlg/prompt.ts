import type { EntryRecord } from "../../types/editorQol";

const value = (entry: EntryRecord, key: string) => typeof entry[key] === "string" ? entry[key] as string : "";
const display = (entry: EntryRecord) => value(entry, "name") || value(entry, "title") || value(entry, "slug") || value(entry, "id");

const dlgInstructions = `Return exactly one fenced code block tagged dlg and no text before or after it.
The first line inside the fence must be !DLG 1.

Use only this syntax:
- Document metadata: @title TITLE followed by @start START_LABEL.
- Node header: :: LABEL. Labels must start with an ASCII letter and contain only ASCII letters, digits, _ or -.
- Every node must contain exactly one non-empty @speaker SPEAKER and at least one spoken line beginning with | followed by a space.
- A node must finish in exactly one of these three ways:
  1. one or more choices, each written exactly ? "CHOICE TEXT" -> TARGET_LABEL
  2. one automatic continuation written exactly > TARGET_LABEL
  3. @end
- Every start and target label must name a node in the same block.
- Use straight ASCII quotes and the two ASCII characters ->. Never add characters after ?, such as ?s.
- Do not use any other directives or syntax.

Minimal syntax example (copy its syntax, not its content):
\`\`\`dlg
!DLG 1
@title Example
@start opening

:: opening
@speaker Character
| Example line.
? "Leave" -> ending

:: ending
@speaker Character
| Example ending.
@end
\`\`\`

Before answering, silently verify that the result follows every rule above, especially that every choice starts with exactly ? " and that every referenced label exists.`;

export function buildDialoguePrompt(brief: string, context: EntryRecord[], phase: "outline" | "prose" = "prose") {
  const task = phase === "outline"
    ? "Propose only a concise branch outline with local labels, branch decisions, facts revealed or concealed, and intended outcomes. Do not write dialogue prose or DLG/1 yet."
    : "Write dialogue for the author-approved topology.";
  return `Create a short dialogue draft. ${task}\nDo not invent or attach requirements, flags, reputation, consequences, story beats, or gameplay state.\nScene brief and approved topology:\n${brief.trim()}\n\nApproved context:\n${context.map((entry) => `- ${display(entry)}: ${value(entry, "voice_notes") || value(entry, "description") || "No additional notes."}`).join("\n") || "- None selected."}${phase === "prose" ? `\n\n${dlgInstructions}` : ""}`;
}
