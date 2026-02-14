export interface Bar {
  start: number; // timestamp in ms
  end: number;
  color: [number, number, number]; // RGB, 0-1
  label: string;
}

// 20 bytes per instance: start(f32) + end(f32) + r(f32) + g(f32) + b(f32)
export const INSTANCE_STRIDE = 20;


export function packBarsForGPU(bars: Bar[], timeOffset: number): ArrayBuffer {
  const buf = new ArrayBuffer(bars.length * INSTANCE_STRIDE);
  const f32 = new Float32Array(buf);

  for (let i = 0; i < bars.length; i++) {
    const off = i * 5;
    f32[off] = bars[i].start - timeOffset;
    f32[off + 1] = bars[i].end - timeOffset;
    f32[off + 2] = bars[i].color[0];
    f32[off + 3] = bars[i].color[1];
    f32[off + 4] = bars[i].color[2];
  }
  return buf;
}
