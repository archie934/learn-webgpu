import type { Bar } from "./data.ts";
import type { Viewport, GanttRenderer } from "./renderer.ts";
import { createRenderer } from "./renderer.ts";
import { setupInteraction } from "./interaction.ts";

export interface GanttChartOptions {
  bars: Bar[];
  onBarClick?: (bar: Bar, index: number) => void;
  formatTooltip?: (bar: Bar, index: number) => string;
  onViewportChange?: (viewStart: number, viewEnd: number, isZoomed: boolean) => void;
}

interface InstanceParts {
  renderer: GanttRenderer;
  cleanupInteraction: () => void;
  resizeObserver: ResizeObserver;
  animId: number;
  canvas: HTMLCanvasElement;
  tooltip: HTMLDivElement;
  selection: HTMLDivElement;
  options: GanttChartOptions;
}

export class GanttChartInstance {
  private renderer: GanttRenderer;
  private cleanupInteraction: () => void;
  private resizeObserver: ResizeObserver;
  private animId: number;
  private fullViewStart: number;
  private fullViewEnd: number;
  private canvas: HTMLCanvasElement;
  private tooltip: HTMLDivElement;
  private selection: HTMLDivElement;
  private options: GanttChartOptions;

  private constructor(parts: InstanceParts) {
    this.renderer = parts.renderer;
    this.cleanupInteraction = parts.cleanupInteraction;
    this.resizeObserver = parts.resizeObserver;
    this.animId = parts.animId;
    this.canvas = parts.canvas;
    this.tooltip = parts.tooltip;
    this.selection = parts.selection;
    this.options = parts.options;
    this.fullViewStart = parts.renderer.viewport.viewStart;
    this.fullViewEnd = parts.renderer.viewport.viewEnd;
  }

  static async create(container: HTMLElement, options: GanttChartOptions): Promise<GanttChartInstance> {
    const canvas = document.createElement("canvas");
    canvas.className = "canvas";
    const selection = document.createElement("div") as HTMLDivElement;
    selection.className = "selection";
    const tooltip = document.createElement("div") as HTMLDivElement;
    tooltip.className = "tooltip";

    container.appendChild(canvas);
    container.appendChild(selection);
    container.appendChild(tooltip);

    const renderer = await createRenderer(canvas, options.bars);

    const cleanupInteraction = setupInteraction(renderer, options.bars, tooltip, selection, {
      onBarClick: options.onBarClick,
      formatTooltip: options.formatTooltip,
      onZoom(vs, ve) {
        renderer.viewport.viewStart = vs;
        renderer.viewport.viewEnd = ve;
        options.onViewportChange?.(vs, ve, true);
      },
    });

    const ro = new ResizeObserver(() => renderer.resize());
    ro.observe(canvas);

    let animId = 0;
    function frame() {
      renderer.render();
      animId = requestAnimationFrame(frame);
    }
    animId = requestAnimationFrame(frame);

    const instance = new GanttChartInstance({
      renderer, cleanupInteraction, resizeObserver: ro, animId,
      canvas, tooltip, selection, options,
    });

    options.onViewportChange?.(renderer.viewport.viewStart, renderer.viewport.viewEnd, false);

    return instance;
  }

  getViewport(): Viewport {
    return { ...this.renderer.viewport };
  }

  setViewport(viewStart: number, viewEnd: number): void {
    this.renderer.viewport.viewStart = viewStart;
    this.renderer.viewport.viewEnd = viewEnd;
    const zoomed = viewStart !== this.fullViewStart || viewEnd !== this.fullViewEnd;
    this.options.onViewportChange?.(viewStart, viewEnd, zoomed);
  }

  resetZoom(): void {
    this.setViewport(this.fullViewStart, this.fullViewEnd);
  }

  isZoomed(): boolean {
    return (
      this.renderer.viewport.viewStart !== this.fullViewStart ||
      this.renderer.viewport.viewEnd !== this.fullViewEnd
    );
  }

  destroy(): void {
    cancelAnimationFrame(this.animId);
    this.resizeObserver.disconnect();
    this.cleanupInteraction();
    this.renderer.destroy();
    this.canvas.remove();
    this.tooltip.remove();
    this.selection.remove();
  }
}
