import type { Bar } from "./data.ts";
import type { GanttRenderer } from "./renderer.ts";

export interface InteractionOptions {
  onBarClick?: (bar: Bar, index: number) => void;
  formatTooltip?: (bar: Bar, index: number) => string;
  onZoom?: (viewStart: number, viewEnd: number) => void;
}

// Minimum px the mouse must move before a drag is recognized (avoids accidental drags on click)
const DRAG_THRESHOLD = 5;

function defaultTooltip(bar: Bar, _index: number): string {
  return `${bar.label} | ${fmtDate(bar.start)} — ${fmtDate(bar.end)}`;
}

/**
 * Attaches mouse listeners to the renderer's canvas for hover, click, and drag-to-zoom.
 * Returns a cleanup function that removes all listeners.
 */
export function setupInteraction(
  renderer: GanttRenderer,
  bars: Bar[],
  tooltip: HTMLElement,
  selection: HTMLElement,
  options: InteractionOptions = {},
): () => void {
  const formatTooltip = options.formatTooltip ?? defaultTooltip;
  const onBarClick = options.onBarClick;
  const onZoom = options.onZoom;
  const { canvas } = renderer;

  let dragStartX: number | null = null;
  let dragging = false;

  // Convert a horizontal pixel offset (relative to canvas) to a timestamp
  function pixelToTime(px: number): number {
    const { viewStart, viewEnd } = renderer.viewport;
    const rect = canvas.getBoundingClientRect();
    return viewStart + (px / rect.width) * (viewEnd - viewStart);
  }

  /**
   * Find the bar under a given timestamp using binary search + local scan.
   *
   * 1. Binary search to find the insertion point (last bar whose start <= time).
   * 2. Scan a small window around that index for exact hit (time within [start, end]).
   * 3. If no exact hit, do a second pass for bars that are visually expanded
   *    (the GPU shader enforces a minPixelWidth — we mirror that logic here
   *    so hover matches what the user actually sees on screen).
   */
  function findBarAt(time: number): number {
    let lo = 0;
    let hi = bars.length - 1;

    // Binary search: find rightmost bar with start <= time
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].start <= time) lo = mid + 1;
      else hi = mid - 1;
    }

    // Scan neighbours — bars can overlap so we check a radius around the insertion point
    const scanRadius = 20;
    const from = Math.max(0, hi - scanRadius);
    const to = Math.min(bars.length - 1, hi + scanRadius);

    // First pass: exact data-range hit
    for (let i = to; i >= from; i--) {
      const b = bars[i];
      if (time >= b.start && time <= b.end) return i;
    }

    // Second pass: account for bars stretched to minimum pixel width by the shader.
    // Convert the minPixelWidth (2px) back to a time span so we can enlarge
    // tiny bars on the CPU side to match what the GPU renders.
    const { viewStart, viewEnd } = renderer.viewport;
    const viewSpan = viewEnd - viewStart;
    const minTimeSpan = (2 / canvas.width) * viewSpan;

    for (let i = to; i >= from; i--) {
      const b = bars[i];
      const dataSpan = b.end - b.start;
      if (dataSpan < minTimeSpan) {
        const center = (b.start + b.end) / 2;
        const half = minTimeSpan / 2;
        if (time >= center - half && time <= center + half) return i;
      }
    }

    return -1;
  }

  // --- Mouse handlers ---

  function onMouseDown(e: MouseEvent) {
    dragStartX = e.clientX;
    dragging = false;
    tooltip.style.display = "none";
  }

  function onMouseMove(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();

    // If mouse is held down, check if we've exceeded the drag threshold → show selection overlay
    if (dragStartX !== null) {
      const dx = Math.abs(e.clientX - dragStartX);
      if (dx >= DRAG_THRESHOLD) {
        dragging = true;
        const left = Math.min(dragStartX, e.clientX) - rect.left;
        const width = dx;
        selection.style.display = "block";
        selection.style.left = `${left}px`;
        selection.style.width = `${width}px`;
        canvas.style.cursor = "col-resize";
        return;
      }
    }

    // Normal hover: find bar under cursor and show tooltip
    const px = e.clientX - rect.left;
    const time = pixelToTime(px);
    const idx = findBarAt(time);
    renderer.highlightIndex = idx;

    if (idx >= 0) {
      const bar = bars[idx];
      tooltip.textContent = formatTooltip(bar, idx);
      tooltip.style.display = "block";

      // Position tooltip near cursor, flipping if it would overflow the viewport
      const tw = tooltip.offsetWidth;
      const th = tooltip.offsetHeight;
      const gap = 12;
      let tx = e.clientX + gap;
      let ty = e.clientY - th - gap;

      if (tx + tw > window.innerWidth) tx = e.clientX - tw - gap;
      if (ty < 0) ty = e.clientY + gap;

      tooltip.style.left = `${tx}px`;
      tooltip.style.top = `${ty}px`;
      canvas.style.cursor = "pointer";
    } else {
      tooltip.style.display = "none";
      canvas.style.cursor = "default";
    }
  }

  function onMouseUp(e: MouseEvent) {
    selection.style.display = "none";

    if (dragging && dragStartX !== null) {
      // Drag ended → convert the selection rectangle to a time range and zoom
      const rect = canvas.getBoundingClientRect();
      const x1 = Math.min(dragStartX, e.clientX) - rect.left;
      const x2 = Math.max(dragStartX, e.clientX) - rect.left;
      const t1 = pixelToTime(x1);
      const t2 = pixelToTime(x2);
      onZoom?.(t1, t2);
    } else if (dragStartX !== null) {
      // Mouse barely moved → treat as click
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const idx = findBarAt(pixelToTime(px));
      if (idx >= 0) {
        onBarClick?.(bars[idx], idx);
      }
    }

    dragStartX = null;
    dragging = false;
    canvas.style.cursor = "default";
  }

  function onLeave() {
    renderer.highlightIndex = -1;
    tooltip.style.display = "none";
    selection.style.display = "none";
    dragStartX = null;
    dragging = false;
  }

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mouseleave", onLeave);

  return () => {
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("mouseup", onMouseUp);
    canvas.removeEventListener("mouseleave", onLeave);
  };
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
