import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { HighlightedCode } from "./CodeBlock.js";

interface JsonEditorProps {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  hasError: boolean;
}

/**
 * Editable JSON textarea synchronized with a syntax-highlighted `<pre>` underlay.
 * Preserves native undo, selection, copy/paste, IME, and screen-reader semantics.
 */
export function JsonEditor({ value, onChange, ariaLabel, hasError }: JsonEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const syncScrollAndWidth = useCallback(() => {
    const ta = textareaRef.current;
    const pre = preRef.current;
    if (!ta || !pre) return;
    // Match the textarea's inner clientWidth so word wrapping stays bit-exact with scrollbars.
    pre.style.width = `${ta.clientWidth}px`;
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  }, []);

  useLayoutEffect(() => {
    syncScrollAndWidth();
  }, [value, syncScrollAndWidth]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncScrollAndWidth);
    observer.observe(ta);
    return () => observer.disconnect();
  }, [syncScrollAndWidth]);

  return (
    <div className={`json-editor-wrap ${hasError ? "has-error" : ""}`}>
      <pre ref={preRef} className="json-editor-highlight" aria-hidden="true">
        <HighlightedCode code={value} lang="json" />
        {value.endsWith("\n") || value.length === 0 ? " " : null}
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
        onScroll={syncScrollAndWidth}
      />
    </div>
  );
}
