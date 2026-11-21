# Mongory Central Page & Interactive Query Playground

Static web playground and cross-language ecosystem hub for **Mongory**, powered client-side by zero-dependency [`mongory-js`](https://www.npmjs.com/package/mongory-js).

## Features

- **Three-Pane Live Playground**: Edit `Records (JSON)` and `Query Condition (JSON)` and inspect live match counts and per-record pass/miss results.
- **Interactive Explain & Short-Circuit Trace Debugger**: Inspect priority-ordered execution plans (`explainTree()`) and per-node `PASS` / `FAIL` / `SKIP` traces (`traceTree()`) with bounded JSON snapshots and CLI text toggle.
- **Scenario Presets & URL Sharing**: Built-in presets for e-commerce promos, feature flags, RBAC grants, array operators (`$elemMatch` / `$every` / `$size`), and dot-path / priority ordering with URL `#state=...` sharing.
- **Cross-Language Hub**: Installation guides and equivalent snippets for `mongory-js`, `mongory-go`, `mongory-py`, `mongory-rb`, and `mongory-core`, plus all 17 `mongory-spec v0.2.0` operators and measured benchmarks.

## Local Development

```bash
npm install
npm run dev
```

## Verify & Build Static Bundle

```bash
npm run typecheck
npm test
npm run build
```

Static assets are emitted to `dist/` (with relative `base: "./"`) and automatically deployed to GitHub Pages (`https://mongoryhq.github.io/mongory-central/`) via `.github/workflows/deploy.yml` (also compatible with Cloudflare Pages by publishing `dist`).
