export function MicrochipLogo({ size = 140 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className="microchip-svg"
    >
      {/* Top pins */}
      <line x1="42" y1="12" x2="42" y2="23" stroke="#52e373" strokeWidth="6" strokeLinecap="round" />
      <line x1="60" y1="12" x2="60" y2="23" stroke="#52e373" strokeWidth="6" strokeLinecap="round" />
      <line x1="78" y1="12" x2="78" y2="23" stroke="#52e373" strokeWidth="6" strokeLinecap="round" />
      {/* Bottom pins */}
      <line x1="42" y1="97" x2="42" y2="108" stroke="#52e373" strokeWidth="6" strokeLinecap="round" />
      <line x1="60" y1="97" x2="60" y2="108" stroke="#52e373" strokeWidth="6" strokeLinecap="round" />
      <line x1="78" y1="97" x2="78" y2="108" stroke="#52e373" strokeWidth="6" strokeLinecap="round" />
      {/* Left pins */}
      <line x1="12" y1="42" x2="23" y2="42" stroke="#52e373" strokeWidth="6" strokeLinecap="round" />
      <line x1="12" y1="60" x2="23" y2="60" stroke="#52e373" strokeWidth="6" strokeLinecap="round" />
      <line x1="12" y1="78" x2="23" y2="78" stroke="#52e373" strokeWidth="6" strokeLinecap="round" />
      {/* Right pins */}
      <line x1="97" y1="42" x2="108" y2="42" stroke="#52e373" strokeWidth="6" strokeLinecap="round" />
      <line x1="97" y1="60" x2="108" y2="60" stroke="#52e373" strokeWidth="6" strokeLinecap="round" />
      <line x1="97" y1="78" x2="108" y2="78" stroke="#52e373" strokeWidth="6" strokeLinecap="round" />

      {/* Chip frame */}
      <rect
        x="29"
        y="29"
        width="62"
        height="62"
        rx="12"
        fill="#0d131a"
        stroke="#52e373"
        strokeWidth="6"
      />

      {/* Curly braces { } */}
      <path
        d="M52 44c-3.8 0-5.4 1.9-5.4 5.2v5.4c0 2.6-1.4 4.2-4.2 5.4 2.8 1.2 4.2 2.8 4.2 5.4v5.4c0 3.3 1.6 5.2 5.4 5.2"
        stroke="#52e373"
        strokeWidth="5.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M68 44c3.8 0 5.4 1.9 5.4 5.2v5.4c0 2.6 1.4 4.2 4.2 5.4-2.8 1.2-4.2 2.8-4.2 5.4v5.4c0 3.3-1.6 5.2-5.4 5.2"
        stroke="#52e373"
        strokeWidth="5.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DiamondIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect
        x="18"
        y="4.5"
        width="19"
        height="19"
        rx="3"
        transform="rotate(45 18 4.5)"
        stroke="#38bdf8"
        strokeWidth="4.2"
      />
    </svg>
  );
}

export function CodeCircleIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <circle cx="18" cy="18" r="15" fill="#fb923c" />
      <path
        d="M13 13.5 8.8 18l4.2 4.5M23 13.5l4.2 4.5-4.2 4.5M19.8 12.2l-3.6 11.6"
        stroke="#131921"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CubeIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      {/* Top face */}
      <polygon points="18,4 31,11.2 18,18.4 5,11.2" fill="#c4b5fd" />
      {/* Left face */}
      <polygon points="5,11.2 18,18.4 18,32.5 5,25.3" fill="#a78bfa" />
      {/* Right face */}
      <polygon points="31,11.2 31,25.3 18,32.5 18,18.4" fill="#7c5ce6" />
    </svg>
  );
}
