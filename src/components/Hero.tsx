import { useState } from "react";
import { CodeCircleIcon, CubeIcon, DiamondIcon, MicrochipLogo } from "./Icons.js";

interface HeroProps {
  onJump: (id: string) => void;
}

export function Hero({ onJump }: HeroProps) {
  const [copiedInstall, setCopiedInstall] = useState(false);

  const copyNpm = async () => {
    try {
      await navigator.clipboard.writeText("npm install mongory-js");
    } catch {
      // ignore clipboard errors
    }
    setCopiedInstall(true);
    window.setTimeout(() => setCopiedInstall(false), 1600);
  };

  return (
    <section id="hero" className="landing-hero" aria-label="Mongory overview">
      <div className="hero-split">
        {/* Left: Iconic Microchip Emblem & Wordmark */}
        <div className="hero-brand-col">
          <div className="hero-emblem-wrap">
            <MicrochipLogo size={146} />
          </div>
          <div className="hero-wordmark">Mongory</div>
          <p className="hero-tagline">
            Zero-database query matching &amp; visual Explain/Trace unified by{" "}
            <a href="https://github.com/mongoryhq/mongory-spec" target="_blank" rel="noreferrer">
              mongory-spec v0.2.0
            </a>
            .
          </p>
          <div className="hero-cta-row">
            <button
              type="button"
              className="btn btn-brand"
              onClick={() => onJump("playground")}
            >
              Launch Live Playground ↓
            </button>
            <button
              type="button"
              className="btn btn-dark-pill"
              onClick={() => void copyNpm()}
              title="Copy npm install command"
            >
              <code>{copiedInstall ? "Copied ✓" : "$ npm i mongory-js"}</code>
            </button>
          </div>
        </div>

        {/* Right: Elevated Showcase Card Frame matching reference design */}
        <div className="hero-showcase-card">
          <div className="showcase-topbar">
            <span className="showcase-brand">Mongory</span>
            <nav className="showcase-links" aria-label="Quick navigation">
              <button type="button" onClick={() => onJump("operators")}>
                Docs
              </button>
              <a href="https://github.com/mongoryhq" target="_blank" rel="noreferrer">
                GitHub
              </a>
              <button type="button" onClick={() => onJump("benchmarks")}>
                Benchmarks
              </button>
            </nav>
          </div>

          <div className="showcase-body">
            <h1 className="showcase-heading">
              Cross-language, in-memory
              <br />
              Mongo-style rule engine
            </h1>

            <div className="showcase-code-box">
              <div className="showcase-code-label">
                <span>query.ts</span>
                <button
                  type="button"
                  className="showcase-try-btn"
                  onClick={() => onJump("playground")}
                >
                  Run in Playground →
                </button>
              </div>
              <pre className="showcase-code">
                <code>
                  <span className="tok-ident">mongory</span>
                  <span className="tok-punct">.</span>
                  <span className="tok-fn">compile</span>
                  <span className="tok-punct">{"({ "}</span>
                  <span className="tok-str">"active"</span>
                  <span className="tok-punct">: </span>
                  <span className="tok-bool">true</span>
                  <span className="tok-punct">,</span>
                  {"\n  "}
                  <span className="tok-str">"age"</span>
                  <span className="tok-punct">: {"{ "}</span>
                  <span className="tok-op">"$gte"</span>
                  <span className="tok-punct">: </span>
                  <span className="tok-num">21</span>
                  <span className="tok-punct">{" } })"}</span>
                </code>
              </pre>
            </div>

            <div className="showcase-features">
              <button
                type="button"
                className="feature-tile"
                onClick={() => onJump("benchmarks")}
              >
                <div className="feature-tile-icon">
                  <DiamondIcon />
                </div>
                <div className="feature-tile-title">High Performance</div>
                <p className="feature-tile-desc">
                  Optimized in-memory query processing
                </p>
              </button>

              <button
                type="button"
                className="feature-tile"
                onClick={() => onJump("languages")}
              >
                <div className="feature-tile-icon">
                  <CodeCircleIcon />
                </div>
                <div className="feature-tile-title">Language Support</div>
                <p className="feature-tile-desc">
                  Supports Ruby, C, Go, JavaScript
                </p>
              </button>

              <button
                type="button"
                className="feature-tile"
                onClick={() => onJump("operators")}
              >
                <div className="feature-tile-icon">
                  <CubeIcon />
                </div>
                <div className="feature-tile-title">Lightweight</div>
                <p className="feature-tile-desc">
                  Zero database, minimal resource footprint
                </p>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
