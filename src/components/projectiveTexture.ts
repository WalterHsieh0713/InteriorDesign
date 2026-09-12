import * as THREE from "three";
import type { CameraFrame } from "@/lib/roomLayoutSchema";

// Real photo pixels projected onto the room's surfaces, using each photo's
// actual camera pose (from RoomCaptureModel.swift, aligned into room space by
// RoomExporter.alignmentTransform) instead of a flat sampled color.
//
// This only works for the LiDAR capture path — web-only (Gemini photo)
// sessions have no ARKit pose per photo, so `layout.cameraFrames` is absent
// there and every caller below is expected to fall back to flat/procedural
// color when it's missing or empty. That fallback is what keeps this
// entirely additive: nothing here can make an existing render worse.
//
// Known, accepted limitations (documented rather than silently wrong):
// - No occlusion test. A camera "sees" a surface purely by facing angle and
//   frustum membership, not by raycasting for furniture in the way — a couch
//   between the camera and the wall behind it doesn't block the wall's bake.
// - Nearest-neighbor sampling, not bilinear — fine at the bake resolutions
//   used here, would show as slight blockiness at higher resolution.
// - Furniture gets exactly one projected face (its most-visible side), not a
//   full per-face wrap — RoomPlan/Gemini only ever gave us a bounding box,
//   not a segmented mesh, so there's no clean way to UV-unwrap all 6 sides
//   of "a chair" independently. See FurnitureMesh.tsx for which face.

export type PreparedCamera = {
  /** World-space viewProjection matrix: clip = viewProjection * worldPos. */
  viewProjection: THREE.Matrix4;
  position: THREE.Vector3;
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
};

const imageCache = new Map<string, Promise<PreparedCamera | null>>();

function buildViewProjection(frame: CameraFrame): { viewProjection: THREE.Matrix4; position: THREE.Vector3 } {
  const world = new THREE.Matrix4().fromArray(frame.transform);
  const view = world.clone().invert();
  const aspect = frame.width / frame.height;
  const near = 0.05;
  const far = 30;
  const projection = new THREE.Matrix4().makePerspective(
    -near * Math.tan(frame.fovY / 2) * aspect,
    near * Math.tan(frame.fovY / 2) * aspect,
    near * Math.tan(frame.fovY / 2),
    -near * Math.tan(frame.fovY / 2),
    near,
    far
  );
  const position = new THREE.Vector3().setFromMatrixPosition(world);
  return { viewProjection: projection.multiply(view), position };
}

