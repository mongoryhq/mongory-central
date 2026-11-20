export interface FieldSuggestion {
  key: string;
  kind: "field";
  detail: string;
}

export interface OperatorSuggestion {
  key: string;
  kind: "operator";
  detail: string;
  scope: "root" | "field" | "both";
}

export type KeySuggestion = FieldSuggestion | OperatorSuggestion;

export interface KeyCompletionContext {
  prefix: string;
  replaceStart: number;
  replaceEnd: number;
  hasClosingQuote: boolean;
  hasColonAfter: boolean;
  nestingDepth: number;
  parentKey: string | null;
  fieldPath: string[];
}

export const OPERATOR_SUGGESTIONS: readonly OperatorSuggestion[] = [
  { key: "$eq", kind: "operator", detail: "exact equality", scope: "field" },
  { key: "$ne", kind: "operator", detail: "not equal", scope: "field" },
  { key: "$gt", kind: "operator", detail: "greater than", scope: "field" },
  { key: "$gte", kind: "operator", detail: "greater than or equal", scope: "field" },
  { key: "$lt", kind: "operator", detail: "less than", scope: "field" },
  { key: "$lte", kind: "operator", detail: "less than or equal", scope: "field" },
  { key: "$in", kind: "operator", detail: "value in list / intersects", scope: "field" },
  { key: "$nin", kind: "operator", detail: "value not in list / disjoint", scope: "field" },
  { key: "$exists", kind: "operator", detail: "key exists (true / false)", scope: "field" },
  { key: "$present", kind: "operator", detail: "non-null & non-empty", scope: "field" },
  { key: "$and", kind: "operator", detail: "all sub-conditions match", scope: "both" },
  { key: "$or", kind: "operator", detail: "any sub-condition matches", scope: "both" },
  { key: "$not", kind: "operator", detail: "negate condition", scope: "both" },
  { key: "$elemMatch", kind: "operator", detail: "at least one array element matches", scope: "both" },
  { key: "$every", kind: "operator", detail: "all elements match (non-empty)", scope: "both" },
  { key: "$size", kind: "operator", detail: "array length exact or range", scope: "field" },
  { key: "$regex", kind: "operator", detail: "regex pattern match", scope: "field" },
  { key: "$options", kind: "operator", detail: "regex flags (i, m, s)", scope: "field" },
];

const CONTAINER_OPERATORS = new Set(["$and", "$or", "$not", "$elemMatch", "$every"]);

function describeValueType(val: unknown): string {
  if (val === null) return "null";
  if (Array.isArray(val)) return "array";
  return typeof val;
}

/**
 * Extracts unique field names and nested dot-paths from the current records array.
 */
export function extractRecordFieldSuggestions(records: unknown[] | null): FieldSuggestion[] {
  if (!records || records.length === 0) return [];

  const typeMap = new Map<string, Set<string>>();
  const maxKeys = 200;
  const maxDepth = 4;

  const addKey = (key: string, val: unknown) => {
    if (!key || (typeMap.size >= maxKeys && !typeMap.has(key))) return;
    let set = typeMap.get(key);
    if (!set) {
      set = new Set<string>();
      typeMap.set(key, set);
    }
    set.add(describeValueType(val));
  };

  const visitObject = (obj: Record<string, unknown>, prefix: string, depth: number) => {
    if (depth > maxDepth || typeMap.size >= maxKeys) return;
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      addKey(fullKey, v);
      if (prefix) {
        // Also collect bare leaf key for nested sub-document / $elemMatch contexts.
        addKey(k, v);
      }
      if (v !== null && typeof v === "object") {
        if (Array.isArray(v)) {
          for (let i = 0; i < Math.min(v.length, 10); i++) {
            const elem = v[i];
            if (elem !== null && typeof elem === "object" && !Array.isArray(elem)) {
              visitObject(elem as Record<string, unknown>, fullKey, depth + 1);
            }
          }
        } else {
          visitObject(v as Record<string, unknown>, fullKey, depth + 1);
        }
      }
    }
  };

  for (let i = 0; i < Math.min(records.length, 100); i++) {
    const rec = records[i];
    if (rec !== null && typeof rec === "object" && !Array.isArray(rec)) {
      visitObject(rec as Record<string, unknown>, "", 0);
    }
  }

  return Array.from(typeMap.entries())
    .sort(([a], [b]) => {
      const aDots = a.split(".").length;
      const bDots = b.split(".").length;
      if (aDots !== bDots) return aDots - bDots;
      return a.localeCompare(b);
    })
    .map(([key, types]) => ({
      key,
      kind: "field" as const,
      detail: Array.from(types).slice(0, 3).join(" | "),
    }));
}

