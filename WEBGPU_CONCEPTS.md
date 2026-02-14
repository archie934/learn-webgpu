# WebGPU Concepts, Syntax & Tools

## What is WebGPU?

WebGPU is the successor to WebGL — a modern, low-level graphics and compute API for the web. It maps to native GPU APIs (Vulkan, Metal, Direct3D 12) instead of the legacy OpenGL that WebGL used.

Key advantages over WebGL:

- First-class **compute shader** support (GPGPU)
- Much lower CPU overhead per draw call
- Modern GPU features: compute-based particles, post-processing, indirect drawing
- Better suited for ML inference on the GPU
- Cleaner API with explicit resource management

---

## Architecture Overview

```
Browser JS  →  WebGPU API  →  Browser Implementation (Dawn / wgpu)  →  Native API  →  GPU
                                                                        ↑
                                                              Vulkan / Metal / D3D12
```

**Abstraction layers:**

| Concept          | What it is                                                   |
| ---------------- | ------------------------------------------------------------ |
| `navigator.gpu`  | Entry point — the `GPU` object                               |
| **Adapter**      | Represents a physical GPU + driver on the system             |
| **Device**       | Logical handle to the GPU — all resources are created from it|
| **Queue**        | Where you submit command buffers for the GPU to execute      |

---

## Initialization

```js
if (!navigator.gpu) throw new Error("WebGPU not supported");

const adapter = await navigator.gpu.requestAdapter();       // pick a GPU
const device  = await adapter.requestDevice();              // get logical device
```

`requestAdapter()` options:

```js
await navigator.gpu.requestAdapter({
  powerPreference: "high-performance", // or "low-power"
});
```

`requestDevice()` can request specific features and limits:

```js
await adapter.requestDevice({
  requiredFeatures: ["timestamp-query"],
  requiredLimits: { maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize },
});
```

---

## Canvas Setup (for rendering)

```js
const canvas  = document.querySelector("canvas");
const context = canvas.getContext("webgpu");

context.configure({
  device,
  format: navigator.gpu.getPreferredCanvasFormat(), // "bgra8unorm" or "rgba8unorm"
  alphaMode: "premultiplied",
});
```

---

## Buffers

```js
// Create
const vertexBuffer = device.createBuffer({
  size: data.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

// Write data into it
device.queue.writeBuffer(vertexBuffer, 0, data);
```

Common usage flags:

| Flag            | Purpose                              |
| --------------- | ------------------------------------ |
| `VERTEX`        | Vertex buffer                        |
| `INDEX`         | Index buffer                         |
| `UNIFORM`       | Uniform buffer (small, read-only)    |
| `STORAGE`       | Storage buffer (large, read/write)   |
| `COPY_SRC`      | Source of a copy operation           |
| `COPY_DST`      | Destination of a copy / writeBuffer  |
| `MAP_READ`      | Can be mapped to CPU for reading     |
| `MAP_WRITE`     | Can be mapped to CPU for writing     |

---

## Textures

```js
const texture = device.createTexture({
  size: [width, height],
  format: "rgba8unorm",
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});

// Upload image data
device.queue.copyExternalImageToTexture(
  { source: imageBitmap },
  { texture },
  [width, height]
);

const view    = texture.createView();
const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
```

---

## WGSL — WebGPU Shading Language

WGSL is the shader language for WebGPU (replaces GLSL). It has Rust-like syntax.

### Scalar Types

| Type    | Meaning            |
| ------- | ------------------ |
| `f32`   | 32-bit float       |
| `f16`   | 16-bit float       |
| `i32`   | signed 32-bit int  |
| `u32`   | unsigned 32-bit int|
| `bool`  | boolean            |

### Vector & Matrix Types

```wgsl
var a: vec2f;          // vec2<f32>
var b: vec3u;          // vec3<u32>
var c: vec4f;          // vec4<f32>
var m: mat4x4f;        // mat4x4<f32>
```

### Structs

