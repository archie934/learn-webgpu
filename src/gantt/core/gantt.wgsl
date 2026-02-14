struct Viewport {
  viewStart: f32,
  viewEnd: f32,
  canvasWidth: f32,
  minPixelWidth: f32,
  highlightIndex: i32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
};

@group(0) @binding(0) var<uniform> vp: Viewport;

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
};

const QUAD_POS = array<vec2f, 6>(
  vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
  vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
);

@vertex
fn vs(
  @builtin(vertex_index) vid: u32,
  @builtin(instance_index) iid: u32,
  @location(0) barStart: f32,
  @location(1) barEnd: f32,
  @location(2) color: vec3f,
) -> VsOut {
  let viewSpan = vp.viewEnd - vp.viewStart;

  var nStart = (barStart - vp.viewStart) / viewSpan;
  var nEnd = (barEnd - vp.viewStart) / viewSpan;

  let pixelWidth = (nEnd - nStart) * vp.canvasWidth;
  if pixelWidth < vp.minPixelWidth {
    let center = (nStart + nEnd) * 0.5;
    let halfNorm = (vp.minPixelWidth / vp.canvasWidth) * 0.5;
    nStart = center - halfNorm;
    nEnd = center + halfNorm;
  }

  let left = nStart * 2.0 - 1.0;
  let right = nEnd * 2.0 - 1.0;

  let q = QUAD_POS[vid];
  let x = mix(left, right, q.x);
  let y = mix(-0.9, 0.9, q.y);

  var out: VsOut;
  out.position = vec4f(x, y, 0.0, 1.0);

  var col = color;
  if vp.highlightIndex == i32(iid) {
    col = col * 1.4;
  }
  out.color = col;

  return out;
}

@fragment
fn fs(@location(0) color: vec3f) -> @location(0) vec4f {
  return vec4f(color, 1.0);
}
