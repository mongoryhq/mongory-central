import { useState } from "react";
import { BENCHMARKS, LANGUAGES, OPERATORS, SPEC_RULES } from "../data/ecosystem.js";
import type { LangKey, OperatorCategory } from "../types.js";
import { CodeBlock, HighlightedCode } from "./CodeBlock.js";

const CATEGORIES: ReadonlyArray<OperatorCategory> = [
  "All",
  "Compare",
  "Inclusion",
  "Existence",
  "Composite",
  "Array",
  "Regex",
];

function InlineCodeText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, idx) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code key={idx} className="inline-code">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={idx}>{part}</span>
        ),
      )}
    </>
  );
}

export function Hub() {
  const [selectedLang, setSelectedLang] = useState<LangKey>("js");
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<OperatorCategory>("All");

  const activeLang = LANGUAGES.find((l) => l.key === selectedLang) ?? LANGUAGES[0];
  const filteredOps =
    selectedCategory === "All"
      ? OPERATORS
      : OPERATORS.filter((op) => op.category === selectedCategory);

  const copyInstall = async () => {
    try {
      await navigator.clipboard.writeText(activeLang.installCmd);
    } catch {
      // ignore clipboard errors in restricted browsers
    }
    setCopiedCmd(true);
    window.setTimeout(() => setCopiedCmd(false), 1600);
  };

  return (
    <div className="hub-container">
      {/* Cross-Language Hub */}
      <section id="languages" className="hub-section">
        <div className="section-heading">
          <h2>Cross-Language Ecosystem</h2>
          <p>
            One query semantics contract across Python, TypeScript/JS, Go, Ruby, and C99 — compiled once, zero runtime
            dependencies, built-in Explain/Trace debugging.
          </p>
        </div>

        <div className="lang-tabs" role="tablist" aria-label="Mongory language implementations">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.key}
              type="button"
              role="tab"
              aria-selected={lang.key === selectedLang}
              className={`lang-tab ${lang.key === selectedLang ? "is-active" : ""}`}
              onClick={() => setSelectedLang(lang.key)}
            >
              <span className="lang-tab-name">{lang.name}</span>
              <span className="lang-tab-ver">{lang.version}</span>
            </button>
          ))}
        </div>

        <div className="lang-card">
          <div className="lang-card-info">
            <div className="lang-header-row">
              <div>
                <h3>{activeLang.name}</h3>
                <p className="lang-runtime">{activeLang.runtime}</p>
              </div>
              <a
                className="btn btn-ghost btn-sm"
                href={activeLang.repoUrl}
                target="_blank"
                rel="noreferrer"
              >
                {activeLang.pkg} ↗
              </a>
            </div>

            <div className="install-box">
              <code>{activeLang.installCmd}</code>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyInstall()}>
                {copiedCmd ? "Copied ✓" : "Copy"}
              </button>
            </div>

            <ul className="lang-highlights">
              {activeLang.highlights.map((item) => (
                <li key={item}>
                  <InlineCodeText text={item} />
                </li>
              ))}
            </ul>
          </div>

          <CodeBlock
            code={activeLang.code}
            lang={activeLang.key}
            label={`Equivalent Query Example · ${activeLang.name}`}
          />
        </div>
      </section>

      {/* Operators & mongory-spec v0.2.1 */}
      <section id="operators" className="hub-section">
        <div className="section-heading">
          <h2>17 Operators &amp; mongory-spec v0.2.1</h2>
          <p>
            Verified against{" "}
            <a href="https://github.com/mongoryhq/mongory-spec" target="_blank" rel="noreferrer">
              mongory-spec
            </a>{" "}
            cross-language conformance fixtures (17 files · 444 assertions).
          </p>
        </div>

        <div className="spec-rules-grid">
          {SPEC_RULES.map((r) => (
            <div key={r.title} className="spec-rule-card">
              <h4>{r.title}</h4>
              <p>
                <InlineCodeText text={r.rule} />
              </p>
            </div>
          ))}
        </div>

        <div className="op-filter-bar" role="tablist" aria-label="Filter operators by category">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={cat === selectedCategory}
              className={`op-filter-btn ${cat === selectedCategory ? "is-active" : ""}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="table-wrap">
          <table className="op-table">
            <thead>
              <tr>
                <th>Operator</th>
                <th>Category</th>
                <th>Priority Cost</th>
                <th>Semantics</th>
                <th>Example</th>
              </tr>
            </thead>
            <tbody>
              {filteredOps.map((op) => (
                <tr key={op.name}>
                  <td>
                    <code className="op-name-cell">{op.name}</code>
                  </td>
                  <td>
                    <span className="pill pill-muted">{op.category}</span>
                  </td>
                  <td className="mono-cell">{op.priority}</td>
                  <td>
                    <InlineCodeText text={op.summary} />
                  </td>
                  <td>
                    <code className="example-cell">
                      <HighlightedCode code={op.example} lang="js" />
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Benchmarks & Performance Summary */}
      <section id="benchmarks" className="hub-section">
        <div className="section-heading">
          <h2>Measured Benchmarks</h2>
          <p>
            Direct measurements on Apple M3 (macOS arm64) over 10,000-record in-memory datasets comparing{" "}
            <code>mongory-js@0.2.0</code> (Node v23.1.0 / Bun 1.3.14) and <code>mongory-go v0.4.0</code> (pure Go map
            queries). Note O(1) bucketed <code>$in</code> lookup keeps 500-element membership near constant time.
          </p>
        </div>

        <div className="table-wrap">
          <table className="bench-table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Condition</th>
                <th>JS (Node 23)</th>
                <th>JS (Bun 1.3)</th>
                <th>Go (Maps)</th>
                <th>Go Heap Alloc</th>
              </tr>
            </thead>
            <tbody>
              {BENCHMARKS.map((row) => (
                <tr key={row.caseName}>
                  <td className="mono-cell">{row.caseName}</td>
                  <td>
                    <code>{row.description}</code>
                  </td>
                  <td className="mono-cell">{row.jsNodeNs} / rec</td>
                  <td className="mono-cell accent-cell">{row.jsBunNs} / rec</td>
                  <td className="mono-cell accent-cell">{row.goMapsNs} / rec</td>
                  <td>
                    <span className="pill pill-pass">{row.goAlloc}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="bench-footnote">
          Python note (<code>mongory-py v0.1.1</code> on CPython 3.14, <code>mongory-core</code> C99 extension, 10k records):{" "}
          <code>simple</code> runs in <strong>89.2 ns/rec</strong>, <code>or</code> in <strong>131.8 ns/rec</strong>, and{" "}
          <code>nested_and</code> in <strong>135.9 ns/rec</strong> — <strong>2.1x–5.4x faster</strong> than type-safe pure
          Python and faster than naive handwritten checks without <code>bool</code>/<code>int</code> guards.
          <br />
          Ruby note (from <code>mongory-rb/docs/performance.md</code>, 100k records): enabling the C extension (
          <code>mongory-core</code> arena pool) brings simple filters from ~119 ms (pure Ruby) down to ~15 ms (~150 ns/record),
          and complex <code>$or</code> queries from ~107 ms down to ~23 ms.
        </p>
      </section>
    </div>
  );
}