async function loadCamera(frame: CameraFrame): Promise<PreparedCamera | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Failed to load ${frame.url}`));
      el.src = frame.url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    // Read the whole frame into a plain array once — sampling later is then
    // just array indexing, not a canvas readback per pixel per texel.
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const { viewProjection, position } = buildViewProjection(frame);
    return { viewProjection, position, pixels, width: canvas.width, height: canvas.height };
  } catch {
    // A single missing/broken photo shouldn't stop the rest from baking.
    return null;
  }
}

/** Loads and prepares every camera frame once; safe to call repeatedly for
 * the same session, results are cached by URL for the page's lifetime. */
export async function prepareCameras(frames: CameraFrame[]): Promise<PreparedCamera[]> {
  if (typeof document === "undefined") return [];
  const loaded = await Promise.all(
    frames.map((frame) => {
      if (!imageCache.has(frame.url)) imageCache.set(frame.url, loadCamera(frame));
      return imageCache.get(frame.url)!;
    })
  );
  return loaded.filter((c): c is PreparedCamera => c !== null);
}

function samplePixel(camera: PreparedCamera, u: number, v: number): [number, number, number] | null {
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  const x = Math.min(camera.width - 1, Math.floor(u * camera.width));
  const y = Math.min(camera.height - 1, Math.floor(v * camera.height));
  const idx = (y * camera.width + x) * 4;
  return [camera.pixels[idx], camera.pixels[idx + 1], camera.pixels[idx + 2]];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Rotates a local-space vector about the world Y axis — the same rotation
 * `<group rotation={[0, theta, 0]}>` applies, so a locally-defined bake
 * target composed with this lands exactly where the mesh it's attached to
 * actually renders. */
export function rotateY(v: THREE.Vector3, theta: number): THREE.Vector3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return new THREE.Vector3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

export type PlaneTarget = {
  /** World-space center of the rectangle to bake. */
  center: THREE.Vector3;
  /** World-space, non-normalized axis spanning the full rectangle width (u: 0→1 goes -half→+half along this). */
  xAxis: THREE.Vector3;
  /** Same, for the rectangle's height (v: 0→1 goes top→bottom). */
  yAxis: THREE.Vector3;
  /** Outward-facing surface normal, world-space. */
  normal: THREE.Vector3;
  fallbackColor: string;
  resolution?: number;
};

/**
 * Bakes a flat rectangle (a wall, the floor, or one furniture face) into a
 * canvas texture by projecting it into whichever nearby cameras actually
 * faced it, blending where several overlap, and leaving `fallbackColor`
 * wherever no camera saw it well enough to trust.
 *
 * Returns null (never a broken/black texture) if there are no usable
 * cameras — callers should keep whatever they render today in that case.
 */
export function bakePlaneTexture(target: PlaneTarget, cameras: PreparedCamera[]): THREE.CanvasTexture | null {
  if (cameras.length === 0) return null;

  const resolution = target.resolution ?? 128;
  const canvas = document.createElement("canvas");
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(resolution, resolution);
  const fallback = hexToRgb(target.fallbackColor);

  // Only the handful of cameras actually near this surface are worth
  // testing per texel — cheap to compute once, saves looping over every
  // captured frame in the room for every pixel of every wall.
  const nearby = cameras
    .map((camera) => ({ camera, distance: camera.position.distanceTo(target.center) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6)
    .map((entry) => entry.camera);

  const worldPos = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const clip = new THREE.Vector4();

  for (let py = 0; py < resolution; py++) {
    const v = py / (resolution - 1);
    for (let px = 0; px < resolution; px++) {
      const u = px / (resolution - 1);
      worldPos
        .copy(target.center)
        .addScaledVector(target.xAxis, u - 0.5)
        .addScaledVector(target.yAxis, 0.5 - v);

      let r = 0;
      let g = 0;
      let b = 0;
      let totalWeight = 0;

      for (const camera of nearby) {
        clip.set(worldPos.x, worldPos.y, worldPos.z, 1).applyMatrix4(camera.viewProjection);
        if (clip.w <= 0.01) continue;
        const ndcX = clip.x / clip.w;
        const ndcY = clip.y / clip.w;
        if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1) continue;

        toCamera.copy(camera.position).sub(worldPos).normalize();
        const facing = target.normal.dot(toCamera);
        if (facing <= 0.05) continue;

        // Fades toward the edge of what the camera saw so overlapping
        // photos blend instead of showing a hard seam.
        const edgeFeather = (1 - Math.abs(ndcX)) * (1 - Math.abs(ndcY));
        const weight = facing * edgeFeather;
        const imgU = ndcX * 0.5 + 0.5;
        const imgV = 1 - (ndcY * 0.5 + 0.5);
        const pixel = samplePixel(camera, imgU, imgV);
        if (!pixel) continue;

        r += pixel[0] * weight;
        g += pixel[1] * weight;
        b += pixel[2] * weight;
        totalWeight += weight;
      }

      const idx = (py * resolution + px) * 4;
      // Below this, trust is too low to show a real pixel — blend toward
      // the flat fallback rather than a dim/noisy projected guess.
      const confidence = Math.min(1, totalWeight / 0.6);
      if (totalWeight > 0.02) {
        image.data[idx] = (r / totalWeight) * confidence + fallback[0] * (1 - confidence);
        image.data[idx + 1] = (g / totalWeight) * confidence + fallback[1] * (1 - confidence);
        image.data[idx + 2] = (b / totalWeight) * confidence + fallback[2] * (1 - confidence);
      } else {
        image.data[idx] = fallback[0];
        image.data[idx + 1] = fallback[1];
        image.data[idx + 2] = fallback[2];
      }
      image.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
