"use client";

import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Environment } from "@react-three/drei";
import * as THREE from "three";
import type { ItemBinding, RoomLayout } from "@/lib/roomLayoutSchema";
import { CATALOG_BY_ID, formatPrice, objectDisplayName, objectPriceCents } from "@/lib/catalog";
import { meshForItem, toBinding, toDimensions, type CatalogItem } from "@/lib/catalogItem";
import {
  clampToRoom,
  hangFromCeiling,
  initialPlacement,
  mountOf,
  snapFloorNearWall,
  snapToWall,
  supportHeightAt,
  wallOutlinePolygon,
} from "@/lib/placement";
import { availablePresets, rollFor, runLength, segmentsFor, type LedPreset, type LedPresetId } from "@/lib/ledPresets";
import { projectionFor } from "@/lib/projection";
import { buildShoppingList, type LineItem } from "@/lib/shoppingList";
import { FRAME_DEPTH, posterLabel, type PosterArt, type PosterSize } from "@/lib/posters";
import FurnitureMesh from "./FurnitureMesh";
import ProductMesh from "./ProductMesh";
import CatalogPanel from "./CatalogPanel";
import PosterMesh from "./PosterMesh";
import LedStrips from "./LedStrips";
import AccessoryMesh, { ProjectionScreen, accessoryKind } from "./AccessoryMesh";
import ShoppingList from "./ShoppingList";
import WallFeatures from "./WallFeatures";
import MirrorMesh from "./MirrorMesh";
import RoomPanel from "./RoomPanel";
import { getTexture, getContactShadowTexture, type TextureKind } from "./textures";
import {
  prepareCameras,
  dominantPlaneColor,
  prepareOccluders,
  rotateY,
  type PreparedCamera,
} from "./projectiveTexture";

// Plausible real-furniture tones, used only when we have no sampled color
// for an object. The previous palette was a categorical data-viz set — lime
// tables, canary chairs — which is what made scans read as a debug render
// rather than a room.
const CATEGORY_COLORS: Record<string, string> = {
  bed: "#b9bec7",
  desk: "#a97a5a",
  chair: "#c8a06a",
  stool: "#b98a55",
  sofa: "#8b8f98",
  table: "#b08a5e",
  shelf: "#9c7b55",
  dresser: "#8f6b4a",
  nightstand: "#8a6b4d",
  ottoman: "#8c7a6a",
  tv: "#1b1d20",
  monitor: "#1c1e21",
  lamp: "#e8dcc4",
  mirror: "#cfd6d8",
  plant: "#4f7942",
  rug: "#9a938a",
  refrigerator: "#d2d5d8",
  oven: "#3f4246",
  stove: "#4a4d51",
  dishwasher: "#c8ccd0",
  washerDryer: "#dcdfe2",
  sink: "#c3c9cd",
  toilet: "#eef1f2",
  bathtub: "#eceff0",
  fireplace: "#6e6660",
  stairs: "#a49a8e",
  keyboard: "#2e3134",
  speaker: "#3a3d41",
  clock: "#e6e2d8",
  artwork: "#8a7f72",
  thermostat: "#f0f2f3",
  smokeAlarm: "#f2f3f4",
  outlet: "#f4f2ee",
  lightSwitch: "#f4f2ee",
  vent: "#b8bcbf",
  books: "#8a5b46",
  door: "#7a5638",
  window: "#aecbd8",
  other: "#b0aca6",
};

// How rough each floor material reads under light — carpet swallows
// highlights, tile bounces them.
const FLOOR_ROUGHNESS: Record<string, number> = {
  carpet: 1,
  wood: 0.6,
  tile: 0.25,
  concrete: 0.9,
  vinyl: 0.5,
  other: 0.8,
};

const FLOOR_TEXTURE: Record<string, TextureKind> = {
  carpet: "carpet",
  wood: "wood",
  tile: "tile",
  concrete: "plaster",
  vinyl: "plaster",
  other: "carpet",
};

// The HDR environment map is fetched from a CDN at runtime. On a flaky
// phone connection that fetch can reject, and a rejected (not just slow)
// resource isn't something Suspense catches — it's a thrown error, which
// with no boundary unmounts the entire Canvas tree and leaves a black
// screen behind. Swallow it here instead: losing reflections is fine,
// losing the whole room is not.
class EnvironmentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("Environment lighting failed to load, continuing without it:", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/// Thin wrapper around placement.ts's wallOutlinePolygon — that's the one
/// true implementation (framework-agnostic, so it can also be used for
/// drag clamping/snapping), this just converts to the Vector2s the floor's
/// ShapeGeometry wants.
function wallOutline(walls: NonNullable<RoomLayout["walls"]>): THREE.Vector2[] | null {
  const polygon = wallOutlinePolygon(walls);
  return polygon ? polygon.map(([x, z]) => new THREE.Vector2(x, z)) : null;
}

/**
 * A wall that takes itself out of the way when you orbit behind it.
 *
 * All four are always in the scene — a room with two walls missing reads as
 * a stage set. Instead each hides only while the camera is outside it, which
 * is exactly when it would be between you and the room. `axis`/`sign`
 * describe which side of the room it is on.
 */
function WallPanel({
  axis,
  sign,
  limit,
  children,
  ...props
}: {
  axis: "x" | "y" | "z";
  sign: 1 | -1;
  limit: number;
  children: ReactNode;
} & React.ComponentProps<"mesh">) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera: cam }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const beyond = sign > 0 ? cam.position[axis] > limit : cam.position[axis] < -limit;
    // A small dead zone stops the wall strobing when the camera sits right
    // on the plane of it.
    const margin = 0.08;
    const clearly = sign > 0 ? cam.position[axis] > limit + margin : cam.position[axis] < -limit - margin;
    if (mesh.visible && beyond && clearly) mesh.visible = false;
    else if (!mesh.visible && !beyond) mesh.visible = true;
  });
  return (
    <mesh ref={ref} receiveShadow {...props}>
      {children}
    </mesh>
  );
}

/**
 * Where a ray meets the inside of the room, across all four walls at once.
 *
 * Picking the wall fresh on every pointer move is what lets a poster travel
 * around a corner: the moment the pointer crosses onto the next wall, that
 * wall is simply the nearest hit and the piece follows it.
 */
function nearestWallPoint(
  ray: THREE.Ray,
  room: RoomLayout["room"],
  walls?: RoomLayout["walls"]
): THREE.Vector3 | null {
  const planes: { plane: THREE.Plane; within: (p: THREE.Vector3) => boolean; maxY: number }[] = [];

  if (walls && walls.length >= 3) {
    // Real measured walls: one finite plane per wall segment, bounded by its
    // own length and height rather than the room's overall box.
    for (const w of walls) {
      const c = Math.cos(w.rotationY);
      const s = Math.sin(w.rotationY);
      const normal = new THREE.Vector3(s, 0, c);
      const towardOrigin = new THREE.Vector3(-w.position[0], 0, -w.position[2]);
      if (normal.dot(towardOrigin) < 0) normal.negate();
      const center = new THREE.Vector3(w.position[0], w.position[1], w.position[2]);
      const dir = new THREE.Vector3(c, 0, -s); // along the wall's own length
      const half = w.dimensions[0] / 2;
      planes.push({
        plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center),
        within: (p) => {
          const rel = p.clone().sub(center);
          return Math.abs(rel.dot(dir)) <= half + 0.2;
        },
        maxY: w.dimensions[1],
      });
    }
  } else {
    const hw = room.width / 2;
    const hl = room.length / 2;
    planes.push(
      { plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), hl), within: (p) => Math.abs(p.x) <= hw + 0.2, maxY: room.height },
      { plane: new THREE.Plane(new THREE.Vector3(0, 0, -1), hl), within: (p) => Math.abs(p.x) <= hw + 0.2, maxY: room.height },
      { plane: new THREE.Plane(new THREE.Vector3(1, 0, 0), hw), within: (p) => Math.abs(p.z) <= hl + 0.2, maxY: room.height },
      { plane: new THREE.Plane(new THREE.Vector3(-1, 0, 0), hw), within: (p) => Math.abs(p.z) <= hl + 0.2, maxY: room.height }
    );
  }

  let best: THREE.Vector3 | null = null;
  let bestDist = Infinity;
  const hit = new THREE.Vector3();
  for (const { plane, within, maxY } of planes) {
    if (!ray.intersectPlane(plane, hit)) continue;
    if (hit.y < -0.3 || hit.y > maxY + 0.3) continue;
    if (!within(hit)) continue;
    const d = ray.origin.distanceTo(hit);
    if (d < bestDist) {
      bestDist = d;
      best = hit.clone();
    }
  }
  return best;
}

