/**
 * Markdown text-escaping helpers for the WYSIWYG editor's serializer.
 *
 * The serializer controls every node type, so it only needs to escape the
 * characters that would otherwise re-tokenise a plain-text run as markdown or
 * math when the output is re-parsed by `remark-parse` + `remark-math`.
 *
 * The set is intentionally MINIMAL but sufficient that
 *   markdownToDoc(escapeMarkdownText(x))
 * round-trips `x` as a single plain-text node.
 *
 * NOTE: math `latex` strings are emitted VERBATIM by the serializer — never
 * passed through here — because LaTeX backslashes are meaningful.
 */

/**
 * Escape markdown/math special characters in a plain-text string.
 *
 * - `\` → `\\`  (must be first so we don't double-escape backslashes we add)
 * - `$` → `\$`  (otherwise a stray `$` opens a math span under remark-math)
 * - `` ` `` → `` \` ``  (code span)
 * - `*` `_` `[` `]` `<` `>` → backslash-escaped (emphasis / links / autolinks)
 * - leading `#` → `\#`     (ATX heading at start of a line/paragraph)
 * - leading `![` is covered by escaping `!` only when followed by `[`, and `[`
 *   is already escaped, so image syntax can never form.
 */
export function escapeMarkdownText(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    switch (ch) {
      case "\\":
      case "$":
      case "`":
      case "*":
      case "_":
      case "[":
      case "]":
      case "<":
      case ">":
        out += "\\" + ch;
        break;
      default:
        out += ch;
    }
  }

  // Escape a leading `#` (ATX heading) at the very start of the run. Because
  // paragraphs are emitted as their own blocks, the start of a text run that
  // begins a paragraph is the start of a line.
  out = out.replace(/^(#)/, "\\$1");

  return out;
}
