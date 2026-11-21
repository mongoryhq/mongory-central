import type { BenchmarkRow, LanguageDoc, OperatorSpec } from "../types.js";

export const LANGUAGES: ReadonlyArray<LanguageDoc> = [
  {
    key: "js",
    name: "TypeScript / JS",
    pkg: "mongory-js",
    version: "v0.1.1",
    repoUrl: "https://github.com/mongoryhq/mongory-js",
    installCmd: "npm install mongory-js",
    runtime: "Browser, Node >= 20, Bun, Deno, Edge · 0 runtime deps · ESM + CJS + .d.ts",
    highlights: [
      "Runs 100% client-side in this Playground with zero WASM/N-API startup cost",
      "Collision-free `mongory` namespace + tree-shakable `compileMatcher` / `mongoryAnd` exports",
      "Built-in `explainTree()` & `traceTree()` AST with bounded JSON-safe snapshots",
      "Symmetric `number` / `bigint`, `Date`, `Uint8Array`, `__proto__` guard, `maxDepth`/`maxNodes`",
    ],
    code: `import { mongory } from "mongory-js";

const matcher = mongory.compile({
  status: "active",
  age: { $gte: 18 },
  $or: [{ tags: "ts" }, { role: "admin" }],
});

const matched = users.filter(matcher.match);
const { tree } = matcher.traceTree(users[0]);`,
  },
  {
    key: "go",
    name: "Go",
    pkg: "github.com/mongoryhq/mongory-go",
    version: "v0.3.0",
    repoUrl: "https://github.com/mongoryhq/mongory-go",
    installCmd: "go get github.com/mongoryhq/mongory-go",
    runtime: "Pure Go 1.22+ · 0 external dependencies · concurrent-safe Matcher",
    highlights: [
      "Zero heap allocations (`0 B/op`, `0 allocs/op`) on map hot-paths & `Count` scans",
      "Direct struct field & `mongory` / `bson` / `json` tag resolution without pre-serialization",
      "Typed `nil` slice normalization for `$in` / `$nin` / `$and` / `$or`, plus `MaxDepth` / `MaxNodes`",
      "Compile-scoped `WithConverter`, `WithField`, and `WithOperator` (`Option` presets)",
    ],
    code: `package main

import "github.com/mongoryhq/mongory-go"

func filterUsers(users []mongory.M) ([]mongory.M, string) {
	m := mongory.MustCompile(mongory.M{
		"status": "active",
		"age":    mongory.M{"$gte": 18},
		"$or":    mongory.A{mongory.M{"tags": "go"}, mongory.M{"role": "admin"}},
	})

	matched := mongory.Filter(users, m)
	_, trace := m.Trace(users[0])
	return matched, trace
}`,
  },
  {
    key: "py",
    name: "Python",
    pkg: "mongory",
    version: "v0.1.0",
    repoUrl: "https://github.com/mongoryhq/mongory-py",
    installCmd: "pip install mongory",
    runtime: "Python 3.10–3.14 · CPython C-API over mongory-core (C99) · 0 runtime deps · .pyi stubs",
    highlights: [
      "Native C99 engine (`mongory-core`) with shallow `PyObject*` adapters — 2.1x–5.4x faster than type-safe pure Python",
      "Immune to Python's `bool <: int` trap (`True != 1`, `False != 0`) across `$eq`, `$in`, and ordering operators",
      "Ergonomic `mongory.op` constants (`op.GTE`, `op.IN`), `re.compile` support, and callable `filter(matcher, records)`",
      "Precompiled wheels for Linux (x86_64/aarch64 glibc & musl), macOS (Intel & Apple Silicon), and Windows AMD64",
    ],
    code: `import mongory
from mongory import op

matcher = mongory.compile({
    "status": "active",
    "age": {op.GTE: 18},
    op.OR: [{"tags": "py"}, {"role": "admin"}],
})

matched = matcher.filter_list(users)
ok, trace_tree = matcher.trace_tree(users[0])`,
  },
  {
    key: "rb",
    name: "Ruby",
    pkg: "mongory",
    version: "v0.9.1",
    repoUrl: "https://github.com/mongoryhq/mongory-rb",
    installCmd: "gem install mongory",
    runtime: "Ruby >= 2.6 · optional native C extension (mongory-core) + pure Ruby fallback",
    highlights: [
      "Chainable collection DSL (`records.mongory.where(...).any_of(...)`) + symbol operator sugar",
      "Seamless ActiveRecord / custom converter integration via `Mongory.register`",
      "Colored CLI `explain` and `trace` visualization + `c` backend for 3-10x speedups",
      "Precompiled multi-platform Ruby 2.6-4.0 native gems (Linux musl/glibc, macOS, Windows)",
    ],
    code: `require "mongory"

Mongory.register(Array)
Mongory.enable_symbol_snippets!

query = users.mongory
  .where(status: "active", :age.gte => 18)
  .any_of({ tags: "ruby" }, { role: "admin" })

matched = query.to_a
query.explain
query.trace { |u| puts u }`,
  },
  {
    key: "core",
    name: "C99 Core",
    pkg: "mongory-core",
    version: "v0.2.1",
    repoUrl: "https://github.com/mongoryhq/mongory-core",
    installCmd: "cmake -S . -B build && cmake --build build",
    runtime: "Portable C99 · 0 dependencies · arena memory pool & pluggable regex/allocators",
    highlights: [
      "Arena memory-pool architecture (`mongory_memory_pool`) eliminates per-node free churn",
      "Thread-safe matcher compilation with per-pool locking and reusable scratch pools",
      "Pluggable regex engine & external value adapters (`MG_TABLE_WRAP`, custom converters)",
      "Shared C99 foundation backing both `mongory-py` (CPython C-API) and `mongory-rb` native C extensions",
    ],
    code: `#include <mongory-core.h>

mongory_init();
mongory_memory_pool *pool = mongory_memory_pool_new();
mongory_value *query = MG_TABLE_WRAP(pool, 2,
  "status", mongory_value_wrap_s(pool, "active"),
  "age", MG_TABLE_WRAP(pool, 1, "$gte", mongory_value_wrap_i(pool, 18))
);
mongory_matcher *m = mongory_matcher_new(pool, query, NULL);
bool ok = mongory_matcher_match(m, doc);
pool->free(pool);
mongory_cleanup();`,
  },
];

