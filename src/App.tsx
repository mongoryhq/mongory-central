import { useEffect, useState } from "react";
import { Hub } from "./components/Hub.js";
import { Navbar } from "./components/Navbar.js";
import { Playground } from "./components/Playground.js";

const SECTION_IDS = ["playground", "languages", "operators", "benchmarks"] as const;

export function App() {
  const [activeSection, setActiveSection] = useState<string>("playground");

  const jumpTo = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: 0.01 },
    );
    for (const id of SECTION_IDS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="app-shell">
      <Navbar activeSection={activeSection} onJump={jumpTo} />
      <main className="main-container">
        <Playground />
        <Hub />
      </main>
      <footer className="footer">
        <div className="footer-inner">
          <span>Mongory · MIT Licensed · Unified cross-language query matcher (JS / Go / Ruby / C99)</span>
          <div className="footer-links">
            <a href="https://github.com/mongoryhq/mongory-js" target="_blank" rel="noreferrer">
              mongory-js
            </a>
            <a href="https://github.com/mongoryhq/mongory-go" target="_blank" rel="noreferrer">
              mongory-go
            </a>
            <a href="https://github.com/mongoryhq/mongory-rb" target="_blank" rel="noreferrer">
              mongory-rb
            </a>
            <a href="https://github.com/mongoryhq/mongory-core" target="_blank" rel="noreferrer">
              mongory-core
            </a>
            <a href="https://github.com/mongoryhq/mongory-spec" target="_blank" rel="noreferrer">
              mongory-spec
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
