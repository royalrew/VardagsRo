"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";

import type { Project100MeasurementUnit } from "@/lib/project100-body";

export interface MetricChartPoint {
  measuredOn: string;
  value: number;
}

export type MetricChartUnit = Project100MeasurementUnit | "reps";

interface Reference {
  value: number;
  label: string;
}

const PADDING = { top: 20, right: 18, bottom: 28, left: 46 };
const MIN_HEIGHT = 220;

const dayFormatter = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" });
const fullDayFormatter = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function parseDay(calendarDate: string): number {
  return new Date(`${calendarDate}T12:00:00Z`).getTime();
}

function formatValue(value: number, unit: MetricChartUnit): string {
  return `${(Math.round(value * 10) / 10).toLocaleString("sv-SE", {
    maximumFractionDigits: 1,
  })} ${unit}`;
}

/** Clean tick values, so the axis reads 82 · 83 · 84 rather than 82,37. */
function niceTicks(min: number, max: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const rough = span / 3;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rough) ??
    10 * magnitude;
  const ticks: number[] = [];
  for (let tick = Math.ceil(min / step) * step; tick <= max + 1e-9; tick += step) {
    ticks.push(Math.round(tick * 1000) / 1000);
  }
  return ticks;
}

/**
 * One measured thing over time.
 *
 * Deliberately one series on one axis: weight in kilograms and a waist in
 * centimetres share no scale, and drawing them together would invent a
 * relationship the numbers do not contain. The reader switches metric instead.
 */