export const OPERATORS: ReadonlyArray<OperatorSpec> = [
  { name: "$eq", category: "Compare", priority: "1", summary: "Deep structural & cross-numeric equality (also matches array elements). Explicit `$eq: null` rejects missing keys.", example: `{ age: { $eq: 18 } }` },
  { name: "$ne", category: "Compare", priority: "1", summary: "Strict negation of `$eq` including array element exclusion.", example: `{ status: { $ne: "banned" } }` },
  { name: "$gt", category: "Compare", priority: "3", summary: "Strictly greater than for widened numbers, strings, or Dates; incompatible types return `false`.", example: `{ total: { $gt: 99.5 } }` },
  { name: "$gte", category: "Compare", priority: "3", summary: "Greater than or equal to (with implicit element check on arrays).", example: `{ age: { $gte: 18 } }` },
  { name: "$lt", category: "Compare", priority: "3", summary: "Strictly less than.", example: `{ retries: { $lt: 3 } }` },
  { name: "$lte", category: "Compare", priority: "3", summary: "Less than or equal to.", example: `{ priority: { $lte: 5 } }` },
  { name: "$in", category: "Inclusion", priority: "2–3+", summary: "Matches scalar inclusion or array intersection; upgrades automatically to O(1) type-bucketed hash Set for >= 16 items.", example: `{ tier: { $in: ["vip", "gold"] } }` },
  { name: "$nin", category: "Inclusion", priority: "2–3+", summary: "Negated `$in` (rejects scalar match or any overlapping array element).", example: `{ region: { $nin: ["blocked", "test"] } }` },
  { name: "$exists", category: "Existence", priority: "2", summary: "Distinguishes present keys (including `null` / `false`) from `MISSING` absent keys.", example: `{ deletedAt: { $exists: false } }` },
  { name: "$present", category: "Existence", priority: "2", summary: "True iff value exists and is non-null, non-false, and non-empty string/array/object.", example: `{ payload: { $present: true } }` },
  { name: "$and", category: "Composite", priority: "1 + sum", summary: "Short-circuits on first `FAIL`; empty `$and: []` matches everything. Flattens and sorts branches by priority.", example: `{ $and: [{ active: true }, { age: { $gte: 18 } }] }` },
  { name: "$or", category: "Composite", priority: "1 + sum", summary: "Short-circuits on first `PASS`; empty `$or: []` matches nothing (`fail-closed`).", example: `{ $or: [{ role: "admin" }, { owner: true }] }` },
  { name: "$not", category: "Composite", priority: "1 + inner", summary: "Inverts inner condition outcome (literal or sub-document).", example: `{ suspended: { $not: true } }` },
  { name: "$elemMatch", category: "Array", priority: "4 + inner", summary: "Requires at least one array element to satisfy all grouped sub-conditions; short-circuits on first matching element.", example: `{ items: { $elemMatch: { inStock: true, qty: { $gte: 2 } } } }` },
  { name: "$every", category: "Array", priority: "4 + inner", summary: "Requires non-empty array where every element satisfies all conditions; short-circuits on first failure.", example: `{ scores: { $every: { $gte: 60 } } }` },
  { name: "$size", category: "Array", priority: "2 + inner", summary: "Checks array length against an exact integer or nested matcher (`{ $size: { $gte: 2 } }`).", example: `{ tags: { $size: { $gte: 1, $lte: 4 } } }` },
  { name: "$regex", category: "Regex", priority: "8 (higher cost)", summary: "Stateless pattern match in common subset (RE2/PCRE2/Oniguruma/ECMA-262) with optional sibling `$options` (`i`, `m`, `s`).", example: `{ email: { $regex: "^ann@", $options: "i" } }` },
];

