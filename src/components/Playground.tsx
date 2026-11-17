import { useEffect, useMemo, useState } from "react";
import { MongoryError, mongory, type ExplainNode } from "mongory-js";
import { PRESETS } from "../data/presets.js";
import {
  decodeShareState,
  encodeShareState,
  formatRecordPreview,
  tryFormatJson,
} from "../lib/share.js";
import type { EvaluationState, PresetId } from "../types.js";
import { TraceTreeView } from "./TraceTreeView.js";

function countAstNodes(node: ExplainNode | null): number {
  if (!node) return 0;
  let total = 1;
  for (const child of node.children) {
    total += countAstNodes(child);
  }
  return total;
}

export function Playground() {
  const initialState = useMemo(() => {
    const shared = typeof window !== "undefined" ? decodeShareState(window.location.hash) : null;
    const preset = PRESETS.find((p) => p.id === shared?.preset) ?? PRESETS[0];
    return {
      presetId: preset.id as PresetId,
      recordsText: shared?.recordsText ?? JSON.stringify(preset.records, null, 2),
      conditionText: shared?.conditionText ?? JSON.stringify(preset.condition, null, 2),
      selectedIndex: shared?.selectedIndex ?? preset.defaultSelectedIndex,
    };
  }, []);

  const [presetId, setPresetId] = useState<PresetId>(initialState.presetId);
  const [recordsText, setRecordsText] = useState(initialState.recordsText);
  const [conditionText, setConditionText] = useState(initialState.conditionText);
  const [selectedIndex, setSelectedIndex] = useState(initialState.selectedIndex);
  const [resultFilter, setResultFilter] = useState<"all" | "matched" | "missed">("all");
  const [debugMode, setDebugMode] = useState<"visual" | "text">("visual");
  const [copiedShare, setCopiedShare] = useState(false);

  const activePreset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];

  useEffect(() => {
    const onHashChange = () => {
      const shared = decodeShareState(window.location.hash);
      if (!shared) return;
      const targetPreset = PRESETS.find((p) => p.id === shared.preset) ?? PRESETS[0];
      setPresetId(targetPreset.id);
      setRecordsText(shared.recordsText ?? JSON.stringify(targetPreset.records, null, 2));
      setConditionText(shared.conditionText ?? JSON.stringify(targetPreset.condition, null, 2));
      setSelectedIndex(shared.selectedIndex ?? targetPreset.defaultSelectedIndex);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const evaluation = useMemo<EvaluationState>(() => {
    let parsedRecords: unknown[] | null = null;
    let recordsError: string | null = null;
    try {
      const r: unknown = JSON.parse(recordsText);
      if (!Array.isArray(r)) {
        recordsError = "Records must be a JSON array [ ... ].";
      } else {
        parsedRecords = r;
      }
    } catch (err) {
      recordsError = err instanceof Error ? err.message : String(err);
    }

    let parsedCondition: Record<string, unknown> | null = null;
    let conditionError: string | null = null;
    try {
      const c: unknown = JSON.parse(conditionText);
      if (c === null || typeof c !== "object" || Array.isArray(c)) {
        conditionError = "Query condition must be a JSON object { ... }.";
      } else {
        parsedCondition = c as Record<string, unknown>;
      }
    } catch (err) {
      conditionError = err instanceof Error ? err.message : String(err);
    }

    let compileError: string | null = null;
    let compileUs: number | null = null;
    let evalUs: number | null = null;
    let explainText = "";
    let explainTree: ExplainNode | null = null;
    let matcher: ReturnType<typeof mongory.compile> | null = null;

    if (parsedCondition) {
      try {
        const t0 = performance.now();
        matcher = mongory.compile(parsedCondition);
        compileUs = Math.max(0, (performance.now() - t0) * 1000);
        explainText = matcher.explain();
        explainTree = matcher.explainTree();
      } catch (err) {
        compileError = err instanceof MongoryError || err instanceof Error ? err.message : String(err);
      }
    }

    const results: boolean[] = [];
    let matchedCount = 0;
    let selectedTraceText = "";
    let selectedTraceTree = null;

    if (matcher && parsedRecords) {
      const t0 = performance.now();
      for (let i = 0; i < parsedRecords.length; i++) {
        const ok = matcher.match(parsedRecords[i]);
        results.push(ok);
        if (ok) matchedCount++;
      }
      evalUs = Math.max(0, (performance.now() - t0) * 1000);

      if (parsedRecords.length > 0) {
        const idx = Math.min(selectedIndex, parsedRecords.length - 1);
        const rec = parsedRecords[idx];
        selectedTraceText = matcher.trace(rec).trace;
        selectedTraceTree = matcher.traceTree(rec);
      }
    }

    return {
      records: parsedRecords,
      recordsError,
      condition: parsedCondition,
      conditionError,
      compileError,
      compileUs,
      evalUs,
      explainText,
      explainTree,
      results,
      matchedCount,
      selectedTraceText,
      selectedTraceTree,
    };
  }, [recordsText, conditionText, selectedIndex]);

  const effectiveIndex =
    evaluation.records && evaluation.records.length > 0
      ? Math.min(selectedIndex, evaluation.records.length - 1)
      : 0;

  const selectPreset = (id: PresetId) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(preset.id);
    setRecordsText(JSON.stringify(preset.records, null, 2));
    setConditionText(JSON.stringify(preset.condition, null, 2));
    setSelectedIndex(preset.defaultSelectedIndex);
    setResultFilter("all");
    if (window.location.hash) {
      window.history.replaceState(null, "", "#playground");
    }
  };

  const handleShare = async () => {
    const hash = encodeShareState({
      preset: presetId,
      recordsText,
      conditionText,
      selectedIndex: effectiveIndex,
    });
    window.history.replaceState(null, "", hash);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedShare(true);
      window.setTimeout(() => setCopiedShare(false), 1800);
    } catch {
      setCopiedShare(true);
      window.setTimeout(() => setCopiedShare(false), 1800);
    }
  };

  const formatBoth = () => {
    const rf = tryFormatJson(recordsText);
    if (rf.ok) setRecordsText(rf.formatted);
    const cf = tryFormatJson(conditionText);
    if (cf.ok) setConditionText(cf.formatted);
  };

  const visibleIndices = useMemo(() => {
    if (!evaluation.records) return [];
    const list: number[] = [];
    for (let i = 0; i < evaluation.records.length; i++) {
      const ok = evaluation.results[i];
      if (resultFilter === "matched" && !ok) continue;
      if (resultFilter === "missed" && ok) continue;
      list.push(i);
    }
    return list;
  }, [evaluation.records, evaluation.results, resultFilter]);

  const astNodes = countAstNodes(evaluation.explainTree);

  return (
    <section id="playground" className="playground-section">
      <div className="hero-strip">
        <div>
          <h1>In-Memory MongoDB Query Matcher with Visual Explain &amp; Trace</h1>
          <p className="hero-subtitle">
            Runs live in your browser via zero-dependency <code>mongory-js@0.1.0</code>. Edit records or conditions,
            inspect cost-sorted priority execution, and pinpoint short-circuit skips on every record.
          </p>
        </div>
        <div className="hero-metrics">
          <div className="metric-box">
            <span className="metric-label">Compile</span>
            <span className="metric-value">
              {evaluation.compileUs !== null ? `${evaluation.compileUs.toFixed(0)} µs` : "—"}
            </span>
          </div>
          <div className="metric-box">
            <span className="metric-label">Match All</span>
            <span className="metric-value">
              {evaluation.evalUs !== null ? `${evaluation.evalUs.toFixed(0)} µs` : "—"}
            </span>
          </div>
          <div className="metric-box">
            <span className="metric-label">AST Nodes</span>
            <span className="metric-value">{astNodes || "—"}</span>
          </div>
        </div>
      </div>

      <div className="preset-bar">
        <div className="preset-pills" role="tablist" aria-label="Scenario presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === presetId}
              className={`preset-btn ${p.id === presetId ? "is-active" : ""}`}
              onClick={() => selectPreset(p.id)}
            >
              <span>{p.label}</span>
              <span className="preset-subbadge">{p.badge}</span>
            </button>
          ))}
        </div>

        <div className="preset-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={formatBoth}>
            Format JSON
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => selectPreset(presetId)}>
            Reset
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleShare()}>
            {copiedShare ? "Copied URL ✓" : "Share URL"}
          </button>
        </div>
      </div>

      <p className="preset-description">{activePreset.description}</p>

      <div className="three-pane-grid">
        {/* Column 1: Records Editor */}
        <div className="pane">
          <div className="pane-header">
            <div className="pane-title">
              <span>Records (JSON)</span>
              <span className="pill pill-muted">
                {evaluation.records ? `${evaluation.records.length} items` : "invalid"}
              </span>
            </div>
            <span className="pane-hint">Array of documents</span>
          </div>
          <textarea
            className={`code-editor ${evaluation.recordsError ? "has-error" : ""}`}
            aria-label="Records JSON editor"
            spellCheck={false}
            value={recordsText}
            onChange={(e) => setRecordsText(e.target.value)}
          />
          {evaluation.recordsError && (
            <div className="error-banner" role="alert">
              JSON error: {evaluation.recordsError}
            </div>
          )}
        </div>

        {/* Column 2: Query Condition Editor */}
        <div className="pane">
          <div className="pane-header">
            <div className="pane-title">
              <span>Query Condition (JSON)</span>
              <span className="pill pill-cyan">mongory-spec v0.2.0</span>
            </div>
            <span className="pane-hint">17 built-in operators</span>
          </div>
          <textarea
            className={`code-editor ${evaluation.conditionError || evaluation.compileError ? "has-error" : ""}`}
            aria-label="Query condition JSON editor"
            spellCheck={false}
            value={conditionText}
            onChange={(e) => setConditionText(e.target.value)}
          />
          {(evaluation.conditionError || evaluation.compileError) && (
            <div className="error-banner" role="alert">
              {evaluation.conditionError
                ? `JSON error: ${evaluation.conditionError}`
                : `Compile error: ${evaluation.compileError}`}
            </div>
          )}
        </div>

        {/* Column 3: Match Results */}
        <div className="pane pane-results">
          <div className="pane-header">
            <div className="pane-title">
              <span>Match Results</span>
              {evaluation.records && !evaluation.compileError && !evaluation.conditionError ? (
                <span className={`pill ${evaluation.matchedCount > 0 ? "pill-pass" : "pill-fail"}`}>
                  {evaluation.matchedCount} / {evaluation.records.length} matched
                </span>
              ) : (
                <span className="pill pill-muted">—</span>
              )}
            </div>
            <div className="filter-tabs">
              {(["all", "matched", "missed"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={resultFilter === f ? "is-active" : ""}
                  onClick={() => setResultFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="results-list" role="listbox" aria-label="Matched records">
            {!evaluation.records || evaluation.compileError || evaluation.conditionError ? (
              <div className="results-empty">
                Waiting for valid JSON records and query condition…
              </div>
            ) : visibleIndices.length === 0 ? (
              <div className="results-empty">
                No records in "{resultFilter}" filter.
              </div>
            ) : (
              visibleIndices.map((idx) => {
                const record = evaluation.records![idx];
                const ok = evaluation.results[idx];
                const isSelected = idx === effectiveIndex;
                return (
                  <button
                    key={idx}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`result-row ${ok ? "is-match" : "is-miss"} ${isSelected ? "is-selected" : ""}`}
                    onClick={() => setSelectedIndex(idx)}
                  >
                    <div className="result-row-top">
                      <span className="result-index">#{idx}</span>
                      <span className={`result-status ${ok ? "status-pass" : "status-fail"}`}>
                        {ok ? "MATCH" : "MISS"}
                      </span>
                      {isSelected && <span className="inspecting-tag">Trace Inspecting</span>}
                    </div>
                    <code className="result-preview">{formatRecordPreview(record)}</code>
                  </button>
                );
              })
            )}
          </div>
          <div className="results-footer">
            Click any record above to inspect its execution plan &amp; short-circuit trace below.
          </div>
        </div>
      </div>

      <TraceTreeView
        explainTree={evaluation.explainTree}
        traceTree={evaluation.selectedTraceTree?.tree ?? null}
        explainText={evaluation.explainText}
        traceText={evaluation.selectedTraceText}
        mode={debugMode}
        onModeChange={setDebugMode}
        selectedIndex={effectiveIndex}
        selectedMatched={
          evaluation.records && evaluation.records.length > 0 && evaluation.results.length > effectiveIndex
            ? evaluation.results[effectiveIndex]
            : undefined
        }
      />
    </section>
  );
}
