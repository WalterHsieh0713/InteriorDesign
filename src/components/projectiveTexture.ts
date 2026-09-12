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

/** A box that can stand between a camera and the surface being baked. */
export type Occluder = {
  position: [number, number, number];
  rotationY: number;
  dimensions: [number, number, number];
};

type PreparedOccluder = {
  center: THREE.Vector3;
  half: [number, number, number];
  cos: number;
  sin: number;
  /** Bounding-sphere radius, for the cheap reject before the real test. */
  radius: number;
};

/** Precomputes the per-occluder constants so the inner loop, which runs
 * millions of times per bake, does arithmetic instead of allocation. */
export function prepareOccluders(occluders: Occluder[]): PreparedOccluder[] {
  return occluders
    // Anything paper-thin (a rug) blocks nothing worth blocking, and testing
    // it costs the same as testing a wardrobe.
    .filter((o) => Math.max(...o.dimensions) > 0.25)
    .map((o) => {
      const half: [number, number, number] = [
        Math.max(o.dimensions[0], 0.01) / 2,
        Math.max(o.dimensions[1], 0.01) / 2,
        Math.max(o.dimensions[2], 0.01) / 2,
      ];
      return {
        center: new THREE.Vector3(...o.position),
        half,
        cos: Math.cos(-o.rotationY),
        sin: Math.sin(-o.rotationY),
        radius: Math.hypot(half[0], half[1], half[2]),
      };
    });
}

/**
 * Is the straight line from a point on the surface to the camera blocked?
 *
 * This is the whole fix for smeared textures: without it a camera pointed at
 * a table still counts as "seeing" the floor behind the table, and paints the
 * table's pixels onto that floor. Every streak of furniture-coloured haze
 * across a floor or wall is one of these unblocked projections.
 */
