import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import { HighlightedCode } from "./CodeBlock.js";

interface JsonEditorProps {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  hasError: boolean;
  hint: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  highlightRange?: { startLine: number; endLine: number } | null;
}

/**
 * Editable JSON textarea synchronized with a line-number gutter and
 * syntax-highlighted `<pre>` underlay. Keeps native cursor, selection, undo,
 * and screen-reader semantics while clearly signaling live editability.
 */
export function JsonEditor({
  value,
  onChange,
  ariaLabel,
  hasError,
  hint,
  textareaRef: externalRef,
  highlightRange = null,
}: JsonEditorProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef ?? internalRef;
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const lineNumbers = useMemo(() => {
    const count = value.split("\n").length;
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [value]);

  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    const pre = preRef.current;
    const gutter = gutterRef.current;
    if (!ta) return;
    if (pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
    if (gutter) {
      gutter.scrollTop = ta.scrollTop;
    }
  }, [textareaRef]);

  useLayoutEffect(() => {
    syncScroll();
  }, [value, syncScroll]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncScroll);
    observer.observe(ta);
    return () => observer.disconnect();
  }, [syncScroll, textareaRef]);

  return (
    <div className={`json-editor-wrap ${hasError ? "has-error" : ""}`}>
      <div className="json-editor-body">
        <div ref={gutterRef} className="json-editor-gutter" aria-hidden="true">
          <div className="json-editor-gutter-inner">
            {lineNumbers.map((n) => {
              const lineIdx = n - 1;
              const isActiveLine =
                highlightRange !== null &&
                lineIdx >= highlightRange.startLine &&
                lineIdx <= highlightRange.endLine;
              return (
                <div key={n} className={`json-editor-ln ${isActiveLine ? "is-active-ln" : ""}`}>
                  {n}
                </div>
              );
            })}
          </div>
        </div>
        <div className="json-editor-stage">
          <pre ref={preRef} className="json-editor-highlight" aria-hidden="true">
            <div className="json-editor-content">
              {highlightRange && (
                <div
                  className="json-editor-active-band"
                  style={{
                    top: highlightRange.startLine * 20,
                    height: (highlightRange.endLine - highlightRange.startLine + 1) * 20,
                  }}
                />
              )}
              <span className="json-editor-code">
                <HighlightedCode code={value} lang="json" />
                {value.endsWith("\n") || value.length === 0 ? " " : null}
              </span>
            </div>
          </pre>
          <textarea
            ref={textareaRef}
            className="json-editor-input"
            aria-label={ariaLabel}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={syncScroll}
          />
        </div>
      </div>
      <div className="json-editor-footer">
        <span className="editor-footer-hint">{hint}</span>
        <span className="editor-footer-meta">{lineNumbers.length} lines · live</span>
      </div>
    </div>
  );
}
