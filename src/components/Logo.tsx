/** A photo with one region replaced: the red patch sits slightly off its slot. */
export function Logo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <path d="M2 2h18v9h-9v9H2z" fill="#121212" />
      <rect x="13" y="13" width="9" height="9" fill="#E5484D" />
    </svg>
  );
}
