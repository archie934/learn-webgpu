import { describe, it, expect } from "vitest";
import type { Bar } from "./data";
import { INSTANCE_STRIDE, packBarsForGPU } from "./data";
import { generateMockBars } from "../../mock/data";

function makeBars(specs: { start: number; end: number }[]): Bar[] {
  return specs.map((s, i) => ({
    ...s,
    color: [1, 0, 0] as [number, number, number],
    label: `Bar ${i}`,
  }));
}

describe("generateMockBars", () => {
  it("returns the requested number of bars", () => {
    expect(generateMockBars(100)).toHaveLength(100);
    expect(generateMockBars(0)).toHaveLength(0);
  });

  it("bars are sequential — each starts at or after the previous ends", () => {
    const bars = generateMockBars(500);
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].start).toBeGreaterThanOrEqual(bars[i - 1].end);
    }
  });

  it("bars are sorted by start time", () => {
    const bars = generateMockBars(500);
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].start).toBeGreaterThanOrEqual(bars[i - 1].start);
    }
  });

  it("every bar.start < bar.end", () => {
    const bars = generateMockBars(1000);
    for (const b of bars) {
      expect(b.end).toBeGreaterThan(b.start);
    }
  });

  it("bar duration is between 1 and 8 minutes", () => {
    const bars = generateMockBars(1000);
    for (const b of bars) {
      const d = b.end - b.start;
      expect(d).toBeGreaterThanOrEqual(60_000);
      expect(d).toBeLessThanOrEqual(8 * 60_000);
    }
  });

  it("gaps between bars are at most 2 minutes", () => {
    const bars = generateMockBars(500);
    for (let i = 1; i < bars.length; i++) {
      const gap = bars[i].start - bars[i - 1].end;
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(2 * 60_000);
    }
  });

  it("uses exactly the 3 palette colors", () => {
    const bars = generateMockBars(300);
    const unique = new Set(bars.map((b) => b.color.join(",")));
    expect(unique.size).toBe(3);
  });
});

describe("packBarsForGPU", () => {
  it("produces a buffer of correct byte length", () => {
    const bars = makeBars([
      { start: 0, end: 100 },
      { start: 200, end: 300 },
    ]);
    const buf = packBarsForGPU(bars, 0);
    expect(buf.byteLength).toBe(bars.length * INSTANCE_STRIDE);
  });

  it("packs offset start, end, r, g, b per bar as float32", () => {
    const bars: Bar[] = [
      { start: 1000, end: 2000, color: [0.2, 0.4, 0.6], label: "A" },
      { start: 3000, end: 4000, color: [0.8, 0.1, 0.3], label: "B" },
    ];
    const offset = 1000;
    const f32 = new Float32Array(packBarsForGPU(bars, offset));

    // Bar 0: start-offset=0, end-offset=1000
    expect(f32[0]).toBeCloseTo(0);
    expect(f32[1]).toBeCloseTo(1000);
    expect(f32[2]).toBeCloseTo(0.2);
    expect(f32[3]).toBeCloseTo(0.4);
    expect(f32[4]).toBeCloseTo(0.6);

    // Bar 1: start-offset=2000, end-offset=3000
    expect(f32[5]).toBeCloseTo(2000);
    expect(f32[6]).toBeCloseTo(3000);
    expect(f32[7]).toBeCloseTo(0.8);
    expect(f32[8]).toBeCloseTo(0.1);
    expect(f32[9]).toBeCloseTo(0.3);
  });

  it("handles empty array", () => {
    const buf = packBarsForGPU([], 0);
    expect(buf.byteLength).toBe(0);
  });

  it("preserves sub-second precision for large timestamps with offset", () => {
    const ts = Date.now();
    const bars: Bar[] = [
      { start: ts, end: ts + 1000, color: [0, 0, 0], label: "X" },
    ];
    const f32 = new Float32Array(packBarsForGPU(bars, ts));
    // With offset, start is 0 and end is 1000 — no precision loss
    expect(f32[0]).toBe(0);
    expect(f32[1]).toBeCloseTo(1000);
  });
});
