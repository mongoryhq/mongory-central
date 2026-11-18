export interface JsonLineRange {
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
}

/**
 * Locate 0-based line and offset spans for every top-level element of a JSON array.
 * Immune to nested objects, arrays, and escaped strings; returns [] if input does
 * not start with `[` or cannot be scanned.
 */
export function findJsonArrayElementRanges(text: string): JsonLineRange[] {
  const ranges: JsonLineRange[] = [];
  let line = 0;
  let i = 0;

  while (i < text.length && /\s/.test(text[i])) {
    if (text[i] === "\n") line++;
    i++;
  }

  if (text[i] !== "[") {
    return ranges;
  }

  // Enter root array at depth = 1
  i++;
  let depth = 1;
  let inString = false;
  let escaped = false;
  let elemStartOffset: number | null = null;
  let elemStartLine = 0;
  let inScalar = false;

  for (; i < text.length && depth > 0; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
        // String at depth === 1 is itself an array element
        if (depth === 1 && elemStartOffset !== null && !inScalar) {
          ranges.push({
            startLine: elemStartLine,
            endLine: line,
            startOffset: elemStartOffset,
            endOffset: i + 1,
          });
          elemStartOffset = null;
        }
      }
      if (ch === "\n") line++;
      continue;
    }

    if (inScalar) {
      if (ch === "," || ch === "]" || /\s/.test(ch)) {
        if (elemStartOffset !== null) {
          ranges.push({
            startLine: elemStartLine,
            endLine: line,
            startOffset: elemStartOffset,
            endOffset: i,
          });
          elemStartOffset = null;
        }
        inScalar = false;
        if (ch === "]") {
          depth--;
          break;
        }
      }
      if (ch === "\n") line++;
      continue;
    }

    if (depth === 1 && elemStartOffset === null) {
      if (/\s/.test(ch) || ch === ",") {
        if (ch === "\n") line++;
        continue;
      }
      if (ch === "]") {
        depth--;
        break;
      }
      elemStartOffset = i;
      elemStartLine = line;
      if (ch === "{" || ch === "[") {
        depth++;
      } else if (ch === '"') {
        inString = true;
      } else {
        inScalar = true;
      }
      if (ch === "\n") line++;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 1 && elemStartOffset !== null) {
        ranges.push({
          startLine: elemStartLine,
          endLine: line,
          startOffset: elemStartOffset,
          endOffset: i + 1,
        });
        elemStartOffset = null;
      } else if (depth === 0) {
        break;
      }
    }

    if (ch === "\n") line++;
  }

  return ranges;
}
