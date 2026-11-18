import test from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, OPERATORS } from "../src/data/ecosystem.js";
import { PRESETS } from "../src/data/presets.js";
import { tokenizeCliTrace, tokenizeCode } from "../src/lib/highlight.js";

test("tokenizeCode preserves exact characters across all ecosystem languages", () => {
  for (const lang of LANGUAGES) {
    const tokens = tokenizeCode(lang.code, lang.key);
    assert.equal(tokens.map((t) => t.text).join(""), lang.code, `mismatch for ${lang.key}`);
    assert.ok(
      tokens.some((t) => t.kind !== "plain" && t.kind !== "punct"),
      `expected highlighted tokens for ${lang.key}`
    );
  }
});

test("tokenizeCode preserves exact characters for all operator examples", () => {
  for (const op of OPERATORS) {
    const tokens = tokenizeCode(op.example, "js");
    assert.equal(tokens.map((t) => t.text).join(""), op.example, `mismatch for ${op.name}`);
  }
});

test("tokenizeCode classifies key tokens across js, go, rb, and core", () => {
  const jsTokens = tokenizeCode('import { mongory } from "mongory-js"; const m = mongory({ age: { $gte: 18 }, ok: true });', "js");
  assert.ok(jsTokens.some((t) => t.kind === "kw" && t.text === "import"));
  assert.ok(jsTokens.some((t) => t.kind === "fn" && t.text === "mongory"));
  assert.ok(jsTokens.some((t) => t.kind === "prop" && t.text === "age"));
  assert.ok(jsTokens.some((t) => t.kind === "op" && t.text === "$gte"));
  assert.ok(jsTokens.some((t) => t.kind === "num" && t.text === "18"));
  assert.ok(jsTokens.some((t) => t.kind === "bool" && t.text === "true"));

  const goTokens = tokenizeCode('package main\n// check age\nm, err := mongory.NewMatcher(map[string]any{"$in": []any{"pro"}})', "go");
  assert.ok(goTokens.some((t) => t.kind === "kw" && t.text === "package"));
  assert.ok(goTokens.some((t) => t.kind === "comment" && t.text === "// check age"));
  assert.ok(goTokens.some((t) => t.kind === "op" && t.text === ":="));
  assert.ok(goTokens.some((t) => t.kind === "fn" && t.text === "NewMatcher"));
  assert.ok(goTokens.some((t) => t.kind === "op" && t.text === '"$in"'));
  assert.ok(goTokens.some((t) => t.kind === "str" && t.text === '"pro"'));

  const rbTokens = tokenizeCode('require "mongory"\n# symbol extension\nc = Mongory.build_condition(:age.gte => 18, :plan => "pro")', "rb");
  assert.ok(rbTokens.some((t) => t.kind === "kw" && t.text === "require"));
  assert.ok(rbTokens.some((t) => t.kind === "comment" && t.text === "# symbol extension"));
  assert.ok(rbTokens.some((t) => t.kind === "type" && t.text === "Mongory"));
  assert.ok(rbTokens.some((t) => t.kind === "sym" && t.text === ":age"));
  assert.ok(rbTokens.some((t) => t.kind === "op" && t.text === "gte"));
  assert.ok(rbTokens.some((t) => t.kind === "op" && t.text === "=>"));

  const coreTokens = tokenizeCode('#include <mongory-core.h>\nmongory_value *q = MG_TABLE_WRAP(pool, "$gte", NULL); /* arena */', "core");
  assert.ok(coreTokens.some((t) => t.kind === "directive" && t.text === "#include"));
  assert.ok(coreTokens.some((t) => t.kind === "str" && t.text === "<mongory-core.h>"));
  assert.ok(coreTokens.some((t) => t.kind === "type" && t.text === "mongory_value"));
  assert.ok(coreTokens.some((t) => t.kind === "directive" && t.text === "MG_TABLE_WRAP"));
  assert.ok(coreTokens.some((t) => t.kind === "op" && t.text === '"$gte"'));
  assert.ok(coreTokens.some((t) => t.kind === "bool" && t.text === "NULL"));
  assert.ok(coreTokens.some((t) => t.kind === "comment" && t.text === "/* arena */"));
});

test("tokenizeCliTrace preserves text and highlights trace status tokens", () => {
  const sample = '├─ [PASS] AndMatcher ($and)\n│  ├─ [FAIL] FieldMatcher "age" $gte 18\n│  └─ [SKIP] FieldMatcher "plan"';
  const tokens = tokenizeCliTrace(sample);
  assert.equal(tokens.map((t) => t.text).join(""), sample);
  assert.ok(tokens.some((t) => t.kind === "tree" && t.text === "├─"));
  assert.ok(tokens.some((t) => t.kind === "pass" && t.text === "[PASS]"));
  assert.ok(tokens.some((t) => t.kind === "fail" && t.text === "[FAIL]"));
  assert.ok(tokens.some((t) => t.kind === "skip" && t.text === "[SKIP]"));
  assert.ok(tokens.some((t) => t.kind === "matcher" && t.text === "FieldMatcher"));
  assert.ok(tokens.some((t) => t.kind === "op" && t.text === "$gte"));
  assert.ok(tokens.some((t) => t.kind === "str" && t.text === '"age"'));
  assert.ok(tokens.some((t) => t.kind === "num" && t.text === "18"));
});

test("tokenizeCode highlights JSON records, query conditions, and presets losslessly", () => {
  for (const preset of PRESETS) {
    const recordsJson = JSON.stringify(preset.records, null, 2);
    const condJson = JSON.stringify(preset.condition, null, 2);
    assert.equal(tokenizeCode(recordsJson, "json").map((t) => t.text).join(""), recordsJson);
    assert.equal(tokenizeCode(condJson, "json").map((t) => t.text).join(""), condJson);
  }

  const sample = '{\n  "customer.tier": { "$in": ["vip", "gold"] },\n  "delta": -12.5,\n  "active": true,\n  "deletedAt": null\n}';
  const tokens = tokenizeCode(sample, "json");
  assert.equal(tokens.map((t) => t.text).join(""), sample);
  assert.ok(tokens.some((t) => t.kind === "prop" && t.text === '"customer.tier"'));
  assert.ok(tokens.some((t) => t.kind === "op" && t.text === '"$in"'));
  assert.ok(tokens.some((t) => t.kind === "str" && t.text === '"vip"'));
  assert.ok(tokens.some((t) => t.kind === "num" && t.text === "-12.5"));
  assert.ok(tokens.some((t) => t.kind === "bool" && t.text === "true"));
  assert.ok(tokens.some((t) => t.kind === "bool" && t.text === "null"));

  // Mid-typing malformed JSON must still round-trip without throwing
  const partial = '{ "orderId": "ORD-1\n  "qty": -3, undefined';
  assert.equal(tokenizeCode(partial, "json").map((t) => t.text).join(""), partial);
});
