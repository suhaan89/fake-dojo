import type { Belt } from "@/lib/game/progression";

/** A belt drawn as a flat band with a knot, in the belt color. */
export function BeltBadge({ belt, size = "md" }: { belt: Belt; size?: "sm" | "md" }) {
  const width = size === "sm" ? 72 : 132;
  const height = size === "sm" ? 22 : 40;
  const dark = belt.name === "Black" || belt.name === "Brown" || belt.name === "Blue" || belt.name === "Green";
  const stroke = "#121212";
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 132 40"
      role="img"
      aria-label={`${belt.name} belt`}
      className={size === "sm" ? "h-auto w-full max-w-[72px]" : "h-auto w-[132px] max-w-full shrink-0"}
    >
      <rect x="1" y="12" width="130" height="16" fill={belt.color} stroke={stroke} strokeWidth="1.5" />
      <path d="M58 28 46 39h14l8-11z" fill={belt.color} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M74 28 86 39H72l-8-11z" fill={belt.color} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="55" y="8" width="22" height="24" fill={belt.color} stroke={stroke} strokeWidth="1.5" />
      <path d="M61 8v24M71 8v24" stroke={dark ? "rgba(255,255,255,0.45)" : "rgba(18,18,18,0.3)"} strokeWidth="1" />
    </svg>
  );
}
