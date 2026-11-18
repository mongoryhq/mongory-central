import { MicrochipLogo } from "./Icons.js";

interface NavbarProps {
  activeSection: string;
  onJump: (id: string) => void;
}

const NAV_ITEMS = [
  { id: "playground", label: "Playground" },
  { id: "languages", label: "Languages" },
  { id: "operators", label: "Docs & Spec" },
  { id: "benchmarks", label: "Benchmarks" },
];

export function Navbar({ activeSection, onJump }: NavbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a
          className="brand"
          href="#hero"
          onClick={(e) => {
            e.preventDefault();
            onJump("hero");
          }}
        >
          <MicrochipLogo size={26} />
          <span className="brand-name">Mongory</span>
          <span className="badge-version">mongory-js@0.1.1</span>
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
            GitHub ↗
          </a>
        </div>
      </div>
    </header>
  );
}
