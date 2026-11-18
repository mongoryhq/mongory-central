import assert from "node:assert/strict";
import test from "node:test";
import { mongory } from "mongory-js";
import { BENCHMARKS, LANGUAGES, OPERATORS, SPEC_RULES } from "../src/data/ecosystem.js";
import { PRESETS } from "../src/data/presets.js";
import { decodeShareState, encodeShareState, formatRecordPreview, tryFormatJson } from "../src/lib/share.js";

test("all playground presets compile and traceTree agrees with match across every record", () => {
  assert.ok(PRESETS.length >= 4);
  for (const preset of PRESETS) {
    const matcher = mongory.compile(preset.condition);
    const explainTree = matcher.explainTree();
    assert.ok(typeof explainTree.kind === "string");
    assert.ok(preset.defaultSelectedIndex >= 0 && preset.defaultSelectedIndex < preset.records.length);

    let passCount = 0;
    let failCount = 0;
    for (const record of preset.records) {
      const matched = matcher.match(record);
      const traced = matcher.traceTree(record);
      assert.equal(traced.matched, matched, `${preset.id}: traceTree.matched should equal match()`);
      if (matched) passCount++;
      else failCount++;
    }
    assert.ok(passCount > 0 && failCount > 0, `${preset.id} should include both matched and missed examples`);
  }
});

test("URL share state round-trips ASCII, Unicode, and selected record cleanly", () => {
  const hash = encodeShareState({
    preset: "feature-flags",
    recordsText: JSON.stringify([{ city: "台北", score: 99 }]),
    conditionText: JSON.stringify({ city: "台北", score: { $gte: 90 } }),
    selectedIndex: 0,
  });
  assert.ok(hash.startsWith("#state="));
  const decoded = decodeShareState(hash);
  assert.deepEqual(decoded, {
    preset: "feature-flags",
    recordsText: JSON.stringify([{ city: "台北", score: 99 }]),
    conditionText: JSON.stringify({ city: "台北", score: { $gte: 90 } }),
    selectedIndex: 0,
  });

  assert.equal(decodeShareState("#state=%%%invalid%%%"), null);
  assert.deepEqual(decodeShareState("#preset=rbac"), { preset: "rbac" });
  assert.equal(decodeShareState(""), null);
});

test("JSON formatting and record preview helpers handle scalars, arrays, and objects", () => {
  const fmt = tryFormatJson('{"a":1,"b":[2,3]}');
  assert.equal(fmt.ok, true);
  if (fmt.ok) {
    assert.equal(fmt.formatted, '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
  }
  assert.equal(tryFormatJson("{bad").ok, false);
  assert.equal(formatRecordPreview({ a: 1, b: [1, 2], c: { d: 3 }, e: "ok", f: true }), '{ a: 1, b: [2], c: {...}, e: "ok", +1 }');
  assert.equal(formatRecordPreview(null), "null");
});

test("ecosystem hub covers all 4 languages, 17 operators, spec rules, and benchmarks", () => {
  assert.equal(LANGUAGES.length, 4);
  assert.equal(OPERATORS.length, 17);
  assert.ok(SPEC_RULES.length >= 5);
  assert.ok(BENCHMARKS.length >= 6);
});

test("arrays preset updates root and field priorities after lazy arrayRecord build", () => {
  const arraysPreset = PRESETS.find((p) => p.id === "arrays");
  assert.ok(arraysPreset);
  const matcher = mongory.compile(arraysPreset.condition);
  assert.equal(matcher.explainTree().priority, 34);
  const traced = matcher.traceTree(arraysPreset.records[0]);
  assert.equal(traced.matched, true);
  assert.equal(traced.tree.priority, 40);
  const afterExplain = matcher.explainTree();
  assert.equal(afterExplain.priority, 40);
  assert.deepEqual(
    afterExplain.children.map((c) => [c.field, c.priority]),
    [
      ["tags", 6],
      ["reviews", 14],
      ["scores", 19],
    ],
  );
});
