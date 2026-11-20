import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  applyKeySuggestion,
  detectJsonKeyContext,
  getConditionKeySuggestions,
  type FieldSuggestion,
  type KeySuggestion,
} from "../lib/conditionAutocomplete.js";
import { HighlightedCode } from "./CodeBlock.js";

interface JsonEditorProps {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  hasError: boolean;
  hint: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  highlightRange?: { startLine: number; endLine: number } | null;
  autocompleteFields?: readonly FieldSuggestion[];
}

function getLineCol(text: string, index: number): { line: number; col: number } {
  let line = 0;
  let lastNl = -1;
  const limit = Math.min(index, text.length);
  for (let i = 0; i < limit; i++) {
    if (text[i] === "\n") {
      line++;
      lastNl = i;
    }
  }
  return { line, col: limit - lastNl - 1 };
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
  autocompleteFields,
}: JsonEditorProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef ?? internalRef;
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const [acOpen, setAcOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollPos, setScrollPos] = useState({ top: 0, left: 0 });

  const lineNumbers = useMemo(() => {
    const count = value.split("\n").length;
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [value]);

  const keyContext = useMemo(() => {
    if (!autocompleteFields || !acOpen) return null;
    return detectJsonKeyContext(value, cursor);
  }, [autocompleteFields, acOpen, value, cursor]);

  const suggestions = useMemo(() => {
    if (!autocompleteFields || !keyContext) return [];
    return getConditionKeySuggestions(keyContext, autocompleteFields);
  }, [autocompleteFields, keyContext]);

  const showMenu = Boolean(autocompleteFields && acOpen && keyContext && suggestions.length > 0);
  const safeActiveIndex = suggestions.length > 0 ? Math.min(activeIndex, suggestions.length - 1) : 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [keyContext?.prefix, keyContext?.replaceStart]);

  useEffect(() => {
    if (!showMenu || !menuRef.current) return;
    const activeEl = menuRef.current.children[safeActiveIndex] as HTMLElement | undefined;
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [showMenu, safeActiveIndex]);

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
    if (autocompleteFields) {
      setScrollPos((prev) =>
        prev.top === ta.scrollTop && prev.left === ta.scrollLeft
          ? prev
          : { top: ta.scrollTop, left: ta.scrollLeft },
      );
    }
  }, [textareaRef, autocompleteFields]);

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

  const acceptSuggestion = useCallback(
    (item: KeySuggestion) => {
      if (!keyContext) return;
      const { nextText, nextCursor } = applyKeySuggestion(value, keyContext, item);
      onChange(nextText);
      setCursor(nextCursor);
      setAcOpen(false);
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(nextCursor, nextCursor);
        }
      });
    },
    [keyContext, value, onChange, textareaRef],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!autocompleteFields) return;

    if (e.ctrlKey && e.code === "Space") {
      e.preventDefault();
      const pos = e.currentTarget.selectionStart;
      setCursor(pos);
      setAcOpen(true);
      setActiveIndex(0);
      return;
    }

    if (!showMenu) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      acceptSuggestion(suggestions[safeActiveIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAcOpen(false);
    }
  };

  const menuStyle = useMemo(() => {
    if (!showMenu || !keyContext) return undefined;
    const ta = textareaRef.current;
    const stageHeight = ta?.clientHeight ?? 280;
    const stageWidth = ta?.clientWidth ?? 340;
    const { line, col } = getLineCol(value, keyContext.replaceStart);
    const lineBottom = 10 + (line + 1) * 20 - scrollPos.top;
    const menuHeight = Math.min(suggestions.length * 28 + 10, 196);
    const flipUp = lineBottom + menuHeight > stageHeight - 6 && lineBottom - 20 > menuHeight;
    const top = flipUp ? Math.max(6, lineBottom - 20 - menuHeight - 4) : Math.min(stageHeight - 40, Math.max(6, lineBottom + 2));
    const menuWidth = 256;
    const left = Math.max(8, Math.min(12 + col * 8.1 - scrollPos.left, Math.max(8, stageWidth - menuWidth - 8)));
    return { top, left };
  }, [showMenu, keyContext, textareaRef, value, scrollPos, suggestions.length]);

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
            aria-autocomplete={autocompleteFields ? "list" : undefined}
            aria-expanded={autocompleteFields ? showMenu : undefined}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={value}
            onChange={(e) => {
              const nextVal = e.target.value;
              const pos = e.target.selectionStart;
              onChange(nextVal);
              if (autocompleteFields) {
                setCursor(pos);
                setAcOpen(true);
              }
            }}
            onKeyDown={handleKeyDown}
            onClick={(e) => {
              if (!autocompleteFields) return;
              const pos = e.currentTarget.selectionStart;
              setCursor(pos);
              if (!detectJsonKeyContext(value, pos)) {
                setAcOpen(false);
              }
            }}
            onBlur={() => {
              if (acOpen) setAcOpen(false);
            }}
            onScroll={syncScroll}
          />
          {showMenu && menuStyle && (
            <ul
              ref={menuRef}
              className="ac-menu"
              style={menuStyle}
              role="listbox"
              aria-label="Condition key suggestions"
            >
              {suggestions.map((item, idx) => (
                <li
                  key={`${item.kind}:${item.key}`}
                  role="option"
                  aria-selected={idx === safeActiveIndex}
                  className={`ac-item ${idx === safeActiveIndex ? "is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    acceptSuggestion(item);
                  }}
                >
                  <span className={`ac-badge ac-badge-${item.kind}`}>
                    {item.kind === "operator" ? "op" : "key"}
                  </span>
                  <code className="ac-key">{item.key}</code>
                  <span className="ac-detail">{item.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="json-editor-footer">
        <span className="editor-footer-hint">{hint}</span>
        <span className="editor-footer-meta">{lineNumbers.length} lines · live</span>
      </div>
    </div>
  );
}