interface StackFrame {
  type: "{" | "[";
  lastKey: string | null;
  expectingKey: boolean;
}

/**
 * Inspects JSON text around `cursor` and returns a key completion context when
 * the cursor sits inside an object property key string (even in incomplete JSON).
 */
export function detectJsonKeyContext(text: string, cursor: number): KeyCompletionContext | null {
  const pos = Math.max(0, Math.min(cursor, text.length));
  const stack: StackFrame[] = [];

  let inString = false;
  let escaped = false;
  let stringStart = -1;
  let stringIsKey = false;
  let activeKeyCtx: {
    openQuote: number;
    nestingDepth: number;
    parentKey: string | null;
    fieldPath: string[];
  } | null = null;

  for (let i = 0; i < pos; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        if (stringIsKey && stack.length > 0) {
          const top = stack[stack.length - 1];
          top.lastKey = text.slice(stringStart + 1, i);
          top.expectingKey = false;
        }
        inString = false;
        stringIsKey = false;
        activeKeyCtx = null;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      escaped = false;
      stringStart = i;
      const top = stack[stack.length - 1];
      stringIsKey = Boolean(top && top.type === "{" && top.expectingKey);
      if (stringIsKey) {
        let parentKey: string | null = null;
        const fieldPath: string[] = [];
        for (let s = 0; s < stack.length - 1; s++) {
          const frame = stack[s];
          if (frame.type === "{" && frame.lastKey !== null) {
            parentKey = frame.lastKey;
            if (!frame.lastKey.startsWith("$")) {
              fieldPath.push(...frame.lastKey.split("."));
            }
          }
        }
        const objectDepth = stack.filter((f) => f.type === "{").length;
        activeKeyCtx = {
          openQuote: i,
          nestingDepth: objectDepth,
          parentKey,
          fieldPath,
        };
      }
      continue;
    }

    if (ch === "{") {
      stack.push({ type: "{", lastKey: null, expectingKey: true });
    } else if (ch === "[") {
      stack.push({ type: "[", lastKey: null, expectingKey: false });
    } else if (ch === "}" || ch === "]") {
      stack.pop();
    } else if (ch === ",") {
      const top = stack[stack.length - 1];
      if (top && top.type === "{") {
        top.expectingKey = true;
        top.lastKey = null;
      }
    } else if (ch === ":") {
      const top = stack[stack.length - 1];
      if (top && top.type === "{") {
        top.expectingKey = false;
      }
    }
  }

  if (!inString || !stringIsKey || !activeKeyCtx) {
    return null;
  }

  // Scan forward on the same line to find any existing closing quote and colon.
  let replaceEnd = pos;
  let hasClosingQuote = false;
  let afterQuote = pos;
  let fwdEscaped = false;
  for (let i = pos; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n" || ch === "\r") {
      break;
    }
    if (fwdEscaped) {
      fwdEscaped = false;
      continue;
    }
    if (ch === "\\") {
      fwdEscaped = true;
      continue;
    }
    if (ch === '"') {
      replaceEnd = i;
      hasClosingQuote = true;
      afterQuote = i + 1;
      break;
    }
  }

  let hasColonAfter = false;
  if (hasClosingQuote) {
    let j = afterQuote;
    while (j < text.length && (text[j] === " " || text[j] === "\t")) {
      j++;
    }
    hasColonAfter = text[j] === ":";
  }

  return {
    prefix: text.slice(activeKeyCtx.openQuote + 1, pos),
    replaceStart: activeKeyCtx.openQuote + 1,
    replaceEnd,
    hasClosingQuote,
    hasColonAfter,
    nestingDepth: activeKeyCtx.nestingDepth,
    parentKey: activeKeyCtx.parentKey,
    fieldPath: activeKeyCtx.fieldPath,
  };
}

