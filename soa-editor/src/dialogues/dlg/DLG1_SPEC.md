# DLG/1 core profile

Status: stable prototype grammar. DLG/1 is a provider-neutral, human-reviewed interchange format. It is not a gameplay-state authoring format.

## Encoding and extraction

Input is Unicode text. The parser removes one UTF-8 BOM and normalizes CRLF/CR to LF; it performs no other character normalization. Unfenced input is accepted only when `!DLG 1` is the first meaningful line. Fenced input must contain exactly one complete `dlg` fence and no other fences. Smart structural quotes/arrows are errors.

Future incompatible syntax requires a new integer version. A DLG/1 parser rejects other versions and unknown directives; it never silently drops data.

## Grammar (EBNF)

```ebnf
document     = header, newline, metadata, { newline }, node, { { newline }, node } ;
header       = "!DLG 1" ;
metadata     = title, { newline, meta-field }, newline, start ;
title        = "@title ", text ;
meta-field   = ("@slug " | "@owner " | "@location " | "@direction "), text ;
start        = "@start ", label ;
node         = ":: ", label, newline, "@speaker ", text, newline,
               spoken, { newline, spoken },
               ((newline, continuation) | { newline, choice } | (newline, "@end")) ;
spoken       = "|" | "| ", text ;
continuation = "> ", label ;
choice       = "? \"", choice-char, "\" -> ", label ;
label        = letter, { letter | digit | "_" | "-" } ;
choice-char  = { any-character-except-quote-backslash | "\\\"" | "\\\\" | "\\n" } ;
comment      = "//", text ;
```

Blank lines and whole-line comments are allowed between constructs. Directive-looking spoken text is safe because every spoken line begins with `|`.

## Semantic rules

- Metadata directives occur before the first node. `@title` and exactly one `@start` are required.
- Labels are unique local references, never canonical database IDs. Every target and the start must resolve.
- Every node has one non-empty `@speaker` and spoken text. Consecutive spoken lines join with LF; bare `|` preserves a blank paragraph.
- A node has choices, one continuation, or `@end`. It cannot mix these states. An edge-less node without `@end` is treated as truncated.
- The AI profile rejects `@entry`, `@requires`, `@sets`, `@beat`, and every unknown directive. AI candidates cannot author canonical gameplay effects.
- Cycles and forward references are valid. Narrative correctness remains a human review responsibility.

## Resource limits

The prototype accepts at most 200,000 characters, 5,000 lines, 500 nodes, 50 choices per node, and 10,000 characters per physical line. Violations block staging with source diagnostics.

## Round trip

`parse(serialize(parse(source)))` preserves metadata, node labels, speakers, spoken text including blank paragraphs, topology, choice strings, start, and ending meaning. Formatting and comments are not preserved.

## Mapping and identity

Staging generates fresh ULIDs and collision-resistant prefixed slugs once, resolves speakers explicitly, maps `@start` to `dialogue.starting_node_id`, and maps `@end` to `node.is_terminal`. Preview IDs remain stable thereafter. V1 stages only into an empty dialogue. Existing-dialogue revision import is intentionally unsupported until immutable identity, revision checks, reviewed diffs, and stale-write handling exist.
