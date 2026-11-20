import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_RECORDS,
  decodeImportBuffer,
  importRecordsFromText,
  parseCsvToRecords,
  validateImportFileSize,
} from "../src/lib/importRecords.js";

test("parseCsvToRecords converts header rows and coerces unquoted scalars while preserving quoted strings", () => {
  const csv = [
    '\uFEFFname,age,active,zip,note,score',
    'Alice,30,true,02138,"hello, world",98.5',
    'Bob,15,false,"007","line 1\nline ""2""",',
    'Cid,,null,"42","",-10',
  ].join("\r\n") + "\r\n";

  const res = parseCsvToRecords(csv);
  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.deepEqual(res.records, [
    { name: "Alice", age: 30, active: true, zip: "02138", note: "hello, world", score: 98.5 },
    { name: "Bob", age: 15, active: false, zip: "007", note: 'line 1\nline "2"', score: null },
    { name: "Cid", age: null, active: null, zip: "42", note: "", score: -10 },
  ]);
});

test("parseCsvToRecords supports Excel exports (TRUE/FALSE, empty \"\", BOM, sep=;, semicolon/tab delimiters)", () => {
  const excelComma = [
    '\uFEFFname,active,verified,note,empty_quoted,empty_raw',
    'Alice,TRUE,False,"TRUE","",',
    'Bob,FALSE,True, "", ,""',
  ].join("\r\n") + "\r\n";

  const r1 = parseCsvToRecords(excelComma);
  assert.equal(r1.ok, true);
  if (r1.ok) {
    assert.deepEqual(r1.records, [
      { name: "Alice", active: true, verified: false, note: "TRUE", empty_quoted: "", empty_raw: null },
      { name: "Bob", active: false, verified: true, note: "", empty_quoted: null, empty_raw: "" },
    ]);
  }

  const excelSepDirective = '\uFEFFsep=;\r\nname;price;active\r\n"Book; Vol 1";19.99;TRUE\r\nPen;2;FALSE\r\n';
  const r2 = parseCsvToRecords(excelSepDirective);
  assert.equal(r2.ok, true);
  if (r2.ok) {
    assert.deepEqual(r2.records, [
      { name: "Book; Vol 1", price: 19.99, active: true },
      { name: "Pen", price: 2, active: false },
    ]);
  }

  const excelSemicolonAuto = 'name;count;ok\r\nAlpha;10;TRUE\r\nBeta;0;FALSE\r\n';
  const r3 = parseCsvToRecords(excelSemicolonAuto);
  assert.equal(r3.ok, true);
  if (r3.ok) {
    assert.deepEqual(r3.records, [
      { name: "Alpha", count: 10, ok: true },
      { name: "Beta", count: 0, ok: false },
    ]);
  }
});

test("parseCsvToRecords merges repeated headers into arrays and skips blank unquoted cells", () => {
  const csv = 'tag,tag,tag,\na,b,c\nx,,""\n,,,\n';
  const res = parseCsvToRecords(csv);
  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.deepEqual(res.records, [
    { tag: ["a", "b", "c"], col_4: null },
    { tag: ["x", ""], col_4: null },
    { tag: [], col_4: null },
  ]);
});

test("parseCsvToRecords rejects empty input and unterminated quotes", () => {
  assert.equal(parseCsvToRecords("   \n").ok, false);
  assert.equal(parseCsvToRecords('name,age\n"Alice,30').ok, false);
});

