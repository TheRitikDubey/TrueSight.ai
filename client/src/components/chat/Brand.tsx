export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand ${compact ? "brand-compact" : ""}`}>
      <svg
        className="brand-symbol"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5 20C9 12 14 8 20 8s11 4 15 12c-4 8-9 12-15 12S9 28 5 20Z"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="m15 20 3.5 3.5L26 16"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (
        <span className="brand-name">
          TrueSight<span>.ai</span>
        </span>
      )}
    </span>
  );
}
