"use client";

import { useId } from "react";

import type { Project100MuscleCoverageItem } from "@/lib/project100-strength";

const WIDTH = 560;
const HEIGHT = 420;
const CENTER = { x: 280, y: 195 };
const RADIUS = 132;

function polar(index: number, count: number, radius: number) {
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
  return {
    x: CENTER.x + Math.cos(angle) * radius,
    y: CENTER.y + Math.sin(angle) * radius,
  };
}

function polygon(count: number, radius: number): string {
  return Array.from({ length: count }, (_, index) => {
    const point = polar(index, count, radius);
    return `${point.x},${point.y}`;
  }).join(" ");
}

function labelAnchor(x: number): "start" | "middle" | "end" {
  if (Math.abs(x - CENTER.x) < 18) return "middle";
  return x > CENTER.x ? "start" : "end";
}

export function MuscleRadarChart({ groups }: { groups: Project100MuscleCoverageItem[] }) {
  const titleId = useId();
  const descriptionId = useId();
  const maximum = Math.max(0, ...groups.map((group) => group.completedSets));

  if (maximum === 0) {
    return (
      <div className="p100-muscle-radar-empty">
        <strong>Inga kategoriserade arbetsset i perioden</strong>
        <p>Koppla minst en övning till en muskelgrupp så ritas spindeldiagrammet.</p>
      </div>
    );
  }

  const dataPoints = groups
    .map((group, index) => {
      const point = polar(index, groups.length, RADIUS * (group.completedSets / maximum));
      return `${point.x},${point.y}`;
    })
    .join(" ");

  return (
    <svg
      className="p100-muscle-radar"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-labelledby={`${titleId} ${descriptionId}`}
    >
      <title id={titleId}>Träningsfördelning per muskelgrupp</title>
      <desc id={descriptionId}>
        Radardiagram över genomförda arbetsset. Högsta axeln har {maximum} set. Exakta
        värden finns i tabellen bredvid.
      </desc>

      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          className="p100-muscle-radar-grid"
          points={polygon(groups.length, RADIUS * ring)}
        />
      ))}

      {groups.map((group, index) => {
        const outer = polar(index, groups.length, RADIUS);
        const label = polar(index, groups.length, RADIUS + 24);
        return (
          <g key={group.muscleGroup}>
            <line
              className="p100-muscle-radar-axis"
              x1={CENTER.x}
              y1={CENTER.y}
              x2={outer.x}
              y2={outer.y}
            />
            <text
              className="p100-muscle-radar-label"
              x={label.x}
              y={label.y + 3}
              textAnchor={labelAnchor(label.x)}
            >
              {group.label}
            </text>
          </g>
        );
      })}

      <polygon className="p100-muscle-radar-area" points={dataPoints} />
      <polygon className="p100-muscle-radar-line" points={dataPoints} />
      {groups.map((group, index) => {
        const point = polar(index, groups.length, RADIUS * (group.completedSets / maximum));
        return (
          <circle
            key={group.muscleGroup}
            className="p100-muscle-radar-dot"
            cx={point.x}
            cy={point.y}
            r="4"
          />
        );
      })}
    </svg>
  );
}
