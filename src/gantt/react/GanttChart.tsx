import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { Bar } from "../core/data.ts";
import { GanttChartInstance } from "../core/GanttChartInstance.ts";
import "./GanttChart.css";

export interface GanttChartProps {
  bars: Bar[];
  onBarClick?: (bar: Bar, index: number) => void;
  formatTooltip?: (bar: Bar, index: number) => string;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const AXIS_FORMATS: [number, Intl.DateTimeFormatOptions][] = [
  [MINUTE,     { hour: "2-digit", minute: "2-digit", second: "2-digit" }],
  [HOUR,       { hour: "2-digit", minute: "2-digit" }],
  [DAY * 3,    { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }],
  [DAY * 60,   { month: "short", day: "numeric" }],
  [Infinity,   { year: "numeric", month: "short" }],
];

function formatAxisTick(ms: number, span: number): string {
  const opts = AXIS_FORMATS.find(([max]) => span < max)![1];
  return new Date(ms).toLocaleString(undefined, opts);
}

export function GanttChart({ bars, onBarClick, formatTooltip }: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<GanttChartInstance | null>(null);

  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const axisTicks = useMemo(() => {
    const count = 10;
    const span = viewEnd - viewStart;
    if (span <= 0) return [];
    return Array.from({ length: count + 1 }, (_, i) => {
      const t = viewStart + (i / count) * span;
      return formatAxisTick(t, span);
    });
  }, [viewStart, viewEnd]);

  const resetZoom = useCallback(() => {
    instanceRef.current?.resetZoom();
  }, []);

  useEffect(() => {
    const container = containerRef.current!;
    let destroyed = false;
    let instance: GanttChartInstance | undefined;

    GanttChartInstance.create(container, {
      bars,
      onBarClick,
      formatTooltip,
      onViewportChange(vs, ve, zoomed) {
        setViewStart(vs);
        setViewEnd(ve);
        setIsZoomed(zoomed);
      },
    })
      .then((inst) => {
        if (destroyed) {
          inst.destroy();
          return;
        }
        instance = inst;
        instanceRef.current = inst;
      })
      .catch((err) => setError((err as Error).message));

    return () => {
      destroyed = true;
      instance?.destroy();
      instanceRef.current = null;
    };
  }, [bars, onBarClick, formatTooltip]);

  if (error) {
    return <p style={{ color: "red", padding: "2rem" }}>{error}</p>;
  }

  return (
    <div className="gantt">
      <div className="toolbar">
        {isZoomed && (
          <button className="reset" onClick={resetZoom}>
            Reset zoom
          </button>
        )}
      </div>
      <div ref={containerRef} className="wrapper" />
      <div className="axis">
        {axisTicks.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
    </div>
  );
}
