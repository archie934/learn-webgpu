import type { Bar } from "../gantt/core/data";

export function generateMockBars(count: number): Bar[] {
  const now = Date.now();
  const dayMs = 86_400_000;

  const palette: [number, number, number][] = [
    [0.25, 0.78, 0.45], // green
    [0.95, 0.85, 0.30], // yellow
    [0.30, 0.55, 0.92], // blue
  ];

  const bars: Bar[] = [];
  // Start one year ago and place bars sequentially
  let cursor = now - 365 * dayMs;

  for (let i = 0; i < count; i++) {
    // Random gap before this bar: 0–2 minutes
    cursor += Math.random() * 2 * 60_000;

    const start = cursor;
    // Random duration: 1 minute – 8 minutes
    const duration = Math.random() * 7 * 60_000 + 60_000;
    cursor = start + duration;

    bars.push({
      start,
      end: cursor,
      color: palette[i % 3],
      label: `Task #${i}`,
    });
  }

  return bars;
}