```wgsl
struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
}
```

### Vertex Shader

```wgsl
@vertex
fn vs_main(@location(0) position: vec4f, @location(1) color: vec4f) -> VertexOutput {
  var out: VertexOutput;
  out.pos = position;
  out.color = color;
  return out;
}
```

### Fragment Shader

```wgsl
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  return in.color;
}
```

### Compute Shader

```wgsl
@group(0) @binding(0) var<storage, read_write> data: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  data[gid.x] = data[gid.x] * 2.0;
}
```

### Resource Bindings

```wgsl
@group(0) @binding(0) var<uniform> mvp: mat4x4f;      // uniform buffer
@group(0) @binding(1) var<storage, read> items: array<f32>; // read-only storage
@group(0) @binding(2) var tex: texture_2d<f32>;         // texture
@group(0) @binding(3) var samp: sampler;                // sampler
```

### Built-in Values

| Attribute                          | Stage    | Meaning                              |
| ---------------------------------- | -------- | ------------------------------------ |
| `@builtin(position)`              | vertex   | Clip-space output position           |
| `@builtin(vertex_index)`          | vertex   | Index of the current vertex          |
| `@builtin(instance_index)`        | vertex   | Index of the current instance        |
| `@builtin(front_facing)`          | fragment | Is the fragment front-facing?        |
| `@builtin(global_invocation_id)`  | compute  | 3D index in the full dispatch grid   |
| `@builtin(local_invocation_id)`   | compute  | 3D index within the workgroup        |
| `@builtin(workgroup_id)`          | compute  | Which workgroup this invocation is in|
| `@builtin(num_workgroups)`        | compute  | Total number of dispatched workgroups|

### WGSL Annotations Explained

WGSL uses `@` annotations (attributes) to tell the GPU how to interpret functions, parameters, and variables.

#### Stage Annotations — mark what kind of shader a function is

| Annotation   | Meaning                                          |
| ------------ | ------------------------------------------------ |
| `@vertex`    | This function is a vertex shader entry point     |
| `@fragment`  | This function is a fragment shader entry point   |
| `@compute`   | This function is a compute shader entry point    |

#### `@location(N)` — numbered data slots

The meaning changes depending on where it appears:

| Context              | Meaning                                                     | JS counterpart                          |
| -------------------- | ----------------------------------------------------------- | --------------------------------------- |
| **Vertex input**     | Read from vertex attribute at slot N                        | `attributes: [{ shaderLocation: N }]`   |
| **Vertex → Fragment**| Inter-stage variable passed from vertex output to fragment input | Locations must match between stages |
| **Fragment output**  | Write to render target (color attachment) N                 | N-th entry in pipeline `targets` array  |

The numbers don't need to be consecutive (you can use 0 and 3, skipping 1 and 2), but they must match between JS config and shader, and between shader stages.

#### `@builtin(name)` — access GPU-provided special values

These are values the GPU fills in automatically. You don't set them from JS.

```wgsl
@builtin(position) pos: vec4f        // vertex: clip-space output; fragment: pixel coordinates
@builtin(vertex_index) vid: u32      // which vertex is being processed (0, 1, 2, ...)
@builtin(global_invocation_id) gid: vec3u  // compute: thread index across entire dispatch
```

#### `@group(G) @binding(B)` — resource binding addresses

These pair up with your JS `bindGroup` setup. `@group` selects which bind group, `@binding` selects the slot within that group.

```wgsl
@group(0) @binding(0) var<uniform> mvp: mat4x4f;
@group(0) @binding(1) var<storage, read> data: array<f32>;
```

Maps to JS:

```js
// group 0 is set via: pass.setBindGroup(0, bindGroup)
// binding 0 and 1 are entries in that bind group:
device.createBindGroup({
  layout,
  entries: [
    { binding: 0, resource: { buffer: mvpBuffer } },
    { binding: 1, resource: { buffer: dataBuffer } },
  ],
});
```

