import * as THREE from "three";

// Grayscale detail maps, tinted at render time by each material's `color`
// (three multiplies map × color). One wood grain serves every wood tone, so
// these are generated once and shared rather than per object.

export type TextureKind = "wood" | "fabric" | "carpet" | "plaster" | "tile";

const cache = new Map<TextureKind, THREE.Texture | null>();

function makeCanvas(size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function noise(ctx: CanvasRenderingContext2D, size: number, amount: number, grain: number) {
  const image = ctx.getImageData(0, 0, size, size);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    // Coarser grain = blockier speckle, which is what separates carpet pile
    // from a fine fabric weave at a distance.
    const n = (Math.random() - 0.5) * amount * (Math.random() < grain ? 2 : 1);
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
  }
  ctx.putImageData(image, 0, 0);
}

function draw(kind: TextureKind): HTMLCanvasElement {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  switch (kind) {
    case "wood": {
      for (let i = 0; i < 90; i++) {
        const y = Math.random() * size;
        ctx.strokeStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.07})`;
        ctx.lineWidth = 0.5 + Math.random() * 2.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(
          size * 0.3, y + (Math.random() - 0.5) * 10,
          size * 0.7, y + (Math.random() - 0.5) * 10,
          size, y + (Math.random() - 0.5) * 4
        );
        ctx.stroke();
      }
      noise(ctx, size, 10, 0.1);
      break;
    }
    case "fabric": {
      // Crosshatch reads as a weave once it's tiled down small.
      ctx.strokeStyle = "rgba(0,0,0,0.05)";
      ctx.lineWidth = 1;
      for (let i = 0; i < size; i += 3) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(size, i);
        ctx.stroke();
      }
      noise(ctx, size, 16, 0.2);
      break;
    }
    case "carpet": {
      noise(ctx, size, 34, 0.55);
      break;
    }
    case "tile": {
      const cell = size / 4;
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cell, 0);
        ctx.lineTo(i * cell, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cell);
        ctx.lineTo(size, i * cell);
        ctx.stroke();
      }
      noise(ctx, size, 6, 0.1);
      break;
    }
    case "plaster": {
      noise(ctx, size, 8, 0.15);
      break;
    }
  }

  return canvas;
}

export function getTexture(kind: TextureKind, repeat = 2): THREE.Texture | null {
  // Canvas isn't available during SSR; callers fall back to flat color.
  if (typeof document === "undefined") return null;

  if (!cache.has(kind)) {
    const texture = new THREE.CanvasTexture(draw(kind));
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    cache.set(kind, texture);
  }

  const base = cache.get(kind);
  if (!base) return null;

  // Repeat differs per surface (a floor tiles far more than a chair seat),
  // and textures can't share a repeat, so hand out clones.
  const instance = base.clone();
  instance.needsUpdate = true;
  instance.repeat.set(repeat, repeat);
  return instance;
}

export const CATEGORY_TEXTURE: Record<string, TextureKind> = {
  bed: "fabric",
  desk: "wood",
  chair: "fabric",
  stool: "wood",
  sofa: "fabric",
  table: "wood",
  shelf: "wood",
  dresser: "wood",
  nightstand: "wood",
  ottoman: "fabric",
  tv: "plaster",
  monitor: "plaster",
  lamp: "fabric",
  mirror: "plaster",
  plant: "plaster",
  rug: "carpet",
  door: "wood",
  window: "plaster",
  other: "plaster",
};
