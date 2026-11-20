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
 * skip-over, paired Backspace, Tab indentation, and Enter auto-expand/indent.
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
      if (nextChar === '"') {
        return {
          nextText: text,
          selectionStart: selectionStart + 1,
          selectionEnd: selectionStart + 1,
        };
      }
      if (/[A-Za-z0-9_$]/.test(nextChar)) {
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

  // 5. Tab / Shift+Tab: 2-space indentation
  if (key === "Tab") {
    if (shiftKey) {
      const lineStart = text.lastIndexOf("\n", selectionStart - 1) + 1;
      if (text.startsWith(INDENT_UNIT, lineStart)) {
        const nextText = `${text.slice(0, lineStart)}${text.slice(lineStart + INDENT_UNIT.length)}`;
        const delta = Math.min(INDENT_UNIT.length, selectionStart - lineStart);
        return {
          nextText,
          selectionStart: selectionStart - delta,
          selectionEnd: Math.max(selectionStart - delta, selectionEnd - delta),
        };
      }
      return { nextText: text, selectionStart, selectionEnd };
    }
    return {
      nextText: `${before}${INDENT_UNIT}${after}`,
      selectionStart: selectionStart + INDENT_UNIT.length,
      selectionEnd: selectionStart + INDENT_UNIT.length,
    };
  }

  return null;
}
