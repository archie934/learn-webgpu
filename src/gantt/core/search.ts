import type { Bar } from "./data.ts";
import { MIN_PIXEL_WIDTH } from "./renderer.ts";

export interface SearchContext {
  viewStart: number;
  viewEnd: number;
  canvasWidth: number;
}

/**
 * Strategy for finding which bar is at a given position.
 * - `find(px, ctx)`: returns the bar index at pixel column `px`, or -1.
 *   Called on every mousemove so it must be fast.
 * - `invalidate()`: signals that the viewport or canvas size changed.
 */
export interface BarSearchStrategy {
  find(px: number, ctx: SearchContext): number;
  invalidate(): void;
}

// ---------------------------------------------------------------------------
// Strategy 1: Binary search on sorted start times + bounded scan
// ---------------------------------------------------------------------------

export function createBinarySearchStrategy(bars: Bar[]): BarSearchStrategy {
  let maxDuration = 0;
  for (const b of bars) {
    const d = b.end - b.start;
    if (d > maxDuration) maxDuration = d;
  }

  function lowerBound(value: number): number {
    let lo = 0, hi = bars.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].start < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function upperBound(value: number): number {
    let lo = 0, hi = bars.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].start <= value) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  }

  return {
    find(px: number, ctx: SearchContext): number {
      const { viewStart, viewEnd, canvasWidth } = ctx;
      const span = viewEnd - viewStart;
      if (span <= 0 || canvasWidth <= 0) return -1;

      const time = viewStart + (px / canvasWidth) * span;
      const from = lowerBound(time - maxDuration);
      const to = upperBound(time);

      for (let i = to; i >= from; i--) {
        if (time >= bars[i].start && time <= bars[i].end) return i;
      }

      const minTimeSpan = (MIN_PIXEL_WIDTH / canvasWidth) * span;
      for (let i = to; i >= from; i--) {
        const b = bars[i];
        if (b.end - b.start < minTimeSpan) {
          const center = (b.start + b.end) / 2;
          const half = minTimeSpan / 2;
          if (time >= center - half && time <= center + half) return i;
        }
      }

      return -1;
    },
    invalidate() { /* stateless — nothing to clear */ },
  };
}

// ---------------------------------------------------------------------------
// Strategy 2: Pixel hit map (mirrors GPU rendering exactly)
// ---------------------------------------------------------------------------

export function createHitMapStrategy(bars: Bar[]): BarSearchStrategy {
  let hitMap = new Int32Array(0);
  let hmViewStart = 0;
  let hmViewEnd = 0;
  let hmWidth = 0;
  let dirty = true;

  function rebuild(ctx: SearchContext): void {
    const { viewStart, viewEnd, canvasWidth: w } = ctx;
    if (!dirty && w === hmWidth && viewStart === hmViewStart && viewEnd === hmViewEnd) return;

    dirty = false;
    hmViewStart = viewStart;
    hmViewEnd = viewEnd;
    hmWidth = w;
    if (w <= 0) return;

    hitMap = new Int32Array(w).fill(-1);
    const span = viewEnd - viewStart;
    if (span <= 0) return;

    for (let i = 0; i < bars.length; i++) {
      let x1 = ((bars[i].start - viewStart) / span) * w;
      let x2 = ((bars[i].end - viewStart) / span) * w;

      if (x2 - x1 < MIN_PIXEL_WIDTH) {
        const center = (x1 + x2) / 2;
        x1 = center - MIN_PIXEL_WIDTH / 2;
        x2 = center + MIN_PIXEL_WIDTH / 2;
      }

      const col1 = Math.max(0, Math.floor(x1));
      const col2 = Math.min(w - 1, Math.floor(x2));
      if (col2 < 0 || col1 >= w) continue;

      for (let c = col1; c <= col2; c++) {
        hitMap[c] = i;
      }
    }
  }

  return {
    find(px: number, ctx: SearchContext): number {
      rebuild(ctx);
      const col = Math.floor(px);
      if (col < 0 || col >= hitMap.length) return -1;
      return hitMap[col];
    },
    invalidate() { dirty = true; },
  };
}
