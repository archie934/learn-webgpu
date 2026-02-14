import { describe, it, expect } from "vitest";
import type { SearchContext } from "./search.ts";
import { createBinarySearchStrategy, createHitMapStrategy } from "./search.ts";
import { generateMockBars } from "../../mock/data.ts";

const COUNTS = [1_000, 10_000, 80_000, 200_000];
const CANVAS_WIDTH = 1920;

function measureBytes(fn: () => void): number {
  global.gc?.();
  const before = process.memoryUsage().heapUsed;
  fn();
  global.gc?.();
  const after = process.memoryUsage().heapUsed;
  return after - before;
}

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

describe("memory footprint", () => {
  for (const count of COUNTS) {
    it(`${count.toLocaleString()} bars`, () => {
      const bars = generateMockBars(count);
      const minStart = bars[0].start;
      const maxEnd = bars[bars.length - 1].end;

      const ctx: SearchContext = {
        viewStart: minStart,
        viewEnd: maxEnd,
        canvasWidth: CANVAS_WIDTH,
      };

      // Binary search: just creation (stores maxDuration + closures)
      let bsStrategy: ReturnType<typeof createBinarySearchStrategy> | undefined;
      const bsBytes = measureBytes(() => {
        bsStrategy = createBinarySearchStrategy(bars);
        bsStrategy.find(0, ctx); // warm up
      });

      // Hit map: creation + first rebuild
      let hmStrategy: ReturnType<typeof createHitMapStrategy> | undefined;
      const hmBytes = measureBytes(() => {
        hmStrategy = createHitMapStrategy(bars);
        hmStrategy.find(0, ctx); // triggers rebuild
      });

      const hmMapOnly = CANVAS_WIDTH * 4; // Int32Array: 4 bytes per element

      console.log(`\n--- ${count.toLocaleString()} bars ---`);
      console.log(`  Binary search:  ${fmt(bsBytes)}`);
      console.log(`  Hit map:        ${fmt(hmBytes)}`);
      console.log(`  Hit map array:  ${fmt(hmMapOnly)} (theoretical: ${CANVAS_WIDTH} × 4 bytes)`);

      // Both strategies should be created
      expect(bsStrategy).toBeDefined();
      expect(hmStrategy).toBeDefined();
    });
  }
});