function isOccluded(
  point: THREE.Vector3,
  cameraPosition: THREE.Vector3,
  occluders: PreparedOccluder[]
): boolean {
  const dx = cameraPosition.x - point.x;
  const dy = cameraPosition.y - point.y;
  const dz = cameraPosition.z - point.z;
  const segmentLength = Math.hypot(dx, dy, dz);
  if (segmentLength < 1e-4) return false;

  for (const occluder of occluders) {
    // Cheap reject first: how far is the box's centre from this line? Nearly
    // every occluder in a room fails here, which is what keeps the exact test
    // below affordable.
    const toCenterX = occluder.center.x - point.x;
    const toCenterY = occluder.center.y - point.y;
    const toCenterZ = occluder.center.z - point.z;
    const along = (toCenterX * dx + toCenterY * dy + toCenterZ * dz) / segmentLength;
    if (along < -occluder.radius || along > segmentLength + occluder.radius) continue;
    const perpendicular = Math.sqrt(
      Math.max(
        0,
        toCenterX * toCenterX + toCenterY * toCenterY + toCenterZ * toCenterZ - along * along
      )
    );
    if (perpendicular > occluder.radius) continue;

    // Exact slab test, in the box's own rotated frame.
    const lx = toCenterX * -1;
    const lz = toCenterZ * -1;
    const ox = lx * occluder.cos + lz * occluder.sin;
    const oz = -lx * occluder.sin + lz * occluder.cos;
    const oy = -toCenterY;
    const rx = dx * occluder.cos + dz * occluder.sin;
    const rz = -dx * occluder.sin + dz * occluder.cos;
    const ray = [rx, dy, rz];
    const origin = [ox, oy, oz];

    let near = 0;
    let far = 1;
    let blocked = true;
    for (let axis = 0; axis < 3; axis++) {
      const o = origin[axis];
      const r = ray[axis];
      const h = occluder.half[axis];
      if (Math.abs(r) < 1e-9) {
        if (Math.abs(o) > h) {
          blocked = false;
          break;
        }
        continue;
      }
      let t1 = (-h - o) / r;
      let t2 = (h - o) / r;
      if (t1 > t2) [t1, t2] = [t2, t1];
      near = Math.max(near, t1);
      far = Math.min(far, t2);
      if (near > far) {
        blocked = false;
        break;
      }
    }

    // A blocker has to *begin* measurably away from the sample point. Without
    // the `near` floor, the surface being sampled counts as blocking itself:
    // a wall's own points sit inside its own box, so every wall occluded
    // itself and fell back to a flat room-wide colour. Same for a furniture
    // face, which lies on the box it belongs to.
    if (blocked && near > 0.01 && near < 0.998) return true;
  }

  return false;
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1)}`;
}

/**
 * Reads one representative colour for a whole surface out of the photos,
 * rather than painting the photos onto it.
 *
 * Same projection and occlusion logic as the full bake, but the result is a
 * single hex colour. This is what "the wall is grey, so make the whole wall
 * grey" needs: real measured colour, none of the projected imagery, and none
 * of the smearing that comes with imperfect poses and missing coverage.
 *
 * Uses the dominant colour, not the mean. Averaging a red wall that has a
 * white poster on it gives pink — a colour that appears nowhere in the room.
 * Instead the samples are dropped into coarse colour buckets, the fullest
 * bucket wins, and only the samples inside it are averaged, so the result is
 * always a colour the surface actually is somewhere.
 *
 * Cheap by comparison with the bake: a colour estimate converges in a few
 * thousand samples, where a texture needed one per texel.
 */
export function dominantPlaneColor(
  target: PlaneTarget,
  cameras: PreparedCamera[],
  occluders: PreparedOccluder[] = [],
  resolution = 48
): string | null {
  if (cameras.length === 0) return null;

  // Camera shortlist scales with how big the surface is. Six cameras nearest
  // the *centre* is fine for a 2m wall, but a 9m floor sampled that way is
  // read almost entirely from whoever stood in the middle of the room — its
  // edges get only grazing views or none, which is exactly where a floor's
  // colour goes wrong.
  const span = Math.max(target.xAxis.length(), target.yAxis.length());
  const poolSize = Math.max(6, Math.min(cameras.length, Math.round(span * 3)));
  const nearby = cameras
    .map((camera) => ({ camera, distance: camera.position.distanceTo(target.center) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, poolSize)
    .map((entry) => entry.camera);

  const worldPos = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const clip = new THREE.Vector4();

  // 5 bits per channel: fine enough to keep a beige wall apart from a grey
  // one, coarse enough that lighting variation across one wall stays in a
  // single bucket instead of splintering.
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();

  for (let py = 0; py < resolution; py++) {
    const v = py / (resolution - 1);
    for (let px = 0; px < resolution; px++) {
      const u = px / (resolution - 1);
      worldPos
        .copy(target.center)
        .addScaledVector(target.xAxis, u - 0.5)
        .addScaledVector(target.yAxis, 0.5 - v);

      let best: { weight: number; pixel: [number, number, number] } | null = null;

      for (const camera of nearby) {
        clip.set(worldPos.x, worldPos.y, worldPos.z, 1).applyMatrix4(camera.viewProjection);
        if (clip.w <= 0.01) continue;
        const ndcX = clip.x / clip.w;
        const ndcY = clip.y / clip.w;
        if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1) continue;

        toCamera.copy(camera.position).sub(worldPos).normalize();
        const facing = target.normal.dot(toCamera);
        if (facing <= 0.15) continue;
        if (occluders.length > 0 && isOccluded(worldPos, camera.position, occluders)) continue;

        const pixel = samplePixel(camera, ndcX * 0.5 + 0.5, 1 - (ndcY * 0.5 + 0.5));
        if (!pixel) continue;

        // Only the best view of each point contributes. Blending views is
        // what produced mush; for a colour estimate there's no reason to.
        const weight = facing * (1 - Math.abs(ndcX)) * (1 - Math.abs(ndcY));
        if (!best || weight > best.weight) best = { weight, pixel };
      }

      if (!best) continue;
      const [r, g, b] = best.pixel;
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }
    }
  }

  let winner: { count: number; r: number; g: number; b: number } | null = null;
  let total = 0;
  for (const bucket of buckets.values()) {
    total += bucket.count;
    if (!winner || bucket.count > winner.count) winner = bucket;
  }

  // Too few accepted samples means this surface was barely seen; the caller's
  // existing fallback colour is more trustworthy than a guess off six pixels.
  if (!winner || total < 25) return null;

  return toHex(winner.r / winner.count, winner.g / winner.count, winner.b / winner.count);
}

/**
 * Bakes a flat rectangle (a wall, the floor, or one furniture face) into a
 * canvas texture by projecting it into whichever nearby cameras actually
 * faced it, blending where several overlap, and leaving `fallbackColor`
 * wherever no camera saw it well enough to trust.
 *
 * Currently unused: the renderer takes flat per-surface colours from
 * dominantPlaneColor instead. Kept because it's the whole photo-projection
 * path, and "show me the real photos on the walls" is a mode worth being able
 * to turn back on.
 *
 * Returns null (never a broken/black texture) if there are no usable
 * cameras — callers should keep whatever they render today in that case.
 */
export function bakePlaneTexture(
  target: PlaneTarget,
  cameras: PreparedCamera[],
  occluders: PreparedOccluder[] = []
): THREE.CanvasTexture | null {
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

        // The camera may face this point and still not see it, because
        // something is standing in between. Checked last of the cheap tests
        // because it's the expensive one.
        if (occluders.length > 0 && isOccluded(worldPos, camera.position, occluders)) continue;

        // Fades toward the edge of what the camera saw so overlapping
        // photos blend instead of showing a hard seam.
        const edgeFeather = (1 - Math.abs(ndcX)) * (1 - Math.abs(ndcY));
        // Cubed rather than linear: a straight-on view should dominate a
        // grazing one rather than being averaged with it. Flat weighting
        // blends six disagreeing views into mush even when none of them is
        // occluded, which is the other half of the smearing.
        const weight = facing * facing * facing * edgeFeather;
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