test("importRecordsFromText handles JSON arrays, single JSON objects, CSV files, and invalid files", () => {
  const jsonArr = importRecordsFromText('[{"id":1},{"id":2}]', "users.json");
  assert.equal(jsonArr.ok, true);
  if (jsonArr.ok) {
    assert.equal(jsonArr.format, "json");
    assert.equal(jsonArr.count, 2);
    assert.deepEqual(jsonArr.records, [{ id: 1 }, { id: 2 }]);
  }

  const jsonObj = importRecordsFromText('{"id":1,"name":"solo"}', "single.json");
  assert.equal(jsonObj.ok, true);
  if (jsonObj.ok) {
    assert.equal(jsonObj.count, 1);
    assert.deepEqual(jsonObj.records, [{ id: 1, name: "solo" }]);
  }

  const csvRes = importRecordsFromText("id,name\n1,Ann\n2,Bob", "users.csv");
  assert.equal(csvRes.ok, true);
  if (csvRes.ok) {
    assert.equal(csvRes.format, "csv");
    assert.equal(csvRes.count, 2);
    assert.deepEqual(csvRes.records, [
      { id: 1, name: "Ann" },
      { id: 2, name: "Bob" },
    ]);
  }

  assert.equal(importRecordsFromText("123", "scalar.json").ok, false);
  assert.equal(importRecordsFromText("{bad", "broken.json").ok, false);
  assert.equal(importRecordsFromText("hello", "notes.txt").ok, false);
});

test("validateImportFileSize and importRecordsFromText enforce the 2 MB file size limit", () => {
  assert.equal(validateImportFileSize(MAX_IMPORT_FILE_BYTES), null);
  const err = validateImportFileSize(MAX_IMPORT_FILE_BYTES + 1);
  assert.ok(err && err.includes("2.00 MB"));

  const oversized = `a\n${"x".repeat(MAX_IMPORT_FILE_BYTES)}`;
  const res = importRecordsFromText(oversized, "huge.csv");
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.ok(res.error.includes("too large"));
  }
});

test("CSV preserves unsafe long integers, supports __proto__ headers, .tsv, UTF-16LE BOM, and warns on extra columns", () => {
  // Long integers (> 2^53 - 1) stay strings; __proto__ stays an own property
  const csv = "__proto__,order_id,safe_id\nfoo,12345678901234567890,9007199254740991\n";
  const res = importRecordsFromText(csv, "orders.csv");
  assert.equal(res.ok, true);
  if (res.ok) {
    const rec = res.records[0] as Record<string, unknown>;
    assert.equal(Object.prototype.hasOwnProperty.call(rec, "__proto__"), true);
    assert.equal(rec["__proto__"], "foo");
    assert.equal(rec.order_id, "12345678901234567890");
    assert.equal(rec.safe_id, 9007199254740991);
  }

  // Extra columns beyond header produce warning
  const extraRes = importRecordsFromText("a,b\n1,2,3\n4,5\n", "extra.csv");
  assert.equal(extraRes.ok, true);
  if (extraRes.ok) {
    assert.equal(extraRes.warnings.length, 1);
    assert.ok(extraRes.warnings[0].includes("1 row(s)"));
  }

  // .tsv extension accepted
  const tsvRes = importRecordsFromText("name\tscore\nAnn\t99\n", "scores.tsv");
  assert.equal(tsvRes.ok, true);
  if (tsvRes.ok) {
    assert.deepEqual(tsvRes.records, [{ name: "Ann", score: 99 }]);
  }

  // Record count cap enforced
  const tooManyRows = `a\n${"1\n".repeat(MAX_IMPORT_RECORDS + 1)}`;
  const capRes = importRecordsFromText(tooManyRows, "many.csv");
  assert.equal(capRes.ok, false);

  // UTF-16LE BOM decoding
  const str = "a,b\r\n1,2";
  const buf = new ArrayBuffer(2 + str.length * 2);
  const view = new Uint8Array(buf);
  view[0] = 0xff;
  view[1] = 0xfe;
  for (let i = 0; i < str.length; i++) {
    view[2 + i * 2] = str.charCodeAt(i) & 0xff;
    view[2 + i * 2 + 1] = str.charCodeAt(i) >> 8;
  }
  const decoded = decodeImportBuffer(buf);
  assert.equal(decoded.text.replace(/^\uFEFF/, ""), "a,b\r\n1,2");
  assert.equal(decoded.warning, undefined);
});