/// One continuous plane under the whole room — cut to the wall outline when
/// the scan measured real walls, and the full bounding rectangle when it
/// didn't. Either way it stays a single unbroken surface: a floor that's one
/// piece can't tear or show a hole when furniture is dragged off the spot it
/// was scanned in.
function Floor({
  room,
  walls,
  cameras,
  occluders,
}: {
  room: RoomLayout["room"];
  walls: RoomLayout["walls"];
  cameras: PreparedCamera[];
  occluders: ReturnType<typeof prepareOccluders>;
}) {
  const { width, length } = room;
  const floorColor = room.floorColor ?? "#9c968d";
  const material = room.floorMaterial ?? "other";
  const floorRoughness = FLOOR_ROUGHNESS[material] ?? 0.8;

  // A floor tiles far more than a chair seat does — scale the repeat to the
  // room so the grain stays a believable size instead of stretching.
  const floorMap = useMemo(
    () => getTexture(FLOOR_TEXTURE[material] ?? "carpet", Math.max(4, Math.round(Math.max(width, length) / 1.5))),
    [material, width, length]
  );

  // One measured colour for the whole floor, read out of the photos rather
  // than the photos themselves painted onto it — occlusion-aware sampling
  // (walls and furniture block a camera's view of what's behind them) is
  // what a flat colour can afford that a full photo bake couldn't: the old
  // photo-projected floor could smear a chair's colour across the boards
  // behind it, because nothing stopped a camera "seeing" through solid
  // objects it was actually blocked by.
  const surfaceColor = useMemo(
    () =>
      dominantPlaneColor(
        {
          center: new THREE.Vector3(0, 0, 0),
          xAxis: new THREE.Vector3(width, 0, 0),
          yAxis: new THREE.Vector3(0, 0, -length),
          normal: new THREE.Vector3(0, 1, 0),
          fallbackColor: floorColor,
        },
        cameras,
        occluders
      ) ?? floorColor,
    [cameras, occluders, width, length, floorColor]
  );

  // Shape space maps to the floor as (a, b) -> world (a, 0, -b), which is what
  // the -90° X rotation below does. ShapeGeometry's own UVs are raw model
  // coordinates, not 0..1, so they're recomputed here to match what
  // planeGeometry would have produced, keeping the procedural grain aligned
  // the same way on both the rectangular and the shaped floor.
  const shaped = useMemo(() => {
    const outline = walls?.length ? wallOutline(walls) : null;
    if (!outline) return null;

    const shape = new THREE.Shape();
    shape.moveTo(outline[0].x, -outline[0].y);
    for (const p of outline.slice(1)) shape.lineTo(p.x, -p.y);
    shape.closePath();

    const geometry = new THREE.ShapeGeometry(shape);
    const position = geometry.attributes.position;
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i++) {
      const a = position.getX(i);
      const b = position.getY(i);
      uv[i * 2] = a / width + 0.5;
      uv[i * 2 + 1] = 0.5 + b / length;
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return geometry;
  }, [walls, width, length]);

  const surface = (
    <meshStandardMaterial
      color={surfaceColor}
      map={floorMap}
      side={THREE.DoubleSide}
      roughness={floorRoughness}
    />
  );

  if (shaped) {
    return (
      <mesh geometry={shaped} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        {surface}
      </mesh>
    );
  }

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[width, length]} />
      {surface}
    </mesh>
  );
}

