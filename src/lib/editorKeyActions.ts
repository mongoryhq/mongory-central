export interface EditorKeyEdit {
  nextText: string;
  selectionStart: number;
  selectionEnd: number;
  openAutocomplete?: boolean;
}

const OPEN_PAIRS: Record<string, string> = {
  "{": "}",
  "[": "]",
  '"': '"',
};

const CLOSE_CHARS = new Set(["}", "]"]);
const INDENT_UNIT = "  ";

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

function isInsideStringOnLine(text: string, cursor: number): boolean {
  const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
  let inString = false;
  for (let i = lineStart; i < cursor; i++) {
    if (text[i] === '"' && !isEscaped(text, i)) {
      inString = !inString;
    }
  }
  return inString;
}

function getLineIndent(text: string, cursor: number): string {
  const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
  let end = lineStart;
  while (end < cursor && (text[end] === " " || text[end] === "\t")) {
    end++;
  }
  return text.slice(lineStart, end);
}

/**
 * Computes an IDE-style edit for auto-pairing (`{`, `[`, `"`), closing-char
 * skip-over, paired Backspace, block Tab indentation, and Enter auto-expand/indent.
 * Returns `null` when the browser's default key handling should proceed.
 */
export function computeEditorKeyEdit(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  key: string,
  shiftKey = false,
): EditorKeyEdit | null {
  const hasSelection = selectionStart !== selectionEnd;
  const before = text.slice(0, selectionStart);
  const selected = text.slice(selectionStart, selectionEnd);
  const after = text.slice(selectionEnd);
  const prevChar = selectionStart > 0 ? text[selectionStart - 1] : "";
  const nextChar = selectionEnd < text.length ? text[selectionEnd] : "";

  // 1. Auto-pair opening brackets and quotes
  if (key in OPEN_PAIRS) {
    const close = OPEN_PAIRS[key];

    if (hasSelection) {
      return {
        nextText: `${before}${key}${selected}${close}${after}`,
        selectionStart: selectionStart + 1,
        selectionEnd: selectionEnd + 1,
      };
    }

    if (key === '"') {
      if (isEscaped(text, selectionStart)) {
        return null;
      }
      // Only skip over a closing quote when the caret is actually inside a string.
      if (nextChar === '"' && isInsideStringOnLine(text, selectionStart)) {
        return {
          nextText: text,
          selectionStart: selectionStart + 1,
          selectionEnd: selectionStart + 1,
        };
      }
      if (/[A-Za-z0-9_$]/.test(nextChar) || nextChar === '"') {
        return null;
      }
      return {
        nextText: `${before}""${after}`,
        selectionStart: selectionStart + 1,
        selectionEnd: selectionStart + 1,
        openAutocomplete: true,
      };
    }

    return {
      nextText: `${before}${key}${close}${after}`,
      selectionStart: selectionStart + 1,
      selectionEnd: selectionStart + 1,
    };
  }

  // 2. Skip over matching closing bracket when already present right after caret
  if (!hasSelection && CLOSE_CHARS.has(key) && nextChar === key) {
    return {
      nextText: text,
      selectionStart: selectionStart + 1,
      selectionEnd: selectionStart + 1,
    };
  }

  // 3. Backspace removes both characters of an empty pair
  if (!hasSelection && key === "Backspace") {
    const isEmptyPair =
      (prevChar === "{" && nextChar === "}") ||
      (prevChar === "[" && nextChar === "]") ||
      (prevChar === '"' && nextChar === '"' && !isEscaped(text, selectionStart - 1));
    if (isEmptyPair) {
      return {
        nextText: `${text.slice(0, selectionStart - 1)}${text.slice(selectionEnd + 1)}`,
        selectionStart: selectionStart - 1,
        selectionEnd: selectionStart - 1,
      };
    }
    return null;
  }

  // 4. Enter: auto-expand between `{|}` / `[|]` and preserve / increase indentation
  if (key === "Enter") {
    const indent = getLineIndent(text, selectionStart);
    const trimmedBefore = before.replace(/[ \t]+$/, "");
    const lastNonWs = trimmedBefore.length > 0 ? trimmedBefore[trimmedBefore.length - 1] : "";
    const trimmedAfter = after.replace(/^[ \t]+/, "");
    const firstNonWsAfter = trimmedAfter.length > 0 ? trimmedAfter[0] : "";

    const isBetweenBrackets =
      (lastNonWs === "{" && firstNonWsAfter === "}") ||
      (lastNonWs === "[" && firstNonWsAfter === "]");

    if (isBetweenBrackets) {
      const innerIndent = indent + INDENT_UNIT;
      const inserted = `\n${innerIndent}\n${indent}`;
      const nextText = `${before}${inserted}${trimmedAfter}`;
      const nextPos = selectionStart + 1 + innerIndent.length;
      return {
        nextText,
        selectionStart: nextPos,
        selectionEnd: nextPos,
      };
    }

    const nextIndent = lastNonWs === "{" || lastNonWs === "[" ? indent + INDENT_UNIT : indent;
    const inserted = `\n${nextIndent}`;
    return {
      nextText: `${before}${inserted}${after}`,
      selectionStart: selectionStart + inserted.length,
      selectionEnd: selectionStart + inserted.length,
    };
  }

  // 5. Tab / Shift+Tab: 2-space indentation (block indent/outdent when text is selected)
  if (key === "Tab") {
    if (hasSelection) {
      const blockStart = text.lastIndexOf("\n", selectionStart - 1) + 1;
      // If selection ends at column 0 of the next line, don't indent that trailing line.
      const effectiveEnd =
        selectionEnd > blockStart && text[selectionEnd - 1] === "\n" ? selectionEnd - 1 : selectionEnd;
      const nextNl = text.indexOf("\n", effectiveEnd);
      const blockEnd = nextNl === -1 ? text.length : nextNl;
      const block = text.slice(blockStart, blockEnd);
      const lines = block.split("\n");

      if (shiftKey) {
        let changed = false;
        let firstLineRemoved = 0;
        let totalRemoved = 0;
        const outdented = lines.map((line, idx) => {
          let remove = 0;
          if (line.startsWith(INDENT_UNIT)) remove = INDENT_UNIT.length;
          else if (line.startsWith(" ") || line.startsWith("\t")) remove = 1;
          if (remove > 0) {
            changed = true;
            if (idx === 0) firstLineRemoved = remove;
            totalRemoved += remove;
            return line.slice(remove);
          }
          return line;
        });
        if (!changed) {
          return null; // Release focus cleanly when nothing can be outdented.
        }
        return {
          nextText: `${text.slice(0, blockStart)}${outdented.join("\n")}${text.slice(blockEnd)}`,
          selectionStart: Math.max(blockStart, selectionStart - firstLineRemoved),
          selectionEnd: Math.max(blockStart, selectionEnd - totalRemoved),
        };
      }

      const indented = lines.map((line) => `${INDENT_UNIT}${line}`).join("\n");
      return {
        nextText: `${text.slice(0, blockStart)}${indented}${text.slice(blockEnd)}`,
        selectionStart: selectionStart + INDENT_UNIT.length,
        selectionEnd: selectionEnd + lines.length * INDENT_UNIT.length,
      };
    }

    if (shiftKey) {
      const lineStart = text.lastIndexOf("\n", selectionStart - 1) + 1;
      let remove = 0;
      if (text.startsWith(INDENT_UNIT, lineStart)) remove = INDENT_UNIT.length;
      else if (text[lineStart] === " " || text[lineStart] === "\t") remove = 1;
      if (remove === 0) {
        return null; // Avoid keyboard trap (WCAG 2.1.2) when nothing to outdent.
      }
      const nextText = `${text.slice(0, lineStart)}${text.slice(lineStart + remove)}`;
      const delta = Math.min(remove, selectionStart - lineStart);
      return {
        nextText,
        selectionStart: selectionStart - delta,
        selectionEnd: selectionStart - delta,
      };
    }

    return {
      nextText: `${before}${INDENT_UNIT}${after}`,
      selectionStart: selectionStart + INDENT_UNIT.length,
      selectionEnd: selectionStart + INDENT_UNIT.length,
    };
  }

  return null;
}