#### `@workgroup_size(x, y, z)` — compute thread block dimensions

Defines how many threads run in one workgroup. Only used on `@compute` functions.

```wgsl
@compute @workgroup_size(64)          // 64 threads per workgroup (1D)
@compute @workgroup_size(8, 8)        // 64 threads in an 8×8 grid (2D)
@compute @workgroup_size(4, 4, 4)     // 64 threads in a 4×4×4 cube (3D)
```

The total number of threads = `workgroup_size × dispatchWorkgroups(...)` from JS.

#### `var<...>` address space qualifiers

Not an `@` annotation but often seen alongside them:

| Declaration                       | Meaning                                  |
| --------------------------------- | ---------------------------------------- |
| `var<uniform>`                    | Small, read-only buffer (like a constant)|
| `var<storage, read>`              | Large, read-only buffer                  |
| `var<storage, read_write>`        | Large, read-write buffer (compute only)  |
| `var<private>`                    | Per-invocation private variable          |
| `var<workgroup>`                  | Shared across threads in a workgroup     |

---

## Pipelines

### Render Pipeline

```js
const pipeline = device.createRenderPipeline({
  layout: "auto",
  vertex: {
    module: device.createShaderModule({ code: wgslCode }),
    entryPoint: "vs_main",
    buffers: [{
      arrayStride: 32,        // bytes per vertex
      stepMode: "vertex",
      attributes: [
        { shaderLocation: 0, offset: 0,  format: "float32x4" }, // position
        { shaderLocation: 1, offset: 16, format: "float32x4" }, // color
      ],
    }],
  },
  fragment: {
    module: device.createShaderModule({ code: wgslCode }),
    entryPoint: "fs_main",
    targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }],
  },
  primitive: { topology: "triangle-list" },
});
```

Primitive topologies: `"point-list"`, `"line-list"`, `"line-strip"`, `"triangle-list"`, `"triangle-strip"`

### Compute Pipeline

```js
const computePipeline = device.createComputePipeline({
  layout: "auto",
  compute: {
    module: device.createShaderModule({ code: computeWGSL }),
    entryPoint: "main",
  },
});
```

---

## Bind Groups (passing data to shaders)

```js
// Layout defines the shape
const layout = device.createBindGroupLayout({
  entries: [{
    binding: 0,
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
    buffer: { type: "uniform" },
  }],
});

// Bind group binds actual resources to the layout
const bindGroup = device.createBindGroup({
  layout,
  entries: [{
    binding: 0,
    resource: { buffer: uniformBuffer },
  }],
});
```

Buffer types: `"uniform"`, `"storage"`, `"read-only-storage"`

---

## Command Encoding & Submission

### Render Pass

```js
const encoder = device.createCommandEncoder();

const pass = encoder.beginRenderPass({
  colorAttachments: [{
    view: context.getCurrentTexture().createView(),
    clearValue: { r: 0, g: 0, b: 0, a: 1 },
    loadOp: "clear",    // "clear" or "load"
    storeOp: "store",   // "store" or "discard"
  }],
});

pass.setPipeline(pipeline);
pass.setVertexBuffer(0, vertexBuffer);
pass.setBindGroup(0, bindGroup);
pass.draw(vertexCount);
pass.end();

device.queue.submit([encoder.finish()]);
```

### Compute Pass

```js
const encoder = device.createCommandEncoder();

const pass = encoder.beginComputePass();
pass.setPipeline(computePipeline);
pass.setBindGroup(0, bindGroup);
pass.dispatchWorkgroups(Math.ceil(numElements / 64));
pass.end();

device.queue.submit([encoder.finish()]);
```

### Reading Results Back to CPU

```js
// Copy GPU-side buffer → mappable staging buffer
encoder.copyBufferToBuffer(gpuBuffer, 0, stagingBuffer, 0, size);
device.queue.submit([encoder.finish()]);

// Map and read
await stagingBuffer.mapAsync(GPUMapMode.READ);
const result = new Float32Array(stagingBuffer.getMappedRange().slice(0));
stagingBuffer.unmap();
```

