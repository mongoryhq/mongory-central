import assert from "node:assert/strict";
import test from "node:test";
import { computeEditorKeyEdit } from "../src/lib/editorKeyActions.js";

test("auto-pairs {, [, and \" and supports selection wrapping", () => {
  const brace = computeEditorKeyEdit("", 0, 0, "{");
  assert.deepEqual(brace, { nextText: "{}", selectionStart: 1, selectionEnd: 1 });

  const bracket = computeEditorKeyEdit('{"tags": }', 9, 9, "[");
  assert.deepEqual(bracket, { nextText: '{"tags": []}', selectionStart: 10, selectionEnd: 10 });

  const quote = computeEditorKeyEdit("{  }", 2, 2, '"');
  assert.deepEqual(quote, {
    nextText: '{ "" }',
    selectionStart: 3,
    selectionEnd: 3,
    openAutocomplete: true,
  });

  const wrapped = computeEditorKeyEdit("age", 0, 3, '"');
  assert.deepEqual(wrapped, { nextText: '"age"', selectionStart: 1, selectionEnd: 4 });
});

test("skips over existing closing quote/bracket and deletes empty pairs on Backspace", () => {
  const skipQuote = computeEditorKeyEdit('{"age"}', 5, 5, '"');
  assert.deepEqual(skipQuote, { nextText: '{"age"}', selectionStart: 6, selectionEnd: 6 });

  const skipBrace = computeEditorKeyEdit("{}", 1, 1, "}");
  assert.deepEqual(skipBrace, { nextText: "{}", selectionStart: 2, selectionEnd: 2 });

  const backspacePair = computeEditorKeyEdit("{}", 1, 1, "Backspace");
  assert.deepEqual(backspacePair, { nextText: "", selectionStart: 0, selectionEnd: 0 });

  const escapedQuote = computeEditorKeyEdit('"\\"', 2, 2, '"');
  assert.equal(escapedQuote, null);

  // Caret at start of existing string should NOT treat opening quote as closing quote skip-over
  const beforeOpeningQuote = computeEditorKeyEdit('{"a": "x"}', 6, 6, '"');
  assert.equal(beforeOpeningQuote, null);
});

test("Enter auto-expands between {} and [] with 2-space indentation and preserves indent on normal lines", () => {
  const expandObj = computeEditorKeyEdit("{}", 1, 1, "Enter");
  assert.deepEqual(expandObj, {
    nextText: "{\n  \n}",
    selectionStart: 4,
    selectionEnd: 4,
  });

  const nestedText = '{\n  "age": {}\n}';
  const nestedCursor = nestedText.indexOf("{}") + 1;
  const expandNested = computeEditorKeyEdit(nestedText, nestedCursor, nestedCursor, "Enter");
  assert.deepEqual(expandNested, {
    nextText: '{\n  "age": {\n    \n  }\n}',
    selectionStart: nestedCursor + 5,
    selectionEnd: nestedCursor + 5,
  });

  const afterOpen = computeEditorKeyEdit("{\n  \"tags\": [\n}", 13, 13, "Enter");
  assert.deepEqual(afterOpen, {
    nextText: "{\n  \"tags\": [\n    \n}",
    selectionStart: 18,
    selectionEnd: 18,
  });

  const normalLine = computeEditorKeyEdit('{\n  "a": 1,\n}', 11, 11, "Enter");
  assert.deepEqual(normalLine, {
    nextText: '{\n  "a": 1,\n  \n}',
    selectionStart: 14,
    selectionEnd: 14,
  });
});

test("Tab inserts 2 spaces, indents multi-line selections, and Shift+Tab returns null when nothing to outdent", () => {
  const tabbed = computeEditorKeyEdit("{\n}", 2, 2, "Tab");
  assert.deepEqual(tabbed, { nextText: "{\n  }", selectionStart: 4, selectionEnd: 4 });

  const outdented = computeEditorKeyEdit('{\n  "a": 1\n}', 4, 4, "Tab", true);
  assert.deepEqual(outdented, { nextText: '{\n"a": 1\n}', selectionStart: 2, selectionEnd: 2 });

  // No indent to remove -> return null so keyboard users aren't trapped (WCAG 2.1.2)
  assert.equal(computeEditorKeyEdit('{\n"a": 1\n}', 2, 2, "Tab", true), null);

  // Multi-line selection Tab indents all selected lines without deleting them
  const blockText = '{\n  "a": 1,\n  "b": 2\n}';
  const selStart = blockText.indexOf('"a"');
  const selEnd = blockText.indexOf('2') + 1;
  const blockIndented = computeEditorKeyEdit(blockText, selStart, selEnd, "Tab");
  assert.equal(blockIndented?.nextText, '{\n    "a": 1,\n    "b": 2\n}');

  const blockOutdented = computeEditorKeyEdit(blockText, selStart, selEnd, "Tab", true);
  assert.equal(blockOutdented?.nextText, '{\n"a": 1,\n"b": 2\n}');
});