/**
 * Returns ranked auto-completion suggestions for a detected JSON key context.
 */
export function getConditionKeySuggestions(
  ctx: KeyCompletionContext,
  fields: readonly FieldSuggestion[],
): KeySuggestion[] {
  const query = ctx.prefix.toLowerCase();
  const isFieldOperatorContext =
    ctx.nestingDepth >= 2 &&
    ctx.parentKey !== null &&
    !CONTAINER_OPERATORS.has(ctx.parentKey);

  const pathPrefix = ctx.fieldPath.length > 0 ? `${ctx.fieldPath.join(".")}.` : null;

  const directSubKeys: FieldSuggestion[] = [];
  if (pathPrefix) {
    const seen = new Set<string>();
    for (const f of fields) {
      if (f.key.startsWith(pathPrefix)) {
        const rest = f.key.slice(pathPrefix.length);
        if (rest && !seen.has(rest)) {
          seen.add(rest);
          directSubKeys.push({ key: rest, kind: "field", detail: f.detail });
        }
      }
    }
    directSubKeys.sort((a, b) => {
      const aDots = a.key.split(".").length;
      const bDots = b.key.split(".").length;
      if (aDots !== bDots) return aDots - bDots;
      return a.key.localeCompare(b.key);
    });
  }

  let ordered: KeySuggestion[];
  if (query.startsWith("$")) {
    ordered = [...OPERATOR_SUGGESTIONS];
  } else if (directSubKeys.length > 0) {
    // Nested object or array-of-objects field (e.g. `profile: { "|" }`, `a: { b: { "|" } }`,
    // `reviews: { $elemMatch: { "|" } }`): prioritize its sub-fields, then operators.
    const fieldOps = OPERATOR_SUGGESTIONS.filter((o) => o.scope === "field" || o.scope === "both");
    ordered = [...directSubKeys, ...fieldOps];
  } else if (isFieldOperatorContext) {
    // Scalar field object (e.g. `age: { "|" }`): prioritize field operators, keep fields as fallback.
    const fieldOps = OPERATOR_SUGGESTIONS.filter((o) => o.scope === "field" || o.scope === "both");
    ordered = [...fieldOps, ...fields];
  } else {
    // Root object or inside top-level $and / $or / $not / $elemMatch / $every.
    const rootOps = OPERATOR_SUGGESTIONS.filter((o) => o.scope === "both");
    const otherOps = OPERATOR_SUGGESTIONS.filter((o) => o.scope === "field");
    ordered = [...fields, ...rootOps, ...otherOps];
  }

  const maxResults = 20;
  if (!query) {
    return ordered.slice(0, maxResults);
  }

  const prefixMatches: KeySuggestion[] = [];
  const containsMatches: KeySuggestion[] = [];
  for (const item of ordered) {
    const lower = item.key.toLowerCase();
    if (lower === query) {
      prefixMatches.unshift(item);
    } else if (lower.startsWith(query)) {
      prefixMatches.push(item);
    } else if (lower.includes(query)) {
      containsMatches.push(item);
    }
  }

  return [...prefixMatches, ...containsMatches].slice(0, maxResults);
}

/**
 * Applies a selected key suggestion to the editor text and returns the updated
 * text plus the next caret offset.
 */
export function applyKeySuggestion(
  text: string,
  ctx: KeyCompletionContext,
  suggestion: KeySuggestion,
): { nextText: string; nextCursor: number } {
  const before = text.slice(0, ctx.replaceStart);
  const after = text.slice(ctx.replaceEnd);

  if (ctx.hasClosingQuote) {
    if (ctx.hasColonAfter) {
      const nextText = `${before}${suggestion.key}${after}`;
      return { nextText, nextCursor: ctx.replaceStart + suggestion.key.length };
    }
    // `after` starts with the existing closing `"`.
    const nextText = `${before}${suggestion.key}": ${after.slice(1)}`;
    return { nextText, nextCursor: ctx.replaceStart + suggestion.key.length + 3 };
  }

  const nextText = `${before}${suggestion.key}": ${after}`;
  return { nextText, nextCursor: ctx.replaceStart + suggestion.key.length + 3 };
}
