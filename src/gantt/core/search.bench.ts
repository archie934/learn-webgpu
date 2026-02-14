import { bench, describe } from "vitest";
import type { SearchContext } from "./search.ts";
import { createBinarySearchStrategy, createHitMapStrategy } from "./search.ts";
import { generateMockBars } from "../../mock/data.ts";

const COUNTS = [1_000, 10_000, 80_000, 200_000];
const CANVAS_WIDTH = 1920;

for (const count of COUNTS) {
  const bars = generateMockBars(count);
  const minStart = bars[0].start;
  const maxEnd = bars[bars.length - 1].end;

  const ctxFull: SearchContext = {
    viewStart: minStart,
    viewEnd: maxEnd,
    canvasWidth: CANVAS_WIDTH,
  };

  const zoomSpan = (maxEnd - minStart) * 0.01;
  const zoomCenter = (minStart + maxEnd) / 2;
  const ctxZoomed: SearchContext = {
    viewStart: zoomCenter - zoomSpan / 2,
    viewEnd: zoomCenter + zoomSpan / 2,
    canvasWidth: CANVAS_WIDTH,
  };

  const queryPixels = Array.from({ length: 200 }, () =>
    Math.floor(Math.random() * CANVAS_WIDTH),
  );

  describe(`${count.toLocaleString()} bars — full view`, () => {
    const bs = createBinarySearchStrategy(bars);
    const hm = createHitMapStrategy(bars);

    bench("binary search", () => {
      for (const px of queryPixels) bs.find(px, ctxFull);
    });

    bench("hit map (warm)", () => {
      hm.find(0, ctxFull);
      for (const px of queryPixels) hm.find(px, ctxFull);
    });

    bench("hit map (cold rebuild)", () => {
      hm.invalidate();
      for (const px of queryPixels) hm.find(px, ctxFull);
    });
  });

  describe(`${count.toLocaleString()} bars — zoomed 1%`, () => {
    const bs = createBinarySearchStrategy(bars);
    const hm = createHitMapStrategy(bars);

    bench("binary search", () => {
      for (const px of queryPixels) bs.find(px, ctxZoomed);
    });

    bench("hit map (warm)", () => {
      hm.find(0, ctxZoomed);
      for (const px of queryPixels) hm.find(px, ctxZoomed);
    });

    bench("hit map (cold rebuild)", () => {
      hm.invalidate();
      for (const px of queryPixels) hm.find(px, ctxZoomed);
    });
  });
}
