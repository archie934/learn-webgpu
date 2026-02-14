import type { Bar } from "./data.ts";
import type { GanttRenderer } from "./renderer.ts";
import type { BarSearchStrategy, SearchContext } from "./search.ts";
import { createBinarySearchStrategy } from "./search.ts";

export interface InteractionOptions {
  onBarClick?: (bar: Bar, index: number) => void;
  formatTooltip?: (bar: Bar, index: number) => string;
  onZoom?: (viewStart: number, viewEnd: number) => void;
  searchStrategy?: BarSearchStrategy;
}

const DRAG_THRESHOLD = 5;

function defaultTooltip(bar: Bar, _index: number): string {
  return `${bar.label} | ${fmtDate(bar.start)} — ${fmtDate(bar.end)}`;
}

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
  const strategy = options.searchStrategy ?? createBinarySearchStrategy(bars);

  function getSearchCtx(): SearchContext {
    return {
      viewStart: renderer.viewport.viewStart,
      viewEnd: renderer.viewport.viewEnd,
      canvasWidth: canvas.clientWidth,
    };
  }

  function findBarAt(px: number): number {
    return strategy.find(px, getSearchCtx());
  }

  function pixelToTime(px: number): number {
    const { viewStart, viewEnd } = renderer.viewport;
    const w = canvas.getBoundingClientRect().width;
    return viewStart + (px / w) * (viewEnd - viewStart);
  }

  // --- Mouse handlers ---

  let dragStartX: number | null = null;
  let dragging = false;

  function onMouseDown(e: MouseEvent) {
    dragStartX = e.clientX;
    dragging = false;
    tooltip.style.display = "none";
  }

  function onMouseMove(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();

    if (dragStartX !== null) {
      const dx = Math.abs(e.clientX - dragStartX);
      if (dx >= DRAG_THRESHOLD) {
        dragging = true;
        const left = Math.min(dragStartX, e.clientX) - rect.left;
        selection.style.display = "block";
        selection.style.left = `${left}px`;
        selection.style.width = `${dx}px`;
        canvas.style.cursor = "col-resize";
        return;
      }
    }

    const px = e.clientX - rect.left;
    const idx = findBarAt(px);
    renderer.highlightIndex = idx;

    if (idx >= 0) {
      const bar = bars[idx];
      tooltip.textContent = formatTooltip(bar, idx);
      tooltip.style.display = "block";

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
      const rect = canvas.getBoundingClientRect();
      const x1 = Math.min(dragStartX, e.clientX) - rect.left;
      const x2 = Math.max(dragStartX, e.clientX) - rect.left;
      onZoom?.(pixelToTime(x1), pixelToTime(x2));
      strategy.invalidate();
    } else if (dragStartX !== null) {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const idx = findBarAt(px);
      if (idx >= 0) onBarClick?.(bars[idx], idx);
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
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
