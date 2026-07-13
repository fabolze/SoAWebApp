import { describe, expect, it } from "vitest";
import { parseDlg } from "./parser";
import { serializeDlg } from "./serializer";

const valid = `!DLG 1\n@title Test\n@start opening\n\n:: opening\n@speaker Mara\n| Go now.\n? "Why?" -> end\n\n:: end\n@speaker Mara\n| Because.\n@end\n`;

describe("DLG/1", () => {
  it("parses and semantically round trips", () => {
    const first = parseDlg(valid);
    expect(first.diagnostics).toEqual([]);
    expect(parseDlg(serializeDlg(first.document!)).document).toEqual(first.document);
  });
  it.each([
    ["smart punctuation", valid.replace('"Why?" ->', '“Why?” →')],
    ["missing target", valid.replace("-> end", "-> absent")],
    ["terminal conflict", valid.replace("? \"Why?\" -> end", "@end\n? \"Why?\" -> end")],
    ["unknown directive", valid.replace("@speaker Mara", "@requires flag\n@speaker Mara")],
    ["multiple fences", `\`\`\`dlg\n${valid}\`\`\`\n\`\`\`dlg\n${valid}\`\`\``],
  ])("rejects %s", (_name, source) => expect(parseDlg(source).diagnostics.length).toBeGreaterThan(0));

  it("round trips generated linear documents", () => {
    for (let length = 1; length <= 25; length += 1) {
      const nodes = Array.from({ length }, (_, index) => ({ label: `node_${index}`, speaker: index % 2 ? "Mara" : "Player", text: `Line ${index}\nparagraph`, choices: [], continuation: index + 1 < length ? `node_${index + 1}` : undefined, terminal: index + 1 === length, span: { line: 1, column: 1, endColumn: 1 } }));
      const document = { version: 1 as const, title: `Generated ${length}`, start: "node_0", nodes };
      const reparsed = parseDlg(serializeDlg(document));
      expect(reparsed.diagnostics).toEqual([]);
      expect(serializeDlg(reparsed.document!)).toBe(serializeDlg(document));
    }
  });

  it("fails bounded oversized input without throwing", () => {
    const result = parseDlg(`!DLG 1\n@title Huge\n@start opening\n:: opening\n@speaker A\n| ${"x".repeat(210_000)}\n@end`);
    expect(result.diagnostics.some((item) => item.code.startsWith("limit."))).toBe(true);
  });
});
