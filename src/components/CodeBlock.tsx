import { useMemo, useState } from "react";
import { tokenizeCliTrace, tokenizeCode, type CliTokenKind, type TokenKind } from "../lib/highlight.js";
import type { LangKey } from "../types.js";

const CODE_CLASS: Record<TokenKind, string | undefined> = {
  comment: "tok-comment",
  directive: "tok-directive",
  op: "tok-op",
  str: "tok-str",
  sym: "tok-sym",
  kw: "tok-kw",
  type: "tok-type",
  bool: "tok-bool",
  num: "tok-num",
  fn: "tok-fn",
  prop: "tok-prop",
  ident: "tok-var",
  punct: "tok-punct",
  plain: undefined,
};

const CLI_CLASS: Record<CliTokenKind, string | undefined> = {
  pass: "cli-pass",
  fail: "cli-fail",
  skip: "cli-skip",
  tree: "cli-tree",
  op: "tok-op",
  matcher: "tok-ident",
  str: "tok-str",
  num: "tok-num",
  plain: undefined,
};

export function HighlightedCode({ code, lang }: { code: string; lang: LangKey }) {
  const tokens = useMemo(() => tokenizeCode(code, lang), [code, lang]);

  return (
    <>
      {tokens.map((tok, idx) => {
        const cls = CODE_CLASS[tok.kind];
        return cls ? (
          <span key={idx} className={cls}>
            {tok.text}
          </span>
        ) : (
          tok.text
        );
      })}
    </>
  );
}

export function CodeBlock({
  code,
  lang,
  label,
}: {
  code: string;
  lang: LangKey;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors in restricted environments
    }
  }

  return (
    <div className="lang-card-code">
      <div className="code-card-label">
        <span>{label}</span>
        <button
          type="button"
          className="code-copy-btn"
          aria-label={`Copy ${lang} code example`}
          onClick={() => void handleCopy()}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre>
        <code>
          <HighlightedCode code={code} lang={lang} />
        </code>
      </pre>
    </div>
  );
}

export function HighlightedCli({ text }: { text: string }) {
  const tokens = useMemo(() => tokenizeCliTrace(text), [text]);

  return (
    <>
      {tokens.map((tok, idx) => {
        const cls = CLI_CLASS[tok.kind];
        return cls ? (
          <span key={idx} className={cls}>
            {tok.text}
          </span>
        ) : (
          tok.text
        );
      })}
    </>
  );
}
