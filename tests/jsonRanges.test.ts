import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS } from "../src/data/presets.js";
import { findJsonArrayElementRanges } from "../src/lib/jsonRanges.js";

test("all presets default to records[0]", () => {
  for (const preset of PRESETS) {
    assert.equal(preset.defaultSelectedIndex, 0, `${preset.id} should default to index 0`);
  }
});

test("findJsonArrayElementRanges locates exact element slices across all presets", () => {
  for (const preset of PRESETS) {
    const formatted = JSON.stringify(preset.records, null, 2);
    const ranges = findJsonArrayElementRanges(formatted);
    assert.equal(ranges.length, preset.records.length, `preset ${preset.id} range count`);

    for (let i = 0; i < ranges.length; i++) {
      const slice = formatted.slice(ranges[i].startOffset, ranges[i].endOffset);
      assert.deepEqual(JSON.parse(slice), preset.records[i], `${preset.id}[${i}]`);
      const lines = formatted.split("\n");
      assert.ok(lines[ranges[i].startLine].trimStart().startsWith("{"));
      assert.ok(lines[ranges[i].endLine].trimStart().startsWith("}"));
    }
  }
});

test("findJsonArrayElementRanges handles escaped quotes, braces in strings, scalars, and empty arrays", () => {
  assert.deepEqual(findJsonArrayElementRanges("[]"), []);
  assert.deepEqual(findJsonArrayElementRanges("   { \"not\": \"array\" }"), []);

  const mixed = '[\n  { "text": "braces } ] \\"escaped\\"" },\n  42,\n  "hello [world]",\n  true,\n  null\n]';
  const ranges = findJsonArrayElementRanges(mixed);
  assert.equal(ranges.length, 5);
  assert.deepEqual(JSON.parse(mixed.slice(ranges[0].startOffset, ranges[0].endOffset)), {
    text: 'braces } ] "escaped"',
  });
  assert.equal(ranges[0].startLine, 1);
  assert.equal(ranges[0].endLine, 1);
  assert.equal(mixed.slice(ranges[1].startOffset, ranges[1].endOffset), "42");
  assert.equal(mixed.slice(ranges[2].startOffset, ranges[2].endOffset), '"hello [world]"');
  assert.equal(mixed.slice(ranges[3].startOffset, ranges[3].endOffset), "true");
  assert.equal(mixed.slice(ranges[4].startOffset, ranges[4].endOffset), "null");
});
