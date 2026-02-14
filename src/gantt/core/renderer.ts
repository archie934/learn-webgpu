import shaderCode from "./gantt.wgsl?raw";
import type { Bar } from "./data.ts";
import { packBarsForGPU, INSTANCE_STRIDE } from "./data.ts";

export const MIN_PIXEL_WIDTH = 2;

export interface Viewport {
  viewStart: number;
  viewEnd: number;
}

export interface GanttRenderer {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  viewport: Viewport;
  highlightIndex: number;
  render(): void;
  resize(): void;
  destroy(): void;
}

export async function createRenderer(
  canvas: HTMLCanvasElement,
  bars: Bar[],
): Promise<GanttRenderer> {
  if (!navigator.gpu) throw new Error("WebGPU not supported.");

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No GPU adapter.");
  const device = await adapter.requestDevice();

  const context = canvas.getContext("webgpu")!;
  const format = navigator.gpu.getPreferredCanvasFormat();

  function configureContext() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    context.configure({ device, format });
  }

  configureContext();

  // Subtract a reference time so float32 values stay small and precise when zoomed in
  const timeOffset = bars[0].start;

  const instanceData = packBarsForGPU(bars, timeOffset);
  const instanceBuffer = device.createBuffer({
    size: instanceData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(instanceBuffer, 0, instanceData);

  const uniformBuffer = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const shaderModule = device.createShaderModule({ code: shaderCode });

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: "vs",
      buffers: [
        {
          arrayStride: INSTANCE_STRIDE,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32" },  // barStart
            { shaderLocation: 1, offset: 4, format: "float32" },  // barEnd
            { shaderLocation: 2, offset: 8, format: "float32x3" }, // color
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fs",
      targets: [{ format }],
    },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const barCount = bars.length;

  const state: GanttRenderer = {
    device,
    canvas,
    viewport: {
      viewStart: bars[0].start,
      viewEnd: bars[bars.length - 1].end,
    },
    highlightIndex: -1,

    render() {
      const buf = new ArrayBuffer(32);
      const f32 = new Float32Array(buf);
      const i32 = new Int32Array(buf);

      f32[0] = state.viewport.viewStart - timeOffset;
      f32[1] = state.viewport.viewEnd - timeOffset;
      f32[2] = canvas.width;
      f32[3] = MIN_PIXEL_WIDTH;
      i32[4] = state.highlightIndex;

      device.queue.writeBuffer(uniformBuffer, 0, buf);

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0.1, g: 0.1, b: 0.12, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, instanceBuffer);
      pass.draw(6, barCount);

      pass.end();
      device.queue.submit([encoder.finish()]);
    },

    resize() {
      configureContext();
    },

    destroy() {
      instanceBuffer.destroy();
      uniformBuffer.destroy();
      device.destroy();
    },
  };

  return state;
}