/// Renders each individually measured wall where it actually stands, instead
/// of forcing the room into a width×length box. Used in place of the
/// four-wall fallback whenever the scan measured real wall segments — see
/// `layout.walls` in roomLayoutSchema.ts.
function MeasuredWalls({
  walls,
  wallColor,
  ceilingColor,
  height,
  width,
  length,
  cameras,
  occluders,
}: {
  walls: NonNullable<RoomLayout["walls"]>;
  wallColor: string;
  ceilingColor: string;
  height: number;
  width: number;
  length: number;
  cameras: PreparedCamera[];
  occluders: ReturnType<typeof prepareOccluders>;
}) {
  const wallMap = useMemo(() => getTexture("plaster", 6), []);
  const wallOpacity = cameras.length > 0 ? 0.95 : 0.88;

  // The ceiling takes the same outline as the floor, so the two agree about
  // the shape of the room. It used to be a hardcoded 40 x 40 m plane, which
  // overhangs a typical 8.9 x 7.2 m scan by roughly 15 m on every side — the
  // rectangular fallback in `Walls` had always sized itself correctly, this
  // path just never did. Falls back to the room box if the segments don't
  // chain into a closed outline, which is what the floor does too.
  const ceilingShape = useMemo(() => {
    const outline = wallOutline(walls);
    if (!outline) return null;

    // Same shape-space mapping as the floor: (a, b) -> world (a, y, -b) under
    // the -90° X rotation below, so ceiling and floor line up exactly.
    const shape = new THREE.Shape();
    shape.moveTo(outline[0].x, -outline[0].y);
    for (const p of outline.slice(1)) shape.lineTo(p.x, -p.y);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [walls]);

  const baked = useMemo(
    () =>
      walls.map((w) => {
        const [width, wallHeight] = w.dimensions;
        const center = new THREE.Vector3(w.position[0], w.position[1], w.position[2]);

        // A wall's stored yaw says which way it runs, not which of its two
        // faces points into the room. Aim the normal at the room's center
        // (the origin) so the bake samples the side the scanner stood on —
        // and remember whether that required flipping, because the mesh has
        // to be turned to match.
        const normal = rotateY(new THREE.Vector3(0, 0, 1), w.rotationY);
        const flipped = normal.dot(center.clone().negate()) < 0;
        if (flipped) normal.negate();

        return {
          flipped,
          // Sampled per wall, not per room: a red accent wall stays red while
          // the others stay white, which one room-wide wallColor can't say.
          color:
            dominantPlaneColor(
              {
                center,
                xAxis: rotateY(new THREE.Vector3(width, 0, 0), w.rotationY),
                yAxis: new THREE.Vector3(0, wallHeight, 0),
                normal,
                fallbackColor: wallColor,
              },
              cameras,
              occluders
            ) ?? wallColor,
        };
      }),
    [walls, wallColor, cameras, occluders]
  );

  return (
    <group>
      {/* A ceiling, so a pendant has something to hang from — measured walls
          don't say where the ceiling plane is on their own, so this still
          uses the room's overall height like the fallback box does. */}
      <WallPanel
        axis="y"
        sign={1}
        limit={height}
        position={[0, height, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        {...(ceilingShape ? { geometry: ceilingShape } : {})}
      >
        {!ceilingShape && <planeGeometry args={[width, length]} />}
        <meshStandardMaterial
          color={ceilingColor}
          side={THREE.DoubleSide}
          roughness={0.97}
          transparent
          opacity={wallOpacity}
        />
      </WallPanel>
      {walls.map((w, i) => {
        const { color, flipped } = baked[i];

        // Drawn up to the ceiling rather than at its measured height.
        //
        // RoomPlan measures each segment separately and routinely reports one
        // shorter than the room — the live scans have segments of 2.09 m in a
        // 2.73 m room, where the capture clipped the wall above a door or
        // under a soffit. Rendered at that height, every short segment leaves
        // a band of open space between its top and the ceiling.
        //
        // Only the vertical extent is stretched. Position, width and yaw are
        // the measurements furniture placement depends on and are untouched,
        // and the colour bake above still samples the wall's *measured*
        // rectangle, because that is the part a camera actually saw.
        const base = w.position[1] - w.dimensions[1] / 2;
        const renderHeight = Math.max(w.dimensions[1], height - base);

        return (
          <mesh
            key={i}
            position={[w.position[0], base + renderHeight / 2, w.position[2]]}
            // Turned so the front face points into the room, which is what
            // makes backface culling work below.
            rotation={[0, w.rotationY + (flipped ? Math.PI : 0), 0]}
            receiveShadow
          >
            <planeGeometry args={[w.dimensions[0], renderHeight]} />
            {/* Fully opaque and solved by culling rather than transparency:
                each wall only renders its inward face, so orbiting outside
                the room sees straight through the near walls to the interior
                while standing inside still shows solid, properly-coloured
                walls. */}
            <meshStandardMaterial color={color} map={wallMap} side={THREE.FrontSide} roughness={0.95} />
          </mesh>
        );
      })}
    </group>
  );
}

function Walls({
  room,
  cameras,
  occluders,
}: {
  room: RoomLayout["room"];
  cameras: PreparedCamera[];
  occluders: ReturnType<typeof prepareOccluders>;
}) {
  const { width, length, height } = room;
  const wallColor = room.wallColor ?? "#d8d4cd";
  const wallMap = useMemo(() => getTexture("plaster", 6), []);

  // One measured colour per wall, occlusion-aware (see Floor above for why
  // that beats painting the actual photos on): a camera standing in one
  // corner shouldn't be able to "see" straight through the wall behind it
  // to whatever else it's actually facing.
  const backWallColor = useMemo(
    () =>
      dominantPlaneColor(
        {
          center: new THREE.Vector3(0, height / 2, -length / 2),
          xAxis: new THREE.Vector3(width, 0, 0),
          yAxis: new THREE.Vector3(0, height, 0),
          normal: new THREE.Vector3(0, 0, 1),
          fallbackColor: wallColor,
        },
        cameras,
        occluders
      ) ?? wallColor,
    [cameras, occluders, width, height, length, wallColor]
  );
  const frontWallColor = useMemo(
    () =>
      dominantPlaneColor(
        {
          center: new THREE.Vector3(0, height / 2, length / 2),
          xAxis: new THREE.Vector3(-width, 0, 0),
          yAxis: new THREE.Vector3(0, height, 0),
          normal: new THREE.Vector3(0, 0, -1),
          fallbackColor: wallColor,
        },
        cameras,
        occluders
      ) ?? wallColor,
    [cameras, occluders, width, height, length, wallColor]
  );
  const rightWallColor = useMemo(
    () =>
      dominantPlaneColor(
        {
          center: new THREE.Vector3(width / 2, height / 2, 0),
          xAxis: new THREE.Vector3(0, 0, length),
          yAxis: new THREE.Vector3(0, height, 0),
          normal: new THREE.Vector3(-1, 0, 0),
          fallbackColor: wallColor,
        },
        cameras,
        occluders
      ) ?? wallColor,
    [cameras, occluders, width, height, length, wallColor]
  );
  const leftWallColor = useMemo(
    () =>
      dominantPlaneColor(
        {
          center: new THREE.Vector3(-width / 2, height / 2, 0),
          xAxis: new THREE.Vector3(0, 0, -length),
          yAxis: new THREE.Vector3(0, height, 0),
          normal: new THREE.Vector3(1, 0, 0),
          fallbackColor: wallColor,
        },
        cameras,
        occluders
      ) ?? wallColor,
    [cameras, occluders, width, height, length, wallColor]
  );

  // A flat guessed wall color stays translucent so you can still see inside
  // while orbiting from outside — but a wall showing a real sampled color is
  // worth looking at directly, so it goes near-opaque instead.
  const wallOpacity = cameras.length > 0 ? 0.95 : 0.88;

  function wallMaterial(color: string) {
    return (
      <meshStandardMaterial
        color={color}
        map={wallMap}
        side={THREE.DoubleSide}
        transparent
        opacity={wallOpacity}
        roughness={0.95}
      />
    );
  }

  return (
    <group>
      {/* A ceiling, so a pendant has something to hang from. It hides while the
          camera is above it, which is nearly always — the same rule the walls
          follow, and the reason you can still see into the room at all. */}
      <WallPanel
        axis="y"
        sign={1}
        limit={height}
        position={[0, height, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial
          color={room.ceilingColor ?? "#e8e6e2"}
          side={THREE.DoubleSide}
          roughness={0.97}
          transparent
          opacity={wallOpacity}
        />
      </WallPanel>
      <WallPanel axis="z" sign={-1} limit={length / 2} position={[0, height / 2, -length / 2]}>
        <planeGeometry args={[width, height]} />
        {wallMaterial(backWallColor)}
      </WallPanel>
      <WallPanel axis="z" sign={1} limit={length / 2} position={[0, height / 2, length / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[width, height]} />
        {wallMaterial(frontWallColor)}
      </WallPanel>
      <WallPanel axis="x" sign={1} limit={width / 2} position={[width / 2, height / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[length, height]} />
        {wallMaterial(rightWallColor)}
      </WallPanel>
      <WallPanel axis="x" sign={-1} limit={width / 2} position={[-width / 2, height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[length, height]} />
        {wallMaterial(leftWallColor)}
      </WallPanel>
    </group>
  );
}

function IconCamera({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconBack({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M19 12H5m0 0 6-6m-6 6 6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconReset({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 4v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M4.6 13a7.5 7.5 0 1 0 2.1-7.1L4 9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// A paper airplane — the universal "send" glyph, the same fold shape most
// share buttons use.
function IconSend({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

// Lamps are the one category that's plausibly an actual light source in the
// room, not just something lit by it — without this every render only ever
// has the one overhead sun-like light, no matter how many lamps are in shot.
const LAMP_LIGHT_COLOR = "#ffd9a0";

function DraggableObject({
  obj,
  isDragging,
  isSelected,
  onDragStart,
  cameras,
  occluders,
}: {
  obj: RoomLayout["objects"][number];
  isDragging: boolean;
  isSelected: boolean;
  onDragStart: (id: string, y: number, e: ThreeEvent<PointerEvent>) => void;
  cameras: PreparedCamera[];
  occluders: ReturnType<typeof prepareOccluders>;
}) {
  const [w, h, d] = obj.dimensions;
  // Only things actually resting on the floor get a contact shadow. A wall
  // TV or a mirror would otherwise drop a blob on the floor beneath it,
  // which reads as a bug rather than as grounding.
  const shadowTexture = useMemo(() => getContactShadowTexture(), []);
  const baseHeight = obj.position[1] - h / 2;
  const showContactShadow = shadowTexture !== null && baseHeight < 0.3 && obj.category !== "rug";
  // A catalog-bound object renders as the real product's mesh; everything else
  // keeps the procedural shape, which is still the right answer for the user's
  // own scanned furniture and for any product with no model paired to it.
  const item = obj.binding.source === "catalog" ? CATALOG_BY_ID.get(obj.binding.catalogItemId) : undefined;
  // IKEA's own asset when there is one — the real product, already to scale.
  // Otherwise an ABO stand-in, which gets stretched to fit.
  const mesh = item ? meshForItem(item) : null;
  // "poster:comic:a2" — the artwork is drawn, not downloaded, so it is chosen
  // here rather than looked up in the catalog.
  const posterArt = obj.preset?.startsWith("poster:")
    ? (obj.preset.split(":")[1] as PosterArt)
    : null;
  const accessory = item ? accessoryKind(item.styleTags) : null;
  // The object's own sampled color when we have one — that's what makes a
  // render recognizable as someone's actual room. Category palette is just
  // the fallback for older layouts and the LiDAR path.
  const color = obj.color ?? CATEGORY_COLORS[obj.category] ?? CATEGORY_COLORS.other;
  const [hovered, setHovered] = useState(false);

  return (
    <group
      position={obj.position}
      rotation={[0, obj.rotationY, 0]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        (e.target as Element).setPointerCapture?.(e.pointerId);
        onDragStart(obj.id, obj.position[1], e);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      {obj.category === "mirror" ? (
        <MirrorMesh dimensions={obj.dimensions} selected={isSelected} />
      ) : accessory ? (
        <AccessoryMesh
          kind={accessory}
          dimensions={obj.dimensions}
          color={item?.dominantHex ?? color}
          selected={isSelected}
        />
      ) : posterArt ? (
        <PosterMesh art={posterArt} dimensions={obj.dimensions} selected={isSelected} />
      ) : mesh && item ? (
        <Suspense
          fallback={
            <FurnitureMesh
              category={obj.category}
              dimensions={obj.dimensions}
              color={item.dominantHex}
              opacity={0.35}
              cameras={[]}
              occluders={occluders}
              objectPosition={obj.position}
              objectRotationY={obj.rotationY}
            />
          }
        >
          <ProductMesh
            modelUrl={mesh.url}
            exact={mesh.exact}
            dimensions={obj.dimensions}
            mount={item.mount}
            opacity={isDragging ? 0.6 : 1}
            selected={isSelected}
          />
        </Suspense>
      ) : (
        <FurnitureMesh
          category={obj.category}
          dimensions={obj.dimensions}
          color={color}
          opacity={isDragging ? 0.6 : 1}
          cameras={cameras}
          occluders={occluders}
          objectPosition={obj.position}
          objectRotationY={obj.rotationY}
        />
      )}
      {isSelected && (
        <lineSegments raycast={() => null}>
          <edgesGeometry args={[new THREE.BoxGeometry(...obj.dimensions)]} />
          <lineBasicMaterial color="#3b82f6" linewidth={2} />
        </lineSegments>
      )}
      {obj.category === "lamp" && (
        <pointLight position={[0, h * 0.3, 0]} color={LAMP_LIGHT_COLOR} intensity={2.5} distance={4} decay={2} />
      )}
      {showContactShadow && (
        <mesh
          // Sits just above the floor plane (world y ≈ 0) regardless of how
          // high this object's own center is — hence subtracting its y.
          position={[0, -obj.position[1] + 0.012, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[w * 1.35, d * 1.35]} />
          <meshBasicMaterial
            map={shadowTexture}
            transparent
            // Never write depth: the blob must not occlude the floor's own
            // texture or another object's shadow overlapping it.
            depthWrite={false}
            opacity={0.75}
          />
        </mesh>
      )}
      {hovered && (
        <Html position={[0, h / 2 + 0.15, 0]} center distanceFactor={8} style={{ pointerEvents: "none" }}>
          <div
            style={{
              background: "rgba(0,0,0,0.75)",
              color: "white",
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 11,
              whiteSpace: "nowrap",
            }}
          >
            {objectDisplayName(obj)}
          </div>
        </Html>
      )}
    </group>
  );
}

function Scene({
  layout,
  objects,
  cameras,
  selectedId,
  lightsOn,
  snapEnabled,
  controlsRef,
  onSelect,
  onObjectsChange,
  onPositionsSettled,
}: {
  layout: RoomLayout;
  objects: RoomLayout["objects"];
  cameras: PreparedCamera[];
  selectedId: string | null;
  lightsOn: boolean;
  snapEnabled: boolean;
  controlsRef: React.MutableRefObject<{ dollyIn?: (s: number) => void; dollyOut?: (s: number) => void; update?: () => void } | null>;
  onSelect: (id: string | null) => void;
  onObjectsChange: (objects: RoomLayout["objects"]) => void;
  onPositionsSettled: (objects: RoomLayout["objects"]) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragPlaneY = useRef(0);
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const intersection = useRef(new THREE.Vector3());
  // Pressing on an object has to serve two intentions: picking it, and moving
  // it. They are told apart at pointer-UP by whether the pointer actually
  // travelled — a press that never moved was a click, and selects.
  const gesture = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  // Mirrors `objects` so the pointermove listener can read the current array
  // without being torn down and re-attached on every frame of a drag.
  const latest = useRef(objects);
  useEffect(() => {
    latest.current = objects;
  }, [objects]);
  const { camera, raycaster, gl } = useThree();
  const lightColor = layout.room.lightColor ?? "#ffffff";

  // Where the key light comes from. A fixed corner is wrong in every room
  // that doesn't happen to have a window in that corner — and the layout
  // already tells us where the real windows are (LiDAR measures them
  // directly; Gemini infers them). Light the room from its actual largest
  // window, aimed inward at the room's center, and only fall back to the
  // arbitrary corner when a scan found no windows at all.
  const keyLight = useMemo(() => {
    const { width, length, height } = layout.room;
    const reach = Math.max(width, length, height) * 1.4;

    const windows = objects.filter((o) => o.category === "window");
    const brightest = windows
      .slice()
      .sort((a, b) => b.dimensions[0] * b.dimensions[1] - a.dimensions[0] * a.dimensions[1])[0];

    if (!brightest) {
      return {
        position: [width, height * 3, length] as [number, number, number],
        intensity: 1.7,
      };
    }

    // Push out along the horizontal direction from room center to the
    // window, so the light sits outside that wall shining in. A window
    // somehow at dead center has no meaningful outward direction — fall
    // back to something arbitrary but stable rather than NaN.
    const outward = new THREE.Vector3(brightest.position[0], 0, brightest.position[2]);
    if (outward.lengthSq() < 1e-6) outward.set(0, 0, 1);
    outward.normalize();

    return {
      // Slightly above the window itself: real daylight rakes downward into
      // a room rather than arriving dead level.
      position: [outward.x * reach, brightest.position[1] + height * 0.45, outward.z * reach] as [
        number,
        number,
        number,
      ],
      intensity: 2.1,
    };
  }, [layout.room, objects]);

  // Everything solid enough to stand between a camera and a surface, so the
  // colour sampling can tell "this wall is grey" from "a grey cabinet is in
  // front of this wall". Walls belong in here as much as furniture does —
  // without them a camera standing in one corner samples colour straight
  // *through* the wall behind it.
  const occluders = useMemo(
    () =>
      prepareOccluders([
        ...objects.map((o) => ({
          position: o.position,
          rotationY: o.rotationY,
          dimensions: o.dimensions,
        })),
        ...(layout.walls ?? []).map((w) => ({
          position: w.position,
          rotationY: w.rotationY,
          // RoomPlan reports walls as near-zero-thickness planes. Give them
          // real depth so they block reliably instead of being a surface a
          // ray can skim along the edge of.
          dimensions: [w.dimensions[0], w.dimensions[1], Math.max(w.dimensions[2], 0.08)] as [
            number,
            number,
            number,
          ],
        })),
      ]),
    [objects, layout.walls]
  );

  const handleDragStart = useCallback(
    (id: string, y: number, e: ThreeEvent<PointerEvent>) => {
      setDraggingId(id);
      gesture.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, moved: false };
      dragPlaneY.current = y;

      // A wall piece drags along the face of its wall, so the surface the
      // pointer is projected onto has to be that wall, not the floor. Anything
      // else drags across a horizontal plane as before.
      const obj = latest.current.find((o) => o.id === id);
      const mount = obj ? mountOf(obj) : "floor";
      if (obj && mount === "wall") {
        const snap = snapToWall(obj, obj.position[0], obj.position[1], obj.position[2], layout.room, layout.walls);
        // Read straight off the snap result rather than re-deriving it from
        // `side` — a real measured wall can sit at any angle, and `side` is
        // only ever one of the four cardinal labels.
        dragPlane.current.setFromNormalAndCoplanarPoint(
          new THREE.Vector3(snap.normal[0], 0, snap.normal[1]),
          new THREE.Vector3(snap.position[0], snap.position[1], snap.position[2])
        );
      } else if (obj && mount === "ceiling") {
        dragPlane.current.set(new THREE.Vector3(0, 1, 0), -(layout.room.height - obj.dimensions[1] / 2));
      } else {
        dragPlane.current.set(new THREE.Vector3(0, 1, 0), -y);
      }
    },
    [layout.room, layout.walls]
  );

  useEffect(() => {
    if (!draggingId) return;

    const canvas = gl.domElement;
    const pointer = new THREE.Vector2();

    function handleMove(e: PointerEvent) {
      const g = gesture.current;
      if (g && !g.moved) {
        // A few pixels of slop, so a shaky click on a trackpad or a thumb on
        // glass still reads as a click rather than a one-millimetre move.
        if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < 5) return;
        g.moved = true;
      }
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      if (!raycaster.ray.intersectPlane(dragPlane.current, intersection.current)) return;

      const dragged = latest.current.find((o) => o.id === draggingId);
      if (!dragged) return;
      const mount = mountOf(dragged);
      // Wall pieces re-derive their own point below; this is the floor plane.
      const { x, z } = intersection.current;
      let next: [number, number, number];

      if (mount === "wall") {
        // Re-pick the wall every frame rather than locking to the one the
        // piece started on. Locking is what made a poster stick at a corner:
        // once the pointer passed 90 degrees, it was still being projected
        // onto a wall that was no longer in front of it.
        const onWall = nearestWallPoint(raycaster.ray, layout.room, layout.walls);
        if (!onWall) return;
        const wallSnap = snapToWall(dragged, onWall.x, onWall.y, onWall.z, layout.room, layout.walls);
        next = wallSnap.position;
        const facing = wallSnap.rotationY;
        onObjectsChange(
          latest.current.map((o) =>
            o.id === draggingId ? { ...o, position: next, rotationY: facing } : o
          )
        );
        return;
      } else if (mount === "ceiling") {
        // Free over the floor, fixed to the ceiling.
        next = hangFromCeiling(dragged, x, z, layout.room);
      } else if (mount === "tabletop") {
        // Rest on whatever is underneath: a desk lamp rises onto a tall
        // nightstand and drops onto a lower desk without anyone typing a height.
        const [cx, cz] = clampToRoom(dragged, x, z, layout.room, layout.walls);
        const support = supportHeightAt(dragged, cx, cz, latest.current);
        next = [cx, support + dragged.dimensions[1] / 2, cz];
      } else {
        // Furniture in a real dorm lives against a wall, and getting something
        // exactly flush by hand in a 3D view is fiddly. Snapping is a toggle
        // because sometimes you do want a rug floating in the middle.
        const snapped = snapEnabled
          ? snapFloorNearWall(dragged, x, z, layout.room, undefined, layout.walls)
          : null;
        const [cx, cz] = clampToRoom(dragged, x, z, layout.room, layout.walls);
        next = snapped ? snapped.position : [cx, dragPlaneY.current, cz];
        if (snapped) {
          onObjectsChange(
            latest.current.map((o) =>
              o.id === draggingId ? { ...o, position: snapped.position, rotationY: snapped.rotationY } : o
            )
          );
          return;
        }
      }

      onObjectsChange(latest.current.map((o) => (o.id === draggingId ? { ...o, position: next } : o)));
    }

    function handleUp() {
      const moved = gesture.current?.moved ?? false;
      gesture.current = null;
      setDraggingId(null);
      if (moved) onPositionsSettled(latest.current);
      else onSelect(draggingId);
    }

    canvas.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      canvas.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [draggingId, camera, raycaster, gl, layout.room, layout.walls, onPositionsSettled, onObjectsChange, onSelect, snapEnabled]);

  return (
    <>
      {/* Image-based lighting does most of the work here — flat ambient
          light makes every material read as the same plastic. The preset
          HDR is fetched from a CDN, so keep it behind Suspense *and* an
          error boundary: a slow fetch should only delay reflections, and a
          failed one shouldn't take the rest of the room down with it.
          SoftShadows (drei's PCSS shader) was dropped — it's a known cause
          of crashed/lost WebGL contexts on mobile GPUs, which is exactly
          what "renders fine, then goes black" looks like. Canvas's default
          `shadows` prop still gives cheap PCF shadows. */}
      {lightsOn && (<EnvironmentBoundary>
        <Suspense fallback={null}>
          <Environment preset="apartment" />
        </Suspense>
      </EnvironmentBoundary>)}
      {/* Tinted by the room's own estimated light color (warm bulb vs.
          daylight) instead of flat white — an incandescent-lit room and a
          daylit one shouldn't come out looking identically lit. */}
      {/* Only the room's own daylight dims. Lamps, LED runs and a diffuser
          keep their output, which is the whole point of the switch. */}
      <ambientLight intensity={lightsOn ? 0.25 : 0.03} color={lightColor} />
      {/* Key light — positioned from the room's real largest window when the
          scan found one (see keyLight above), not a fixed corner. Its target
          defaults to the origin, which is the room's center, so it always
          rakes inward across the floor. */}
      <directionalLight
        position={keyLight.position}
        intensity={lightsOn ? keyLight.intensity : keyLight.intensity * 0.047}
        color={lightColor}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-layout.room.width}
        shadow-camera-right={layout.room.width}
        shadow-camera-top={layout.room.length}
        shadow-camera-bottom={-layout.room.length}
        shadow-camera-far={layout.room.height * 8}
      />
      {/* A single directional light leaves everything on its far side in
          flat, unlit shadow. This is real bounce light in any real room —
          a cheap, shadowless fill from the opposite corner reads much
          closer to how the room actually looks than one hard sun. */}
      <directionalLight
        position={[-layout.room.width, layout.room.height * 1.2, -layout.room.length]}
        intensity={lightsOn ? 0.45 : 0.03}
        color={lightColor}
      />
      {/* Windows don't just define the key light's direction, they're also
          bright surfaces in their own right — without this, the wall a
          window sits in reads as the darkest thing in the room. */}
      {lightsOn &&
        objects
          .filter((o) => o.category === "window")
          .map((w) => (
            <pointLight
              key={`window-${w.id}`}
              // Pulled slightly inside the wall so the light is in the room
              // rather than embedded in the wall geometry.
              position={[w.position[0] * 0.85, w.position[1], w.position[2] * 0.85]}
              color={lightColor}
              intensity={0.7}
              distance={Math.max(layout.room.width, layout.room.length)}
              decay={2}
            />
          ))}
      {/* Clicking past every object clears the selection. It sits behind the
          furniture and only ever fires when nothing else swallowed the event. */}
      <mesh
        position={[0, -0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={() => onSelect(null)}
      >
        <planeGeometry args={[layout.room.width * 4, layout.room.length * 4]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      <Floor room={layout.room} walls={layout.walls} cameras={cameras} occluders={occluders} />
      {layout.walls?.length ? (
        <MeasuredWalls
          walls={layout.walls}
          wallColor={layout.room.wallColor ?? "#d8d4cd"}
          ceilingColor={layout.room.ceilingColor ?? "#e8e6e2"}
          height={layout.room.height}
          width={layout.room.width}
          length={layout.room.length}
          cameras={cameras}
          occluders={occluders}
        />
      ) : (
        <Walls room={layout.room} cameras={cameras} occluders={occluders} />
      )}
      <WallFeatures room={layout.room} />
      {/* A light strip has no body to drag — it follows an edge of the room or
          of a piece of furniture, so it is drawn from the room rather than
          placed in it, and it re-runs itself when that furniture moves. */}
      {objects
        .filter((o) => o.preset?.startsWith("led:"))
        .map((o) => (
          <LedStrips
            key={o.id}
            segments={segmentsFor(o.preset!.slice(4) as LedPresetId, layout.room, objects)}
            color={o.color ?? "#8b5cf6"}
            selected={selectedId === o.id}
            onSelect={() => onSelect(o.id)}
          />
        ))}
      {/* What each projector is actually throwing, at true size on the wall it
          faces. Rotate the projector and the image walks around the room. */}
      {objects.map((o) => {
        const cat = o.binding.source === "catalog" ? CATALOG_BY_ID.get(o.binding.catalogItemId) : null;
        if (!cat || accessoryKind(cat.styleTags) !== "projector") return null;
        const proj = projectionFor(o, layout.room);
        return proj ? <ProjectionScreen key={`proj-${o.id}`} projection={proj} /> : null;
      })}
      {objects
        .filter((o) => !o.preset?.startsWith("led:"))
        .map((obj) => (
        <DraggableObject
          key={obj.id}
          obj={obj}
          isDragging={draggingId === obj.id}
          isSelected={selectedId === obj.id}
          onDragStart={handleDragStart}
          cameras={cameras}
          occluders={occluders}
        />
      ))}
      <OrbitControls ref={controlsRef as never} enabled={!draggingId} makeDefault />
    </>
  );
}

// `position` is an object's center and `dimensions[1]` its full height, so
// anything resting on the floor should sit at y = height/2. Both capture
// paths get this wrong sometimes (Gemini guesses it, RoomPlan's floor
// estimate can drift), which renders furniture sunk through the floor. Lift
// anything whose base is below zero; leave anything legitimately higher
// (wall-mounted TVs, a lamp on a desk) exactly where it was reported.
function restOnFloor(layout: RoomLayout): RoomLayout {
  return {
    ...layout,
    objects: layout.objects.map((obj) => {
      const minCenterY = obj.dimensions[1] / 2;
      if (obj.position[1] >= minCenterY) return obj;
      return {
        ...obj,
        position: [obj.position[0], minCenterY, obj.position[2]] as [number, number, number],
      };
    }),
  };
}

export default function RoomScene({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [layout, setLayout] = useState<RoomLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  // If the GPU does drop the context (memory pressure on an older phone,
  // say), three.js doesn't rebuild lost textures/geometry on its own —
  // remounting the whole Canvas on restore is the reliable way back to a
  // working scene instead of a half-recovered black one.
  const [canvasKey, setCanvasKey] = useState(0);
  const [cameras, setCameras] = useState<PreparedCamera[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [lightsOn, setLightsOn] = useState(true);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [roomPanelOpen, setRoomPanelOpen] = useState(false);
  const controlsRef = useRef<{ dollyIn?: (s: number) => void; dollyOut?: (s: number) => void; update?: () => void } | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/layout?session=${sessionId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load layout");
        if (!cancelled) {
          const fixed = restOnFloor(data);
          // The room as it was scanned, kept so Reset can return to it.
          originalLayout.current = fixed;
          setLayout(fixed);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load layout");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Downloads and decodes every captured photo once per session, not once
  // per drag — `layout.cameraFrames` keeps the same array reference across
  // handlePositionsSettled's updates (it only ever spreads `objects` in),
  // so this doesn't refire on every drag save.
  useEffect(() => {
    let cancelled = false;
    const frames = layout?.cameraFrames;
    // Both branches resolve through a promise so setCameras is only ever
    // called from a callback, never synchronously in the effect body.
    (frames?.length ? prepareCameras(frames) : Promise.resolve([])).then((prepared) => {
      if (!cancelled) setCameras(prepared);
    });
    return () => {
      cancelled = true;
    };
  }, [layout?.cameraFrames]);

  // Drag writes a new layout on every pointermove; a ref keeps the callbacks
  // stable so that firehose doesn't tear down and rebuild the drag listeners.
  const layoutRef = useRef<RoomLayout | null>(null);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  /**
   * Every committed change, so it can be taken back.
   *
   * Only committed states are recorded — a drag pushes one entry when the
   * pointer comes up, not one per frame, or a single slide across the room
   * would bury every earlier step under three hundred identical ones.
   */
  const history = useRef<{ past: RoomLayout[]; future: RoomLayout[] }>({ past: [], future: [] });
  // Mirrored into state because the buttons read these during render, and a
  // ref read at render time is not something React can depend on.
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 });
  const originalLayout = useRef<RoomLayout | null>(null);

  const persist = useCallback(
    async (next: RoomLayout, record = true) => {
      if (record) {
        const current = layoutRef.current;
        if (current) {
          history.current.past.push(current);
          // Far more than anyone reaches for, and bounded so a long session
          // cannot grow the stack without limit.
          if (history.current.past.length > 60) history.current.past.shift();
          // A new action after undoing abandons the redo branch, which is what
          // every editor does and what people expect.
          history.current.future = [];
        }
      }
      setHistoryCounts({
        past: history.current.past.length,
        future: history.current.future.length,
      });
      setLayout(next);
      layoutRef.current = next;
      setSaving(true);
      try {
        await fetch("/api/layout", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session: sessionId, layout: next }),
        });
      } finally {
        setSaving(false);
      }
    },
    [sessionId]
  );

  const undo = useCallback(() => {
    const current = layoutRef.current;
    const previous = history.current.past.pop();
    if (!current || !previous) return;
    history.current.future.push(current);
    setSelectedId(null);
    void persist(previous, false);
  }, [persist]);

  const redo = useCallback(() => {
    const current = layoutRef.current;
    const next = history.current.future.pop();
    if (!current || !next) return;
    history.current.past.push(current);
    setSelectedId(null);
    void persist(next, false);
  }, [persist]);

  const resetRoom = useCallback(() => {
    const original = originalLayout.current;
    if (!original) return;
    setSelectedId(null);
    // Recorded, so Reset is itself undoable — it throws away every purchase
    // decision in the room and should not be a one-way door.
    void persist(original, true);
  }, [persist]);

  // Mid-drag. Deliberately does NOT save: a PUT per pointermove would be
  // hundreds of writes per drag.
  const handleObjectsChange = useCallback((objects: RoomLayout["objects"]) => {
    setLayout((prev) => (prev ? { ...prev, objects } : prev));
  }, []);

  const handlePositionsSettled = useCallback(
    (objects: RoomLayout["objects"]) => {
      const current = layoutRef.current;
      if (current) void persist({ ...current, objects });
    },
    [persist]
  );

  const mutateObjects = useCallback(
    (fn: (objects: RoomLayout["objects"]) => RoomLayout["objects"]) => {
      const current = layoutRef.current;
      if (current) void persist({ ...current, objects: fn(current.objects) });
    },
    [persist]
  );

  const handlePick = useCallback(
    (item: CatalogItem) => {
      const current = layoutRef.current;
      if (!current) return;
      const binding: ItemBinding = toBinding(item);
      const dimensions = toDimensions(item);

      if (selectedId) {
        // Swap: the new product inherits the old object's footprint position
        // and facing, so replacing a desk doesn't fling it across the room.
        mutateObjects((objects) =>
          objects.map((o) =>
            o.id === selectedId
              ? {
                  ...o,
                  category: item.category,
                  dimensions,
                  position: [o.position[0], dimensions[1] / 2, o.position[2]] as [number, number, number],
                  color: item.dominantHex,
                  binding,
                }
              : o
          )
        );
      } else {
        mutateObjects((objects) => {
          const placed = {
            id: crypto.randomUUID(),
            category: item.category,
            position: [0, dimensions[1] / 2, 0] as [number, number, number],
            rotationY: 0,
            dimensions,
            confidence: 1, // placed by a person, not guessed by a model
            color: item.dominantHex,
            binding,
          };
          // Ask the placement rules where it belongs: clear floor for furniture,
          // the nearest wall for a poster, a real surface for a desk lamp.
          placed.position = initialPlacement(placed, current.room, objects, current.walls);
          if (item.mount === "wall") {
            placed.rotationY = snapToWall(
              placed,
              placed.position[0],
              placed.position[1],
              placed.position[2],
              current.room,
              current.walls
            ).rotationY;
          }
          return [...objects, placed];
        });
      }
    },
    [mutateObjects, selectedId]
  );

  const addPoster = useCallback(
    (art: PosterArt, size: PosterSize) => {
      const current = layoutRef.current;
      if (!current) return;
      mutateObjects((objects) => {
        const placed = {
          id: crypto.randomUUID(),
          category: "other" as const,
          position: [0, 1.5, 0] as [number, number, number],
          rotationY: 0,
          dimensions: [size.width, size.height, FRAME_DEPTH] as [number, number, number],
          confidence: 1,
          color: "#1d1f24",
          // A poster is not a product with a price and a buy link, so it takes a
          // custom binding with no price rather than a made-up one that would
          // land in the feed's budget totals.
          binding: {
            source: "custom" as const,
            label: posterLabel(art, size),
            priceCents: null,
            url: null,
          },
          preset: `poster:${art}:${size.id}`,
        };
        placed.position = initialPlacement(placed, current.room, objects, current.walls);
        placed.rotationY = snapToWall(
          placed,
          placed.position[0],
          placed.position[1],
          placed.position[2],
          current.room,
          current.walls
        ).rotationY;
        return [...objects, placed];
      });
    },
    [mutateObjects]
  );

  const addLed = useCallback(
    (preset: LedPreset) => {
      const current = layoutRef.current;
      if (!current) return;
      mutateObjects((objects) => {
        // One run per preset — installing "ceiling perimeter" twice is not a
        // thing, and two identical runs just double the light.
        const existing = objects.filter((o) => o.preset !== `led:${preset.id}`);
        // How much strip this run actually needs decides which roll you buy,
        // and therefore what it costs.
        const metres = runLength(segmentsFor(preset.id, current.room, objects));
        const roll = rollFor(metres);
        return [
          ...existing,
          {
            id: crypto.randomUUID(),
            category: "other" as const,
            // A strip has no body: its geometry comes from the room each frame,
            // so these are placeholders that nothing reads.
            position: [0, 0, 0] as [number, number, number],
            rotationY: 0,
            dimensions: [0.01, 0.01, 0.01] as [number, number, number],
            confidence: 1,
            color: "#8b5cf6",
            binding: {
              source: "custom" as const,
              label: `${roll.name} · ${preset.label} (${metres.toFixed(1)}m run)`,
              priceCents: roll.priceCents,
              url: roll.productUrl,
            },
            preset: `led:${preset.id}`,
          },
        ];
      });
    },
    [mutateObjects]
  );

  const ledPresets = useMemo(
    () => availablePresets(layout?.objects ?? []),
    [layout?.objects]
  );

  const rotateSelected = useCallback(
    (radians: number) => {
      if (!selectedId) return;
      mutateObjects((objects) =>
        objects.map((o) => (o.id === selectedId ? { ...o, rotationY: o.rotationY + radians } : o))
      );
    },
    [mutateObjects, selectedId]
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    mutateObjects((objects) => objects.filter((o) => o.id !== selectedId));
    setSelectedId(null);
  }, [mutateObjects, selectedId]);

  // Two numbers, because they answer different questions: "what would this
  // room cost me" (only things being bought) and "what is standing in here"
  // (everything with a known price, including furniture already owned).
  const totals = useMemo(() => {
    let newSpend = 0;
    let roomTotal = 0;
    for (const obj of layout?.objects ?? []) {
      const price = obj.binding.source === "owned" ? null : obj.binding.priceCents;
      if (price == null) continue;
      roomTotal += price;
      newSpend += price;
    }
    return { newSpend, roomTotal };
  }, [layout]);

  const selected = useMemo(
    () => layout?.objects.find((o) => o.id === selectedId) ?? null,
    [layout, selectedId]
  );

  const selectedPrice = useMemo(
    () => (selected ? objectPriceCents(selected) : null),
    [selected]
  );

  // OrbitControls owns the camera distance, so zooming goes through it rather
  // than moving the camera behind its back and having it snap on next update.
  const zoom = useCallback((inward: boolean) => {
    const c = controlsRef.current;
    if (!c) return;
    // dollyIn/dollyOut read backwards here: OrbitControls names them after
    // what happens to the spherical radius, not to the apparent size of the
    // room, so "+" has to call dollyOut.
    if (inward) c.dollyOut?.(1.18);
    else c.dollyIn?.(1.18);
    c.update?.();
  }, []);

  const handleRoomChange = useCallback(
    (next: RoomLayout["room"]) => {
      const current = layoutRef.current;
      if (current) void persist({ ...current, room: next });
    },
    [persist]
  );

  const handleSnapshot = useCallback(() => {
    const renderer = glRef.current;
    if (!renderer) return;
    setSnapshotting(true);
    // R3F renders every frame and the Canvas is created with
    // preserveDrawingBuffer, so the buffer already holds the current view.
    // Without that flag this returns a blank PNG and reports no error at all.
    setSnapshotUrl(renderer.domElement.toDataURL("image/png"));
    setSnapshotting(false);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Never steal a keystroke from someone typing a price or a room size.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Escape") {
        setSelectedId(null);
        setCatalogOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const shoppingLines = useMemo(
    () => buildShoppingList(layout?.objects ?? []),
    [layout?.objects]
  );

  // A corrected price is written onto every object on that line, so the room's
  // running total, the list, and anything published later all agree.
  const handlePriceChange = useCallback(
    (line: LineItem, cents: number) => {
      const ids = new Set(line.objectIds);
      mutateObjects((objects) =>
        objects.map((o) => {
          if (!ids.has(o.id)) return o;
          if (o.binding.source === "catalog") {
            return { ...o, binding: { ...o.binding, priceCents: cents } };
          }
          if (o.binding.source === "custom") {
            return { ...o, binding: { ...o.binding, priceCents: cents } };
          }
          return o;
        })
      );
    },
    [mutateObjects]
  );

  const initialCameraPosition = useMemo(() => {
    if (!layout) return [8, 8, 8] as const;
    const maxDim = Math.max(layout.room.width, layout.room.length, layout.room.height);
    const d = maxDim * 1.2;
    return [d, d * 0.8, d] as const;
  }, [layout]);

  // The feed's cards need to look like one consistent product, not forty
  // different camera angles someone happened to leave the editor at. Snap
  // back to the same angle every room opens with before capturing, so this
  // matches `initialCameraPosition` regardless of how the room was last
  // left — then hand off to /share whether or not the capture succeeded,
  // since a failed upload should never block publishing (falls back to the
  // 2D plan, same as before this existed).
  const captureRenderForShare = useCallback(async () => {
    const renderer = glRef.current;
    const controls = controlsRef.current as unknown as {
      object?: THREE.PerspectiveCamera;
      target?: THREE.Vector3;
      update?: () => void;
    } | null;

    if (!renderer || !controls?.object || !controls.target) return;

    controls.object.position.set(...initialCameraPosition);
    controls.target.set(0, 0, 0);
    controls.update?.();

    // Two rAFs: one for R3F to pick up the moved camera, one for the frame
    // that camera produced to actually land in the (preserved) draw buffer.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );

    const dataUrl = renderer.domElement.toDataURL("image/png");

    try {
      await fetch(`/api/rooms/${encodeURIComponent(sessionId)}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
    } catch {
      // Best-effort — see comment above.
    }
  }, [initialCameraPosition, sessionId]);

  const handleShareClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      if (sharing) return;
      setSharing(true);
      await captureRenderForShare();
      router.push(`/share?session=${sessionId}`);
    },
    [captureRenderForShare, router, sessionId, sharing]
  );

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <p className="text-red-500 max-w-sm">{error}</p>
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading room…</p>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen">
      {/* Both readouts share one column so the selection panel stacks under
          the room rather than covering it. */}
      <div className="absolute top-3 left-3 z-10 flex w-[230px] flex-col gap-2">
      {/* A real link to the room index rather than history.back(): the editor
          is reached from the feed and from shared URLs as often as from
          /rooms, and a history step would dead-end anyone who opened it
          directly. */}
      <Link
        href="/rooms"
        className="flex w-fit items-center gap-1.5 rounded-full border border-black/5 bg-white/95 px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-lg backdrop-blur hover:bg-white dark:border-white/10 dark:bg-neutral-900/95 dark:text-neutral-200 dark:hover:bg-neutral-900"
      >
        <IconBack className="h-4 w-4" />
        Rooms
      </Link>
      <div className="rounded-xl border border-black/5 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:border-white/10 dark:bg-neutral-900/95">
        <div className="font-mono text-sm font-semibold tracking-tight tabular-nums text-neutral-900 dark:text-neutral-100">
          {layout.room.width.toFixed(1)} × {layout.room.length.toFixed(1)} × {layout.room.height.toFixed(1)} m
        </div>
        <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
          {layout.objects.length} objects — tap to select, drag to move
        </div>
        {totals.newSpend > 0 && (
          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-black/10 pt-2 dark:border-white/10">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">New spend</span>
            <span className="font-mono text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatPrice(totals.newSpend)}
            </span>
          </div>
        )}
        {saving && <div className="mt-1 text-[11px] text-neutral-400">Saving…</div>}
        {/* Room shape lives with the room readout, not inside the furniture
            catalog — it is a property of the scan, not something you add. */}
        <button
          onClick={() => setRoomPanelOpen((v) => !v)}
          aria-expanded={roomPanelOpen}
          className="mt-3 w-full rounded-lg border border-black/10 px-2 py-1.5 text-[11px] font-medium text-neutral-600 hover:bg-black/5 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          {roomPanelOpen ? "Close room settings" : "Room settings"}
        </button>
      </div>

      {/* What you have selected: what it is, how big it is, what it cost.
          Dimensions come off the object itself, so this reads the same for a
          catalog product and for a piece of furniture the scan found. */}
      {selected && (
        <div className="rounded-xl border border-black/5 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:border-white/10 dark:bg-neutral-900/95">
          <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
            Selected · {selected.category}
          </div>
          <div className="mt-1 text-sm font-semibold leading-snug text-neutral-900 dark:text-neutral-100">
            {objectDisplayName(selected)}
          </div>

          <div className="mt-2 font-mono text-[12px] tabular-nums text-neutral-600 dark:text-neutral-300">
            {selected.dimensions[0].toFixed(2)} × {selected.dimensions[1].toFixed(2)} ×{" "}
            {selected.dimensions[2].toFixed(2)} m
          </div>
          {/* Spelled out because [w, h, d] puts height in the middle, which is
              the single most common thing to read wrong about this schema. */}
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-neutral-400">
            width × height × depth
          </div>

          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-black/10 pt-2 dark:border-white/10">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
              Price
            </span>
            {selectedPrice !== null ? (
              <span className="font-mono text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatPrice(selectedPrice)}
              </span>
            ) : (
              // Never "$0" — one of these was never bought and the other has
              // not been priced, and free is a claim neither of them makes.
              <span className="text-right text-[11px] leading-snug text-neutral-400">
                {selected.binding.source === "owned" ? "Already in the room" : "No price set"}
              </span>
            )}
          </div>
        </div>
      )}
      </div>
      <Canvas
        key={canvasKey}
        shadows
        camera={{ position: initialCameraPosition as unknown as [number, number, number], fov: 55 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
          // Required for snapshots. WebGL is free to discard the drawing
          // buffer after compositing, and then toBlob/toDataURL return a
          // blank image *with no error* — the failure mode is a working
          // button that silently produces nothing.
          preserveDrawingBuffer: true,
        }}
        onCreated={({ gl }) => {
          glRef.current = gl;
          const canvas = gl.domElement;
          canvas.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            console.warn("WebGL context lost — waiting for restore");
          });
          canvas.addEventListener("webglcontextrestored", () => {
            setCanvasKey((k) => k + 1);
          });
        }}
      >
        <Scene
          layout={layout}
          objects={layout.objects}
          cameras={cameras}
          selectedId={selectedId}
          lightsOn={lightsOn}
          snapEnabled={snapEnabled}
          controlsRef={controlsRef}
          onSelect={setSelectedId}
          onObjectsChange={handleObjectsChange}
          onPositionsSettled={handlePositionsSettled}
        />
      </Canvas>

      {/* Bottom action bar. Rotate and delete act on the selection, so they
          stay disabled until there is one rather than disappearing — a
          control that vanishes is harder to find the second time. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex items-center justify-center gap-3 pl-4 pr-4">
        {/* One row, always. When the viewport is too narrow for every control
            the bar scrolls sideways rather than wrapping into a second row that
            covers the room. */}
        <div className="pointer-events-auto flex max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto rounded-full bg-white/95 p-2 shadow-lg backdrop-blur [scrollbar-width:none] dark:bg-neutral-900/95">
          <button
            onClick={undo}
            disabled={historyCounts.past === 0}
            title="Undo (Ctrl+Z)"
            className="rounded-full px-4 py-2.5 text-sm hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-white/10"
          >
            Undo
          </button>
          <button
            onClick={redo}
            disabled={historyCounts.future === 0}
            title="Redo (Ctrl+Shift+Z)"
            className="rounded-full px-4 py-2.5 text-sm hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-white/10"
          >
            Redo
          </button>
          <span className="mx-1 h-7 w-px bg-black/10 dark:bg-white/10" />
          <button
            onClick={() => rotateSelected(-Math.PI / 8)}
            disabled={!selected}
            title="Rotate left 22.5°"
            className="rounded-full px-4 py-2.5 text-sm disabled:opacity-30 enabled:hover:bg-black/5 dark:enabled:hover:bg-white/10"
          >
            ⟲
          </button>
          <button
            onClick={() => rotateSelected(Math.PI / 8)}
            disabled={!selected}
            title="Rotate right 22.5°"
            className="rounded-full px-4 py-2.5 text-sm disabled:opacity-30 enabled:hover:bg-black/5 dark:enabled:hover:bg-white/10"
          >
            ⟳
          </button>
          <button
            onClick={deleteSelected}
            disabled={!selected}
            title="Remove from room"
            className="rounded-full px-4 py-2.5 text-sm text-red-600 disabled:opacity-30 enabled:hover:bg-red-50 dark:enabled:hover:bg-red-950/40"
          >
            Delete
          </button>
          <span className="mx-1 h-7 w-px bg-black/10 dark:bg-white/10" />
          <button
            onClick={() => setSnapEnabled((v) => !v)}
            aria-pressed={snapEnabled}
            title="Snap furniture flush to walls when dragged near them"
            className={
              snapEnabled
                ? "rounded-full bg-blue-600 px-4 py-2.5 text-sm text-white"
                : "rounded-full px-4 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            }
          >
            Edge snap
          </button>
          <button
            onClick={() => setLightsOn((v) => !v)}
            aria-pressed={!lightsOn}
            title="Turn the room lights off to see lamps, LED runs and the projector"
            className="rounded-full px-4 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            {lightsOn ? "Lights off" : "Lights on"}
          </button>
          <button onClick={() => zoom(true)} title="Zoom in" className="rounded-full px-4 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/10">+</button>
          <button onClick={() => zoom(false)} title="Zoom out" className="rounded-full px-4 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/10">−</button>
          <span className="mx-1 h-7 w-px bg-black/10 dark:bg-white/10" />
          <button
            onClick={handleSnapshot}
            disabled={snapshotting}
            title="Save a picture and costed shopping list"
            className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
          >
            <IconCamera className="h-4 w-4" />
            {snapshotting ? "Saving…" : "Snapshot"}
          </button>
          <button
            onClick={resetRoom}
            title="Put the room back as it was scanned"
            className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            <IconReset className="h-4 w-4" />
            Reset
          </button>
        </div>

        {/* Separated from the rest deliberately — sharing leaves this room
            and goes public, which is a different kind of action from
            everything else in the bar. The social workstream's entire
            integration ask was one link to /share?session=. */}
        <a
          href={`/share?session=${sessionId}`}
          onClick={handleShareClick}
          title="Share this design to Plans"
          aria-disabled={sharing}
          className="pointer-events-auto flex flex-shrink-0 items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-lg hover:bg-blue-700 aria-disabled:opacity-70"
        >
          <IconSend className="h-4 w-4" />
          {sharing ? "Preparing…" : "Share"}</a>
      </div>

      {/* A finished design is two things: a picture to share, and the list of
          what it would cost to actually build. */}
      {snapshotUrl && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/60 p-4">
          <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
              <h2 className="text-sm font-semibold">Your room, and what it costs</h2>
              <button
                onClick={() => setSnapshotUrl(null)}
                aria-label="Close"
                className="rounded px-2 py-1 text-lg leading-none text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- a canvas data URL, not a remote asset */}
              <img
                src={snapshotUrl}
                alt="Snapshot of the arranged room"
                className="mb-4 w-full max-w-full rounded-lg border border-black/10 dark:border-white/10"
              />
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Shopping list
              </h3>
              <p className="mb-2 text-xs text-neutral-500">
                Prices came from the retailer when this was built. Click one to correct it.
              </p>
              <ShoppingList lines={shoppingLines} onPriceChange={handlePriceChange} />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/10 px-4 py-3 dark:border-white/10">
              <a
                href={snapshotUrl}
                download={`room-${sessionId}.png`}
                className="rounded-full px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                Download image
              </a>
              <a
                href={`/share?session=${sessionId}`}
                onClick={handleShareClick}
                aria-disabled={sharing}
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 aria-disabled:opacity-70"
              >
                {sharing ? "Preparing…" : "Share this design"}
              </a>
            </div>
          </div>
        </div>
      )}

      {roomPanelOpen && (
        <RoomPanel
          room={layout.room}
          onRoomChange={handleRoomChange}
          onClose={() => setRoomPanelOpen(false)}
        />
      )}

      <CatalogPanel
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onOpen={() => setCatalogOpen(true)}
        swapTargetLabel={selected ? selected.category : null}
        onPick={handlePick}

        onAddPoster={addPoster}

        onAddLed={addLed}

        ledPresets={ledPresets}
      />
    </div>
  );
}
