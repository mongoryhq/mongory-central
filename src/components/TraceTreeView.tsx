import { useState } from "react";
import type { ExplainNode, TraceNode } from "mongory-js";
import { HighlightedCli, HighlightedCode } from "./CodeBlock.js";

function ExplainOrderStrip({ explain }: { explain: ExplainNode }) {
  const steps = explain.children.length > 0 && (explain.kind === "and" || explain.kind === "or")
    ? explain.children
    : [explain];

  return (
    <div className="explain-strip" aria-label="Compiled evaluation priority order">
      <div className="explain-strip-label">
        <span>Priority Plan</span>
        <span className="pill pill-muted">total cost {explain.priority}</span>
      </div>
      <div className="explain-steps">
        {steps.map((step, idx) => (
          <div key={`${step.label}-${idx}`} className="explain-step">
            <span className="step-order">#{step.order !== undefined ? step.order + 1 : idx + 1}</span>
            <span className="step-label">{step.label}</span>
            <span className="step-prio">cost {step.priority}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TraceTreeNodeItem({ node, depth }: { node: TraceNode; depth: number }) {
  const [showSnapshot, setShowSnapshot] = useState(false);

  const statusClass =
    node.status === "PASS"
      ? "node-pass"
      : node.status === "FAIL"
        ? "node-fail"
        : "node-skip";

  const statusBadgeClass =
    node.status === "PASS"
      ? "status-pass"
      : node.status === "FAIL"
        ? "status-fail"
        : "status-skip";

  const hasExpandedValue = node.exists && node.value !== undefined && typeof node.value === "object" && node.value !== null;

  return (
    <div className={`trace-branch ${depth > 0 ? "is-nested" : ""} ${statusClass}`}>
      <div className={`trace-card ${statusClass}`}>
        <div className="trace-card-main">
          <span className={`status-pill ${statusBadgeClass}`}>{node.status}</span>

          {node.order !== undefined && (
            <span className="order-chip" title="Evaluation order after priority sort">
              #{node.order + 1}
            </span>
          )}

          <span className="node-kind-badge">{node.kind}</span>
          <code className="node-label">{node.label}</code>

          {node.operator && <span className="op-chip">{node.operator}</span>}
          {node.detail && <span className="detail-chip">{node.detail}</span>}
          <span className="prio-chip" title="Estimated evaluation cost">
            prio {node.priority}
          </span>
        </div>

        <div className="trace-card-meta">
          {node.valueText !== undefined && (
            <button
              type="button"
              className={`value-chip ${hasExpandedValue ? "is-expandable" : ""} ${node.exists === false ? "is-missing" : ""}`}
              onClick={() => hasExpandedValue && setShowSnapshot((s) => !s)}
              title={hasExpandedValue ? "Click to toggle bounded JSON snapshot" : undefined}
            >
              <span className="value-key">val</span>
              <code>{node.valueText}</code>
              {hasExpandedValue && <span className="caret">{showSnapshot ? "▾" : "▸"}</span>}
            </button>
          )}
        </div>
      </div>

      {showSnapshot && hasExpandedValue && (
        <pre className="snapshot-box">
          <HighlightedCode code={JSON.stringify(node.value, null, 2)} lang="json" />
        </pre>
      )}

      {node.children.length > 0 && (
        <div className="trace-children">
          {node.children.map((child, idx) => (
            <TraceTreeNodeItem key={`${child.label}-${idx}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface TraceTreeViewProps {
  explainTree: ExplainNode | null;
  traceTree: TraceNode | null;
  explainText: string;
  traceText: string;
  mode: "visual" | "text";
  onModeChange: (mode: "visual" | "text") => void;
  selectedIndex: number;
  selectedMatched: boolean | undefined;
}

export function TraceTreeView({
  explainTree,
  traceTree,
  explainText,
  traceText,
  mode,
  onModeChange,
  selectedIndex,
  selectedMatched,
}: TraceTreeViewProps) {
  return (
    <section className="debugger-panel" aria-label="Explain and Trace debugger">
      <div className="debugger-header">
        <div className="debugger-title-group">
          <h2>Explain &amp; Short-Circuit Trace</h2>
          {selectedMatched !== undefined && (
            <span className={`inspect-badge ${selectedMatched ? "is-pass" : "is-fail"}`}>
              Inspecting Record #{selectedIndex} · {selectedMatched ? "MATCH" : "MISS"}
            </span>
          )}
        </div>

        <div className="debugger-controls">
          <div className="legend" aria-hidden="true">
            <span className="legend-item">
              <span className="dot dot-pass" /> PASS
            </span>
            <span className="legend-item">
              <span className="dot dot-fail" /> FAIL
            </span>
            <span className="legend-item">
              <span className="dot dot-skip" /> SKIP (short-circuited)
            </span>
          </div>

          <div className="segmented">
            <button
              type="button"
              className={mode === "visual" ? "is-selected" : ""}
              onClick={() => onModeChange("visual")}
            >
              Interactive AST
            </button>
            <button
              type="button"
              className={mode === "text" ? "is-selected" : ""}
              onClick={() => onModeChange("text")}
            >
              CLI Text
            </button>
          </div>
        </div>
      </div>

      {explainTree && <ExplainOrderStrip explain={explainTree} />}

      {!traceTree ? (
        <div className="empty-debugger">
          Fix the JSON syntax or query compilation error above, then select any record to inspect its live execution trace.
        </div>
      ) : mode === "visual" ? (
        <div className="trace-canvas">
          <TraceTreeNodeItem node={traceTree} depth={0} />
        </div>
      ) : (
        <div className="cli-split">
          <div className="cli-card">
            <div className="cli-card-title">matcher.explain()</div>
            <pre>
              <HighlightedCli text={explainText} />
            </pre>
          </div>
          <div className="cli-card">
            <div className="cli-card-title">matcher.trace(record[{selectedIndex}])</div>
            <pre>
              <HighlightedCli text={traceText} />
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