export const SPEC_RULES: ReadonlyArray<{ title: string; rule: string }> = [
  {
    title: "Missing Key vs null",
    rule: "`{ a: null }` matches both `{}` and `{ a: null }`; explicit `{ a: { $eq: null } }` matches only explicit `null`.",
  },
  {
    title: "MongoDB Implicit Array Matching",
    rule: "`{ tags: \"ts\" }` matches arrays containing `\"ts\"`; `{ items: { a: 1, b: 2 } }` compiles an implicit `$elemMatch` so one element satisfies both.",
  },
  {
    title: "Canonical Index Keys & Escaped Dots",
    rule: "`\"tags.0\"` and `\"tags.-1\"` index arrays, while `\"01\"` and `\"-0\"` look up sub-fields; `\\.` preserves literal dot keys.",
  },
  {
    title: "Priority-Ordered Execution",
    rule: "Branches reorder automatically by cost (`$eq` -> `$exists`/`$in` -> `$gte` -> `$elemMatch` -> `$regex`), short-circuiting expensive checks on failure.",
  },
  {
    title: "Common Cross-Engine Regex Subset",
    rule: "Only `i`, `m`, `s` `$options` are valid; unknown `$` operators or misplaced `$options` fail fast at compile time.",
  },
];

export const BENCHMARKS: ReadonlyArray<BenchmarkRow> = [
  { caseName: "simple", description: "{ age: { $gte: 18 } }", jsNodeNs: "18.7 ns", jsBunNs: "7.8 ns", goMapsNs: "25.12 ns", goAlloc: "0 allocs/op" },
  { caseName: "or", description: "$or(age >= 18, status == active)", jsNodeNs: "43.0 ns", jsBunNs: "17.5 ns", goMapsNs: "39.86 ns", goAlloc: "0 allocs/op" },
  { caseName: "nested_and", description: "profile.city + status + age < 40", jsNodeNs: "54.6 ns", jsBunNs: "21.6 ns", goMapsNs: "42.52 ns", goAlloc: "0 allocs/op" },
  { caseName: "in_array_field", description: "tags $in [go, rust]", jsNodeNs: "39.0 ns", jsBunNs: "15.3 ns", goMapsNs: "45.20 ns", goAlloc: "0 allocs/op" },
  { caseName: "large_in_500", description: "name $in [500 items] (Set lookup)", jsNodeNs: "41.9 ns", jsBunNs: "16.1 ns", goMapsNs: "28.13 ns", goAlloc: "0 allocs/op" },
  { caseName: "regex", description: "name $regex ^user[a-f]$", jsNodeNs: "39.7 ns", jsBunNs: "17.3 ns", goMapsNs: "44.37 ns", goAlloc: "0 allocs/op" },
];
