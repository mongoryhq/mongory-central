import assert from "node:assert/strict";
import test from "node:test";
import { importRecordsFromText, parseCsvToRecords } from "../src/lib/importRecords.js";

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

test("parseCsvToRecords deduplicates repeated headers and fills missing trailing cells with null", () => {
  const csv = "tag,tag,\na,b\nx\n";
  const res = parseCsvToRecords(csv);
  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.deepEqual(res.records, [
    { tag: "a", tag_2: "b", col_3: null },
    { tag: "x", tag_2: null, col_3: null },
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