export function MetricChart({
  label,
  unit,
  points,
  reference,
  domain,
  pointNoun = "mätningar",
  emptyTitle = "Inget mätt ännu",
  emptyDescription,
}: {
  label: string;
  unit: MetricChartUnit;
  points: MetricChartPoint[];
  reference: Reference | null;
  domain?: { from: string; to: string };
  pointNoun?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const instructionsId = useId();
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<number | null>(null);
  const [announceKeyboardValue, setAnnounceKeyboardValue] = useState(false);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const height = Math.max(MIN_HEIGHT, Math.round(width * 0.32));
  const plotWidth = Math.max(1, width - PADDING.left - PADDING.right);
  const plotHeight = Math.max(1, height - PADDING.top - PADDING.bottom);

  const times = points.map((point) => parseDay(point.measuredOn));
  const values = points.map((point) => point.value);
  const minTime = domain ? parseDay(domain.from) : times.length ? Math.min(...times) : 0;
  const maxTime = domain ? parseDay(domain.to) : times.length ? Math.max(...times) : 1;
  const timeSpan = Math.max(1, maxTime - minTime);

  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 1;
  const withReference = reference
    ? [rawMin, rawMax, reference.value]
    : [rawMin, rawMax];
  const lowest = Math.min(...withReference);
  const highest = Math.max(...withReference);
  const pad = Math.max((highest - lowest) * 0.18, 0.5);
  const domainMin = lowest - pad;
  const domainMax = highest + pad;
  const valueSpan = Math.max(1e-6, domainMax - domainMin);

  const x = useCallback(
    (time: number) => PADDING.left + ((time - minTime) / timeSpan) * plotWidth,
    [minTime, plotWidth, timeSpan],
  );
  const y = useCallback(
    (value: number) =>
      PADDING.top + plotHeight - ((value - domainMin) / valueSpan) * plotHeight,
    [domainMin, plotHeight, valueSpan],
  );

  function nearestIndex(clientX: number): number | null {
    const frame = frameRef.current;
    if (!frame || points.length === 0) return null;
    const bounds = frame.getBoundingClientRect();
    const offset = clientX - bounds.left;
    let best = 0;
    let bestDistance = Infinity;
    times.forEach((time, index) => {
      const distance = Math.abs(x(time) - offset);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

  if (points.length === 0) {
    return (
      <div className="p100-chart-empty" ref={frameRef}>
        <strong>{emptyTitle}</strong>
        <p>
          {emptyDescription ??
            `Logga ${label.toLocaleLowerCase("sv-SE")} minst en gång så ritas linjen här.`}
        </p>
      </div>
    );
  }

  const ticks = niceTicks(domainMin + pad * 0.4, domainMax - pad * 0.4);
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(times[index])} ${y(point.value)}`)
    .join(" ");
  const area =
    points.length > 1
      ? `${line} L ${x(times[times.length - 1])} ${PADDING.top + plotHeight} L ${x(times[0])} ${
          PADDING.top + plotHeight
        } Z`
      : "";

  const lastIndex = points.length - 1;
  const shownIndex = active ?? lastIndex;
  const shown = points[shownIndex];
  const shownX = x(times[shownIndex]);
  const shownY = y(shown.value);
  const tooltipRight = shownX > PADDING.left + plotWidth * 0.62;

  const axisTimes =
    maxTime > minTime
      ? [minTime, minTime + (maxTime - minTime) / 2, maxTime]
      : [minTime];

  return (
    <div className="p100-chart" ref={frameRef}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${label} över tid, ${points.length} ${pointNoun}. Värdena finns i tabellen nedanför.`}
        aria-describedby={instructionsId}
        tabIndex={0}
        onPointerMove={(event) => {
          setAnnounceKeyboardValue(false);
          setActive(nearestIndex(event.clientX));
        }}
        onPointerLeave={() => {
          setAnnounceKeyboardValue(false);
          setActive(null);
        }}
        onBlur={() => {
          setAnnounceKeyboardValue(false);
          setActive(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const step = event.key === "ArrowLeft" ? -1 : 1;
          setAnnounceKeyboardValue(true);
          setActive((current) =>
            Math.min(lastIndex, Math.max(0, (current ?? lastIndex) + step)),
          );
        }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className="p100-chart-grid"
              x1={PADDING.left}
              x2={PADDING.left + plotWidth}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="p100-chart-tick" x={PADDING.left - 9} y={y(tick) + 3.5} textAnchor="end">
              {(Math.round(tick * 10) / 10).toLocaleString("sv-SE", { maximumFractionDigits: 1 })}
            </text>
          </g>
        ))}

        {reference ? (
          <g>
            {/* An actual threshold, not chrome — dashed on purpose and labelled. */}
            <line
              className="p100-chart-reference"
              x1={PADDING.left}
              x2={PADDING.left + plotWidth}
              y1={y(reference.value)}
              y2={y(reference.value)}
            />
            <text
              className="p100-chart-reference-label"
              x={PADDING.left + plotWidth}
              y={y(reference.value) - 7}
              textAnchor="end"
            >
              {reference.label}
            </text>
          </g>
        ) : null}

        {area ? <path className="p100-chart-area" d={area} /> : null}
        <path className="p100-chart-line" d={line} />

        {axisTimes.map((time, index) => (
          <text
            key={`${time}-${index}`}
            className="p100-chart-tick"
            x={x(time)}
            y={height - 9}
            textAnchor={index === 0 ? "start" : index === axisTimes.length - 1 ? "end" : "middle"}
          >
            {dayFormatter.format(new Date(time))}
          </text>
        ))}

        <line
          className="p100-chart-crosshair"
          x1={shownX}
          x2={shownX}
          y1={PADDING.top}
          y2={PADDING.top + plotHeight}
          opacity={active === null ? 0 : 1}
        />
        <circle className="p100-chart-dot-ring" cx={shownX} cy={shownY} r={6.5} />
        <circle className="p100-chart-dot" cx={shownX} cy={shownY} r={4.5} />
      </svg>

      <div
        className={`p100-chart-readout${tooltipRight ? " right" : ""}`}
        style={{ left: `${shownX}px`, top: `${Math.max(6, shownY - 66)}px` }}
      >
        <strong>{formatValue(shown.value, unit)}</strong>
        <span>
          <i aria-hidden="true" />
          {label}
        </span>
        <small>{fullDayFormatter.format(new Date(`${shown.measuredOn}T12:00:00`))}</small>
      </div>
      <p id={instructionsId} className="sr-only">
        Använd vänster och höger piltangent för att läsa punkterna. Alla värden finns
        också i tabellen nedanför.
      </p>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announceKeyboardValue
          ? `${label}: ${formatValue(shown.value, unit)}, ${fullDayFormatter.format(
              new Date(`${shown.measuredOn}T12:00:00`),
            )}`
          : ""}
      </p>
    </div>
  );
}
