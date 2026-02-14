import type { Bar } from "../gantt/core/data";

export function generateMockBars(count: number): Bar[] {
  const now = Date.now();
  const dayMs = 86_400_000;
  const rangeStart = now - 365 * dayMs;
  const rangeEnd = now;
  const span = rangeEnd - rangeStart;

  const palette: [number, number, number][] = [
    [0.25, 0.78, 0.45], // green
    [0.95, 0.85, 0.30], // yellow
    [0.30, 0.55, 0.92], // blue
  ];

  const bars: Bar[] = [];
  for (let i = 0; i < count; i++) {
    const start = rangeStart + Math.random() * span;
    const duration = Math.random() * 3 * dayMs + 60_000;
    bars.push({
      start,
      end: Math.min(start + duration, rangeEnd),
      color: palette[i % 3],
      label: `Task #${i}`,
    });
  }

  bars.sort((a, b) => a.start - b.start);
  return bars;
}
