import assert from "node:assert/strict";
import test from "node:test";
import {
  applyKeySuggestion,
  detectJsonKeyContext,
  extractRecordFieldSuggestions,
  getConditionKeySuggestions,
} from "../src/lib/conditionAutocomplete.js";

test("extractRecordFieldSuggestions collects top-level keys, nested dot paths, and array object keys", () => {
  const fields = extractRecordFieldSuggestions([
    { name: "Alice", age: 30, address: { city: "Taipei" }, reviews: [{ rating: 5, text: "great" }] },
    { name: "Bob", age: null, active: true },
  ]);

  const keys = fields.map((f) => f.key);
  assert.ok(keys.includes("name"));
  assert.ok(keys.includes("age"));
  assert.ok(keys.includes("active"));
  assert.ok(keys.includes("address.city"));
  assert.ok(keys.includes("reviews.rating"));
  assert.ok(keys.includes("rating"));

  const age = fields.find((f) => f.key === "age");
  assert.equal(age?.detail, "number | null");
});

test("detectJsonKeyContext detects root and nested key positions and ignores value strings", () => {
  // Root key being typed (incomplete JSON)
  const rootText = '{\n  "ag';
  const rootCtx = detectJsonKeyContext(rootText, rootText.length);
  assert.ok(rootCtx);
  assert.equal(rootCtx.prefix, "ag");
  assert.equal(rootCtx.nestingDepth, 1);
  assert.equal(rootCtx.parentKey, null);
  assert.equal(rootCtx.hasClosingQuote, false);

  // Nested operator key inside field object
  const nestedText = '{\n  "age": { "$g" }\n}';
  const nestedCursor = nestedText.indexOf("$g") + 2;
  const nestedCtx = detectJsonKeyContext(nestedText, nestedCursor);
  assert.ok(nestedCtx);
  assert.equal(nestedCtx.prefix, "$g");
  assert.equal(nestedCtx.nestingDepth, 2);
  assert.equal(nestedCtx.parentKey, "age");
  assert.equal(nestedCtx.hasClosingQuote, true);
  assert.equal(nestedCtx.hasColonAfter, false);

  // String value (after `:`) must NOT trigger key completion
  const valueText = '{\n  "role": "adm"\n}';
  const valueCursor = valueText.indexOf("adm") + 3;
  assert.equal(detectJsonKeyContext(valueText, valueCursor), null);

  // Array element string must NOT trigger key completion
  const arrText = '{\n  "tags": ["go", "ru"]\n}';
  const arrCursor = arrText.indexOf("ru") + 2;
  assert.equal(detectJsonKeyContext(arrText, arrCursor), null);
});

test("getConditionKeySuggestions prioritizes fields at root and operators inside field objects", () => {
  const fields = extractRecordFieldSuggestions([
    { age: 30, address: { city: "Taipei" }, active: true },
  ]);

  const rootCtx = detectJsonKeyContext('{ "" }', 3)!;
  const rootSuggestions = getConditionKeySuggestions(rootCtx, fields);
  assert.equal(rootSuggestions[0].kind, "field");

  const fieldOpCtx = detectJsonKeyContext('{ "age": { "$" } }', 13)!;
  const opSuggestions = getConditionKeySuggestions(fieldOpCtx, fields);
  assert.ok(opSuggestions.every((s) => s.kind === "operator"));
  assert.ok(opSuggestions.some((s) => s.key === "$gte"));

  const nestedSubCtx = detectJsonKeyContext('{ "address": { "ci" } }', 18)!;
  const subSuggestions = getConditionKeySuggestions(nestedSubCtx, fields);
  assert.equal(subSuggestions[0].key, "city");
});

test("getConditionKeySuggestions suggests sub-fields immediately in multi-level nested objects and $elemMatch", () => {
  const fields = extractRecordFieldSuggestions([
    {
      a: { b: { c: 1, d: "ok" } },
      reviews: [{ rating: 5, verified: true }],
    },
  ]);

  // Deeply nested `{ "a": { "b": { "" } } }` with empty prefix should show `c` and `d` first (not truncated by operators!)
  const deepText = '{ "a": { "b": { "" } } }';
  const deepCtx = detectJsonKeyContext(deepText, deepText.indexOf('""') + 1)!;
  assert.deepEqual(deepCtx.fieldPath, ["a", "b"]);
  const deepSuggestions = getConditionKeySuggestions(deepCtx, fields);
  assert.equal(deepSuggestions[0].key, "c");
  assert.equal(deepSuggestions[1].key, "d");

  // Inside `{ "reviews": { "$elemMatch": { "" } } }`, element sub-fields `rating` / `verified` come first
  const elemText = '{ "reviews": { "$elemMatch": { "" } } }';
  const elemCtx = detectJsonKeyContext(elemText, elemText.indexOf('""') + 1)!;
  assert.deepEqual(elemCtx.fieldPath, ["reviews"]);
  const elemSuggestions = getConditionKeySuggestions(elemCtx, fields);
  assert.equal(elemSuggestions[0].key, "rating");
  assert.equal(elemSuggestions[1].key, "verified");
});

test("applyKeySuggestion inserts closing quote and colon when missing, and preserves existing colon", () => {
  const text1 = '{\n  "$g';
  const ctx1 = detectJsonKeyContext(text1, text1.length)!;
  const res1 = applyKeySuggestion(text1, ctx1, { key: "$gte", kind: "operator", detail: "", scope: "field" });
  assert.equal(res1.nextText, '{\n  "$gte": ');
  assert.equal(res1.nextCursor, res1.nextText.length);

  const text2 = '{\n  "ag": 18\n}';
  const ctx2 = detectJsonKeyContext(text2, 7)!;
  const res2 = applyKeySuggestion(text2, ctx2, { key: "age", kind: "field", detail: "number" });
  assert.equal(res2.nextText, '{\n  "age": 18\n}');
  assert.equal(res2.nextCursor, 8);
});
