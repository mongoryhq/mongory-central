import type { LangKey } from "../types.js";

export type TokenKind =
  | "comment"
  | "directive"
  | "op"
  | "str"
  | "sym"
  | "kw"
  | "type"
  | "bool"
  | "num"
  | "fn"
  | "prop"
  | "ident"
  | "punct"
  | "plain";

export interface CodeToken {
  kind: TokenKind;
  text: string;
}

export type CliTokenKind = "pass" | "fail" | "skip" | "tree" | "op" | "matcher" | "str" | "num" | "plain";

export interface CliToken {
  kind: CliTokenKind;
  text: string;
}

const KEYWORDS: Record<LangKey, ReadonlySet<string>> = {
  js: new Set([
    "import",
    "from",
    "export",
    "const",
    "let",
    "var",
    "function",
    "return",
    "if",
    "else",
    "for",
    "of",
    "in",
    "new",
    "type",
    "interface",
    "async",
    "await",
  ]),
  go: new Set([
    "package",
    "import",
    "func",
    "var",
    "const",
    "type",
    "struct",
    "interface",
    "map",
    "chan",
    "if",
    "else",
    "for",
    "range",
    "return",
    "defer",
    "go",
    "switch",
    "case",
    "default",
    "break",
    "continue",
  ]),
  rb: new Set([
    "require",
    "require_relative",
    "include",
    "extend",
    "module",
    "class",
    "def",
    "end",
    "do",
    "if",
    "elsif",
    "else",
    "unless",
    "return",
    "yield",
    "self",
    "super",
    "and",
    "or",
    "not",
    "in",
  ]),
  core: new Set([
    "const",
    "static",
    "struct",
    "enum",
    "typedef",
    "union",
    "sizeof",
    "return",
    "if",
    "else",
    "for",
    "while",
    "do",
    "switch",
    "case",
    "default",
    "break",
    "continue",
  ]),
};

const BOOLS = new Set(["true", "false", "null", "undefined", "nil", "NULL", "nullptr"]);

const GO_TYPES = new Set([
  "any",
  "string",
  "int",
  "int8",
  "int16",
  "int32",
  "int64",
  "uint",
  "uint8",
  "uint16",
  "uint32",
  "uint64",
  "float32",
  "float64",
  "bool",
  "byte",
  "rune",
  "error",
]);

const C_TYPES = new Set([
  "void",
  "int",
  "char",
  "long",
  "short",
  "unsigned",
  "signed",
  "size_t",
  "ssize_t",
  "bool",
  "double",
  "float",
  "uint8_t",
  "uint16_t",
  "uint32_t",
  "uint64_t",
  "int8_t",
  "int16_t",
  "int32_t",
  "int64_t",
]);

function pushToken<K extends string>(tokens: { kind: K; text: string }[], kind: K, text: string): void {
  if (!text) return;
  const prev = tokens[tokens.length - 1];
  if (prev && prev.kind === kind) {
    prev.text += text;
  } else {
    tokens.push({ kind, text });
  }
}

function skipHorizSpaces(input: string, index: number): number {
  let i = index;
  while (i < input.length && (input[i] === " " || input[i] === "\t")) {
    i++;
  }
  return i;
}

function scanQuoted(code: string, start: number): number {
  const quote = code[start];
  let i = start + 1;
  while (i < code.length) {
    const ch = code[i];
    if (ch === "\\" && quote !== "`") {
      i += 2;
      continue;
    }
    if (ch === quote) {
      return i + 1;
    }
    if (ch === "\n" && quote !== "`") {
      return i;
    }
    i++;
  }
  return code.length;
}

function classifyIdentifier(word: string, code: string, endPos: number, lang: LangKey): TokenKind {
  if (word.startsWith("$")) return "op";
  if (BOOLS.has(word)) return "bool";

  const nextPos = skipHorizSpaces(code, endPos);
  const nextChar = code[nextPos] ?? "";
  const nextTwo = code.slice(nextPos, nextPos + 2);

  if (lang === "core" && /^MG_[A-Z0-9_]+$/.test(word)) {
    return "directive";
  }

  if (KEYWORDS[lang].has(word)) return "kw";

  if (lang === "go" && GO_TYPES.has(word)) return "type";
  if (
    lang === "core" &&
    (C_TYPES.has(word) ||
      /^mg_[a-z0-9_]+_t$/.test(word) ||
      (nextChar !== "(" && /^mongory_(?:memory_pool|value|matcher|error)$/.test(word)))
  ) {
    return "type";
  }

  // Ruby hash rocket after symbol extension method: :age.gte => 18
  if (lang === "rb" && nextTwo === "=>" && code[endPos - word.length - 1] === ".") {
    return "op";
  }

  if (nextChar === "(") return "fn";

  // Object literal or struct key: `age: 18`, `status: "active"`
  if (nextChar === ":" && nextTwo !== ":=" && nextTwo !== "::") {
    return "prop";
  }

  if (/^[A-Z][A-Za-z0-9_]*$/.test(word)) return "type";

  return "ident";
}

/**
 * Losslessly tokenize a snippet in JS/TS, Go, Ruby, or C99 for syntax highlighting.
 * Concatenating all returned token texts is guaranteed to equal `code`.
 */
