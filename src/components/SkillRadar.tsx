import { skillMean } from "@/lib/game/progression";
import { MANIPULATION_TYPES, TYPE_LABELS, TYPE_SHORT, type ManipulationType, type TypeSkill } from "@/lib/game/types";

const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = 104;
const RINGS = [0.25, 0.5, 0.75, 1];

function point(index: number, value: number): [number, number] {
  const angle = (Math.PI * 2 * index) / MANIPULATION_TYPES.length - Math.PI / 2;
  return [CENTER + Math.cos(angle) * RADIUS * value, CENTER + Math.sin(angle) * RADIUS * value];
}

function polygon(values: readonly number[]): string {
  return values.map((value, index) => point(index, value).map((n) => n.toFixed(1)).join(",")).join(" ");
}

/** Hand-rolled SVG radar of the six manipulation types. The value is the Beta skill mean. */
export function SkillRadar({ skills }: { skills: Record<ManipulationType, TypeSkill> }) {
  const values = MANIPULATION_TYPES.map((type) => skillMean(skills[type]));
  const summary = MANIPULATION_TYPES.map(
    (type, index) => `${TYPE_LABELS[type]} ${Math.round(values[index] * 100)} percent`,
  ).join(", ");
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={`Skill per manipulation type: ${summary}.`}
      className="h-auto w-full max-w-[360px]"
    >
      {RINGS.map((ring) => (
        <polygon
          key={ring}
          points={polygon(MANIPULATION_TYPES.map(() => ring))}
          fill="none"
          stroke="#d9d5cc"
          strokeWidth={ring === 0.5 ? 1.5 : 1}
          strokeDasharray={ring === 0.5 ? "4 3" : undefined}
        />
      ))}
      {MANIPULATION_TYPES.map((type, index) => {
        const [x, y] = point(index, 1);
        return <line key={type} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="#d9d5cc" strokeWidth={1} />;
      })}
      <polygon points={polygon(values)} fill="rgba(18,18,18,0.12)" stroke="#121212" strokeWidth={2} strokeLinejoin="round" />
      {values.map((value, index) => {
        const [x, y] = point(index, value);
        return <rect key={index} x={x - 3} y={y - 3} width={6} height={6} fill="#121212" />;
      })}
      {MANIPULATION_TYPES.map((type, index) => {
        const [x, y] = point(index, 1.24);
        return (
          <text
            key={type}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="12"
            fontFamily="var(--font-geist-mono), monospace"
            fill="#55524b"
          >
            {TYPE_SHORT[type]}
          </text>
        );
      })}
    </svg>
  );
}
