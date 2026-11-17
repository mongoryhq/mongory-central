import type { ReactNode } from "react";

interface NavbarProps {
  activeSection: string;
  onJump: (id: string) => void;
}

function BrandMark(): ReactNode {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
      <path
        d="M7.5 22V10l5.2 6.2L18 10v12"
        fill="none"
        stroke="#10b981"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="11.5" r="2.3" fill="#38bdf8" />
      <circle cx="24" cy="20.5" r="2.3" fill="#f59e0b" />
    </svg>
  );
}

const NAV_ITEMS = [
  { id: "playground", label: "Playground" },
  { id: "languages", label: "Languages" },
  { id: "operators", label: "Operators & Spec" },
  { id: "benchmarks", label: "Benchmarks" },
];

export function Navbar({ activeSection, onJump }: NavbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a
          className="brand"
          href="#playground"
          onClick={(e) => {
            e.preventDefault();
            onJump("playground");
          }}
        >
          <BrandMark />
          <span className="brand-name">Mongory</span>
          <span className="badge badge-version">mongory-js@0.1.0</span>
        </a>

        <nav className="topnav" aria-label="Primary sections">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-link ${activeSection === item.id ? "is-active" : ""}`}
              onClick={() => onJump(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          <a
            className="btn btn-ghost btn-sm"
            href="https://github.com/mongoryhq"
            target="_blank"
            rel="noreferrer"
          >
            GitHub Org ↗
          </a>
        </div>
      </div>
    </header>
  );
}
