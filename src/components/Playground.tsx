import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { MongoryError, mongory, type ExplainNode } from "mongory-js";
import { PRESETS } from "../data/presets.js";
import { extractRecordFieldSuggestions } from "../lib/conditionAutocomplete.js";
import {
  decodeImportBuffer,
  importRecordsFromText,
  validateImportFileSize,
} from "../lib/importRecords.js";
import {
  decodeShareState,
  encodeShareState,
  formatRecordPreview,
  tryFormatJson,
} from "../lib/share.js";
import { findJsonArrayElementRanges, type JsonLineRange } from "../lib/jsonRanges.js";
import type { EvaluationState, PresetId } from "../types.js";
import { JsonEditor } from "./JsonEditor.js";
import { TraceTreeView } from "./TraceTreeView.js";

function EditIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M11.7 1.8a1.5 1.5 0 0 1 2.1 2.1L5.4 12.3l-3.1.8.8-3.1 8.6-8.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 10.5V2.8m0 0L4.8 6M8 2.8 11.2 6M2.5 10.8v1.7A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-1.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
  const recordsEditorRef = useRef<HTMLTextAreaElement>(null);
  const conditionEditorRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importSeqRef = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState(initialState.selectedIndex);
  const [scrollToRecordTick, setScrollToRecordTick] = useState(() => (initialState.selectedIndex > 0 ? 1 : 0));
  const [resultFilter, setResultFilter] = useState<"all" | "matched" | "missed">("all");
  const [visibleLimit, setVisibleLimit] = useState(100);
  const [debugMode, setDebugMode] = useState<"visual" | "text">("visual");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "too-large" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const deferredRecordsText = useDeferredValue(recordsText);
  const deferredConditionText = useDeferredValue(conditionText);

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
      setScrollToRecordTick((t) => t + 1);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const evaluation = useMemo<EvaluationState>(() => {
    let parsedRecords: unknown[] | null = null;
    let recordsError: string | null = null;
    try {
      const r: unknown = JSON.parse(deferredRecordsText);
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
      const c: unknown = JSON.parse(deferredConditionText);
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

    if (matcher) {
      explainText = matcher.explain();
      explainTree = matcher.explainTree();
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
  }, [deferredRecordsText, deferredConditionText, selectedIndex]);

  const effectiveIndex =
    evaluation.records && evaluation.records.length > 0
      ? Math.min(selectedIndex, evaluation.records.length - 1)
      : 0;

  const recordRanges = useMemo(() => {
    if (deferredRecordsText.length > 120_000) return [];
    return findJsonArrayElementRanges(deferredRecordsText);
  }, [deferredRecordsText]);
  const activeRecordRange = recordRanges[effectiveIndex] ?? null;
  const activeRangeRef = useRef<JsonLineRange | null>(activeRecordRange);
  activeRangeRef.current = activeRecordRange;

  useEffect(() => {
    if (scrollToRecordTick === 0) return;
    const ta = recordsEditorRef.current;
    const range = activeRangeRef.current;
    if (!ta || !range) return;
    const rawTarget = range.startLine <= 2 ? 0 : (range.startLine - 1) * 20;
    const maxScroll = Math.max(0, ta.scrollHeight - ta.clientHeight);
    const targetTop = Math.min(Math.max(0, rawTarget), maxScroll);
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ta.scrollTo({
      top: targetTop,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [scrollToRecordTick]);

  const selectRecord = (idx: number) => {
    setSelectedIndex(idx);
    setScrollToRecordTick((t) => t + 1);
  };

  const selectPreset = (id: PresetId) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(preset.id);
    setRecordsText(JSON.stringify(preset.records, null, 2));
    setConditionText(JSON.stringify(preset.condition, null, 2));
    setSelectedIndex(preset.defaultSelectedIndex);
    setScrollToRecordTick((t) => t + 1);
    setResultFilter("all");
    setVisibleLimit(100);
    setImportError(null);
    setImportNotice(null);
    if (window.location.hash) {
      window.history.replaceState(null, "", "#playground");
    }
  };

  const handleRecordsChange = (next: string) => {
    setRecordsText(next);
    if (importError) setImportError(null);
    if (importNotice) setImportNotice(null);
  };

  const handleImportFile = async (file: File, extraDroppedFiles = 0) => {
    const seq = ++importSeqRef.current;
    setImportError(null);
    setImportNotice(null);
    const sizeError = validateImportFileSize(file.size);
    if (sizeError) {
      setImportError(sizeError);
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      if (seq !== importSeqRef.current) return;
      const decoded = decodeImportBuffer(buffer);
      const result = importRecordsFromText(decoded.text, file.name, file.size);
      if (seq !== importSeqRef.current) return;
      if (!result.ok) {
        setImportError(result.error);
        return;
      }
      setRecordsText(result.formatted);
      setSelectedIndex(0);
      setResultFilter("all");
      setVisibleLimit(100);
      setScrollToRecordTick((t) => t + 1);
      const unit = result.format === "csv" ? "rows" : "items";
      const notes = [
        `Imported ${result.count} ${unit} from ${file.name}`,
        ...(extraDroppedFiles > 0 ? [`(imported first of ${extraDroppedFiles + 1} files)`] : []),
        ...(decoded.warning ? [decoded.warning] : []),
        ...result.warnings,
      ];
      setImportNotice(notes.join(" · "));
    } catch (err) {
      if (seq !== importSeqRef.current) return;
      setImportError(err instanceof Error ? err.message : "Failed to read file.");
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) {
      void handleImportFile(file);
    }
  };

  const handleRecordsDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (!isDraggingFile) setIsDraggingFile(true);
    }
  };

  const handleRecordsDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsDraggingFile(false);
    }
  };

  const handleRecordsDrop = (e: DragEvent<HTMLDivElement>) => {
    setIsDraggingFile(false);
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    void handleImportFile(e.dataTransfer.files[0], e.dataTransfer.files.length - 1);
  };

  const handleShare = async () => {
    const hash = encodeShareState({
      preset: presetId,
      recordsText,
      conditionText,
      selectedIndex: effectiveIndex,
    });
    if (hash.length > 32_000) {
      setShareStatus("too-large");
      window.setTimeout(() => setShareStatus("idle"), 2600);
      return;
    }
    try {
      window.history.replaceState(null, "", hash);
      await navigator.clipboard.writeText(window.location.href);
      setShareStatus("copied");
      window.setTimeout(() => setShareStatus("idle"), 1800);
    } catch {
      setShareStatus("error");
      window.setTimeout(() => setShareStatus("idle"), 2400);
    }
  };

  const formatBoth = () => {
    const rf = tryFormatJson(recordsText);
    if (rf.ok) setRecordsText(rf.formatted);
    const cf = tryFormatJson(conditionText);
    if (cf.ok) setConditionText(cf.formatted);
    setScrollToRecordTick((t) => t + 1);
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

  const recordFieldSuggestions = useMemo(
    () => extractRecordFieldSuggestions(evaluation.records),
    [evaluation.records],
  );

  const astNodes = countAstNodes(evaluation.explainTree);

  return (
    <section id="playground" className="playground-section">
      <div className="playground-section-head">
        <div>
          <h2>Interactive Query Playground</h2>
          <p className="hero-subtitle">
            Runs live in your browser via zero-dependency <code>mongory-js@0.2.0</code>. Edit records or conditions,
            inspect priority-ordered plans, and trace short-circuit skips on every record.
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
            {shareStatus === "copied"
              ? "Copied URL ✓"
              : shareStatus === "too-large"
                ? "Too large to share"
                : shareStatus === "error"
                  ? "Copy failed"
                  : "Share URL"}
          </button>
        </div>
      </div>

      <p className="preset-description">{activePreset.description}</p>

      <div className="three-pane-grid">
        {/* Column 1: Records Editor */}
        <div
          className={`pane pane-editor ${isDraggingFile ? "is-dragover" : ""}`}
          onDragOver={handleRecordsDragOver}
          onDragLeave={handleRecordsDragLeave}
          onDrop={handleRecordsDrop}
        >
          <div className="pane-header">
            <div className="pane-title">
              <span>Records (JSON)</span>
              <span className="pill pill-muted">
                {evaluation.records ? `${evaluation.records.length} items` : "invalid"}
              </span>
            </div>
            <div className="pane-header-actions">
              <input
                ref={fileInputRef}
                type="file"
                tabIndex={-1}
                accept=".json,.csv,.tsv,application/json,text/csv,text/tab-separated-values"
                className="sr-only"
                aria-label="Import JSON, CSV, or TSV records file"
                onChange={handleFileInputChange}
              />
              <div className="import-btn-wrap">
                <button
                  type="button"
                  className="editor-import-btn"
                  aria-describedby="import-rules-tooltip"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadIcon />
                  <span>Import</span>
                </button>
                <div id="import-rules-tooltip" className="import-tooltip" role="tooltip">
                  <div className="import-tooltip-title">Import Rules (.json / .csv / .tsv · max 2 MB / 5,000 rows)</div>
                  <ul className="import-tooltip-list">
                    <li>
                      <strong>JSON</strong>: Array <code>[...]</code> or single object <code>{"{...}"}</code>.
                    </li>
                    <li>
                      <strong>CSV / TSV headers</strong>: Duplicate columns (e.g. <code>tag,tag</code>) merge into an array; blank cells are omitted.
                    </li>
                    <li>
                      <strong>Excel &amp; types</strong>: Supports UTF-8/UTF-16 BOM, <code>sep=;</code>, <code>;</code>/<code>\t</code>, and unquoted numbers / <code>TRUE</code> / <code>FALSE</code> / <code>null</code>. Quoted values, leading zeros &amp; long IDs (&gt;2<sup>53</sup>) stay strings.
                    </li>
                    <li>
                      <strong>Local only</strong>: Parsed 100% in-browser; files never leave your device.
                    </li>
                  </ul>
                </div>
              </div>
              <button
                type="button"
                className="editor-edit-badge"
                onClick={() => recordsEditorRef.current?.focus()}
              >
                <EditIcon />
                <span>Editable</span>
              </button>
            </div>
          </div>
          <JsonEditor
            textareaRef={recordsEditorRef}
            ariaLabel="Records JSON editor"
            hasError={Boolean(evaluation.recordsError)}
            hint="Edit, paste JSON, or drop / import a .json, .csv, or .tsv file"
            highlightRange={activeRecordRange}
            value={recordsText}
            onChange={handleRecordsChange}
          />
          {importNotice && !importError && !evaluation.recordsError && (
            <div className="import-banner" role="status">
              {importNotice}
            </div>
          )}
          {(importError || evaluation.recordsError) && (
            <div className="error-banner" role="alert">
              {importError ? `Import error: ${importError}` : `JSON error: ${evaluation.recordsError}`}
            </div>
          )}
        </div>

        {/* Column 2: Query Condition Editor */}
        <div className="pane pane-editor">
          <div className="pane-header">
            <div className="pane-title">
              <span>Query Condition (JSON)</span>
              <span className="pill pill-cyan">mongory-spec v0.2.1</span>
            </div>
            <button
              type="button"
              className="editor-edit-badge"
              onClick={() => conditionEditorRef.current?.focus()}
            >
              <EditIcon />
              <span>Editable</span>
            </button>
          </div>
          <JsonEditor
            textareaRef={conditionEditorRef}
            ariaLabel="Query condition JSON editor"
            hasError={Boolean(evaluation.conditionError || evaluation.compileError)}
            hint="Type a key or $operator for autocomplete (Tab / Enter)"
            autocompleteFields={recordFieldSuggestions}
            value={conditionText}
            onChange={setConditionText}
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
                  onClick={() => {
                    setResultFilter(f);
                    setVisibleLimit(100);
                  }}
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
              <>
                {visibleIndices.slice(0, visibleLimit).map((idx) => {
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
                      onClick={() => selectRecord(idx)}
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
                })}
                {visibleIndices.length > visibleLimit && (
                  <button
                    type="button"
                    className="results-load-more"
                    onClick={() => setVisibleLimit((n) => n + 100)}
                  >
                    Show 100 more ({visibleIndices.length - visibleLimit} remaining)
                  </button>
                )}
              </>
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