---

## Depth & Stencil

```js
const depthTexture = device.createTexture({
  size: [canvas.width, canvas.height],
  format: "depth24plus",
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

// Add to render pass
encoder.beginRenderPass({
  colorAttachments: [/* ... */],
  depthStencilAttachment: {
    view: depthTexture.createView(),
    depthClearValue: 1.0,
    depthLoadOp: "clear",
    depthStoreOp: "store",
  },
});

// Add to pipeline
device.createRenderPipeline({
  // ...other fields...
  depthStencil: {
    depthWriteEnabled: true,
    depthCompare: "less",
    format: "depth24plus",
  },
});
```

---

## Render Loop Pattern

```js
function frame() {
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: "clear",
      storeOp: "store",
    }],
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.draw(vertexCount);
  pass.end();

  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```

---

## Tools & Libraries

### Browser Implementations

| Engine   | Library | Used in                       |
| -------- | ------- | ----------------------------- |
| Chromium | Dawn    | Chrome, Edge                  |
| Firefox  | wgpu    | Firefox (via wgpu-core, Rust) |
| WebKit   | Dawn    | Safari (experimental)         |

### High-Level Libraries with WebGPU Support

| Library       | Notes                                     |
| ------------- | ----------------------------------------- |
| Three.js      | `WebGPURenderer` (in progress)            |
| Babylon.js    | Full WebGPU support                       |
| PlayCanvas    | WebGPU backend available                  |
| TensorFlow.js | WebGPU backend for ML inference           |

### Dev Tools

| Tool                     | What it does                                              |
| ------------------------ | --------------------------------------------------------- |
| Chrome DevTools          | GPU timeline, shader errors in console                    |
| `device.pushErrorScope`  | Programmatic error capture (validation, out-of-memory)    |
| `device.onuncapturederror` | Catch errors you didn't explicitly scope                |
| RenderDoc                | Frame capture & GPU debugging (native, not in-browser)    |
| Tint                     | WGSL compiler (part of Dawn)                              |
| Naga                     | WGSL compiler (part of wgpu, Rust)                        |

### Reference & Learning

| Resource                                                                 | Description                       |
| ------------------------------------------------------------------------ | --------------------------------- |
| [webgpu.rocks](https://webgpu.rocks)                                    | Quick API + WGSL reference        |
| [MDN WebGPU docs](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) | Thorough API documentation |
| [WebGPU Fundamentals](https://webgpufundamentals.org)                   | Step-by-step tutorials            |
| [WebGPU Samples](https://github.com/webgpu/webgpu-samples)             | Official sample code (TypeScript) |
| [Tour of WGSL](https://google.github.io/tour-of-wgsl/)                 | Interactive WGSL tutorial         |
| [W3C WebGPU Spec](https://gpuweb.github.io/gpuweb/)                    | The specification itself          |
| [W3C WGSL Spec](https://www.w3.org/TR/WGSL/)                           | WGSL language specification       |

### Native / Cross-Platform

| Library | Language | Notes                                                 |
| ------- | -------- | ----------------------------------------------------- |
| wgpu    | Rust     | Cross-platform WebGPU impl, powers Firefox            |
| Dawn    | C++      | Cross-platform WebGPU impl, powers Chrome             |
| wgpu-py | Python  | Python bindings for wgpu                              |

---

## Error Handling

```js
device.pushErrorScope("validation");

// ... do GPU work ...

device.popErrorScope().then((error) => {
  if (error) console.error("Validation error:", error.message);
});

// Catch anything you didn't scope
device.onuncapturederror = (event) => {
  console.error("Uncaptured GPU error:", event.error.message);
};

// Device can be lost (tab backgrounded, driver crash, etc.)
device.lost.then((info) => {
  console.error("Device lost:", info.reason, info.message);
});
```