export function tokenizeCode(code: string, lang: LangKey): CodeToken[] {
  const tokens: CodeToken[] = [];
  let i = 0;

  while (i < code.length) {
    const ch = code[i];
    const two = code.slice(i, i + 2);

    // Whitespace
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      let j = i + 1;
      while (j < code.length && (code[j] === " " || code[j] === "\t" || code[j] === "\n" || code[j] === "\r")) {
        j++;
      }
      pushToken(tokens, "plain", code.slice(i, j));
      i = j;
      continue;
    }

    // Comments
    if (lang === "rb" && ch === "#") {
      const nl = code.indexOf("\n", i);
      const end = nl === -1 ? code.length : nl;
      pushToken(tokens, "comment", code.slice(i, end));
      i = end;
      continue;
    }
    if (lang !== "rb" && two === "//") {
      const nl = code.indexOf("\n", i);
      const end = nl === -1 ? code.length : nl;
      pushToken(tokens, "comment", code.slice(i, end));
      i = end;
      continue;
    }
    if (lang !== "rb" && two === "/*") {
      const close = code.indexOf("*/", i + 2);
      const end = close === -1 ? code.length : close + 2;
      pushToken(tokens, "comment", code.slice(i, end));
      i = end;
      continue;
    }

    // C99 preprocessor directive & angle-bracket header
    if (lang === "core" && ch === "#") {
      const match = /^#[ \t]*[a-zA-Z_]\w*/.exec(code.slice(i));
      if (match) {
        pushToken(tokens, "directive", match[0]);
        i += match[0].length;
        continue;
      }
    }
    if (lang === "core" && ch === "<") {
      const hdr = /^<[a-zA-Z0-9_./-]+\.h>/.exec(code.slice(i));
      if (hdr) {
        pushToken(tokens, "str", hdr[0]);
        i += hdr[0].length;
        continue;
      }
    }

    // Strings & `$`-prefixed Mongory operators in quotes (`"$gte"`, `'$in'`)
    if (ch === '"' || ch === "'" || ch === "`") {
      const end = scanQuoted(code, i);
      const text = code.slice(i, end);
      const inner = text.length >= 2 && text[text.length - 1] === ch ? text.slice(1, -1) : "";
      const kind: TokenKind = /^\$[a-zA-Z_][a-zA-Z0-9_]*$/.test(inner) ? "op" : "str";
      pushToken(tokens, kind, text);
      i = end;
      continue;
    }

    // Ruby symbols (`:age`, `:status`, `:pro`)
    if (lang === "rb" && ch === ":" && two !== "::") {
      const sym = /^:[a-zA-Z_][a-zA-Z0-9_]*[!?]?/.exec(code.slice(i));
      if (sym) {
        pushToken(tokens, "sym", sym[0]);
        i += sym[0].length;
        continue;
      }
    }

    // Numbers
    if (/[0-9]/.test(ch)) {
      const num = /^(?:0[xX][0-9a-fA-F_]+|\d+(?:_\d+)*(?:\.\d+(?:_\d+)*)?)/.exec(code.slice(i));
      if (num) {
        pushToken(tokens, "num", num[0]);
        i += num[0].length;
        continue;
      }
    }

    // Identifiers, keywords, properties, functions
    if (/[A-Za-z_$]/.test(ch)) {
      const idMatch =
        lang === "rb"
          ? /^[A-Za-z_$][A-Za-z0-9_$]*[!?]?/.exec(code.slice(i))
          : /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(code.slice(i));
      if (idMatch) {
        const word = idMatch[0];
        const end = i + word.length;
        pushToken(tokens, classifyIdentifier(word, code, end, lang), word);
        i = end;
        continue;
      }
    }

    // Multi-character operators
    if (two === "=>" || two === ":=" || two === "->" || two === "==" || two === "!=" || two === "<=" || two === ">=" || two === "&&" || two === "||") {
      pushToken(tokens, "op", two);
      i += 2;
      continue;
    }
    if (code.slice(i, i + 3) === "...") {
      pushToken(tokens, "op", "...");
      i += 3;
      continue;
    }

    // Single-character punctuation & common operators
    if ("{}[](),.;:=<>!+-*/%&|~?".includes(ch)) {
      pushToken(tokens, "punct", ch);
      i += 1;
      continue;
    }

    pushToken(tokens, "plain", ch);
    i += 1;
  }

  return tokens;
}

const CLI_PATTERN = /(\[(?:PASS|FAIL|SKIP)\]|[├└│─]+|\$[a-zA-Z_][a-zA-Z0-9_]*|\b[A-Z][A-Za-z0-9_]*Matcher\b|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b)/g;

/**
 * Losslessly tokenize `explain()` / `trace()` CLI text so status tags,
 * tree guides, `$` operators, strings, and numbers render clearly.
 */
export function tokenizeCliTrace(text: string): CliToken[] {
  const tokens: CliToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(CLI_PATTERN)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      pushToken(tokens, "plain", text.slice(lastIndex, idx));
    }
    const seg = match[0];
    let kind: CliTokenKind = "plain";
    if (seg === "[PASS]") kind = "pass";
    else if (seg === "[FAIL]") kind = "fail";
    else if (seg === "[SKIP]") kind = "skip";
    else if (/^[├└│─]+$/.test(seg)) kind = "tree";
    else if (seg.startsWith("$")) kind = "op";
    else if (seg.endsWith("Matcher")) kind = "matcher";
    else if (seg.startsWith('"') || seg.startsWith("'")) kind = "str";
    else kind = "num";

    pushToken(tokens, kind, seg);
    lastIndex = idx + seg.length;
  }

  if (lastIndex < text.length) {
    pushToken(tokens, "plain", text.slice(lastIndex));
  }

  return tokens;
}
