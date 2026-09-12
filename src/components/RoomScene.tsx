"use client";

import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Environment } from "@react-three/drei";
import * as THREE from "three";
import type { ItemBinding, RoomLayout } from "@/lib/roomLayoutSchema";
import { CATALOG_BY_ID, formatPrice } from "@/lib/catalog";
import { modelUrlFor, toBinding, toDimensions, type CatalogItem } from "@/lib/catalogItem";
import { clampToRoom, initialPlacement, mountOf, snapFloorNearWall, snapToWall, supportHeightAt } from "@/lib/placement";
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
import { getTexture, type TextureKind } from "./textures";
import { prepareCameras, bakePlaneTexture, type PreparedCamera } from "./projectiveTexture";

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
  axis: "x" | "z";
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
function nearestWallPoint(ray: THREE.Ray, room: RoomLayout["room"]): THREE.Vector3 | null {
  const hw = room.width / 2;
  const hl = room.length / 2;
  const planes: { plane: THREE.Plane; within: (p: THREE.Vector3) => boolean }[] = [
    { plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), hl), within: (p) => Math.abs(p.x) <= hw + 0.2 },
    { plane: new THREE.Plane(new THREE.Vector3(0, 0, -1), hl), within: (p) => Math.abs(p.x) <= hw + 0.2 },
    { plane: new THREE.Plane(new THREE.Vector3(1, 0, 0), hw), within: (p) => Math.abs(p.z) <= hl + 0.2 },
    { plane: new THREE.Plane(new THREE.Vector3(-1, 0, 0), hw), within: (p) => Math.abs(p.z) <= hl + 0.2 },
  ];

  let best: THREE.Vector3 | null = null;
  let bestDist = Infinity;
  const hit = new THREE.Vector3();
  for (const { plane, within } of planes) {
    if (!ray.intersectPlane(plane, hit)) continue;
    if (hit.y < -0.3 || hit.y > room.height + 0.3) continue;
    if (!within(hit)) continue;
    const d = ray.origin.distanceTo(hit);
    if (d < bestDist) {
      bestDist = d;
      best = hit.clone();
    }
  }
  return best;
}

function Walls({ room, cameras }: { room: RoomLayout["room"]; cameras: PreparedCamera[] }) {
  const { width, length, height } = room;
  const wallColor = room.wallColor ?? "#d8d4cd";
  const floorColor = room.floorColor ?? "#9c968d";
  const material = room.floorMaterial ?? "other";
  const floorRoughness = FLOOR_ROUGHNESS[material] ?? 0.8;

  // A floor tiles far more than a chair seat does — scale the repeat to the
  // room so the grain stays a believable size instead of stretching.
  const floorMap = useMemo(
    () => getTexture(FLOOR_TEXTURE[material] ?? "carpet", Math.max(4, Math.round(Math.max(width, length) / 1.5))),
    [material, width, length]
  );
  const wallMap = useMemo(() => getTexture("plaster", 6), []);

  // Real captured photos projected onto each surface when the LiDAR path
  // recorded camera poses (see projectiveTexture.ts). `cameras` is empty for
  // every other session, in which case each of these is just null and the
  // procedural map/flat color below renders exactly as it did before.
  const floorPhoto = useMemo(
    () =>
      bakePlaneTexture(
        {
          center: new THREE.Vector3(0, 0, 0),
          xAxis: new THREE.Vector3(width, 0, 0),
          yAxis: new THREE.Vector3(0, 0, -length),
          normal: new THREE.Vector3(0, 1, 0),
          fallbackColor: floorColor,
          resolution: 192,
        },
        cameras
      ),
    [cameras, width, length, floorColor]
  );
  const backWallPhoto = useMemo(
    () =>
      bakePlaneTexture(
        {
          center: new THREE.Vector3(0, height / 2, -length / 2),
          xAxis: new THREE.Vector3(width, 0, 0),
          yAxis: new THREE.Vector3(0, height, 0),
          normal: new THREE.Vector3(0, 0, 1),
          fallbackColor: wallColor,
          resolution: 192,
        },
        cameras
      ),
    [cameras, width, height, length, wallColor]
  );
  const frontWallPhoto = useMemo(
    () =>
      bakePlaneTexture(
        {
          center: new THREE.Vector3(0, height / 2, length / 2),
          xAxis: new THREE.Vector3(-width, 0, 0),
          yAxis: new THREE.Vector3(0, height, 0),
          normal: new THREE.Vector3(0, 0, -1),
          fallbackColor: wallColor,
          resolution: 192,
        },
        cameras
      ),
    [cameras, width, height, length, wallColor]
  );
  const rightWallPhoto = useMemo(
    () =>
      bakePlaneTexture(
        {
          center: new THREE.Vector3(width / 2, height / 2, 0),
          xAxis: new THREE.Vector3(0, 0, length),
          yAxis: new THREE.Vector3(0, height, 0),
          normal: new THREE.Vector3(-1, 0, 0),
          fallbackColor: wallColor,
          resolution: 192,
        },
        cameras
      ),
    [cameras, width, height, length, wallColor]
  );
  const leftWallPhoto = useMemo(
    () =>
      bakePlaneTexture(
        {
          center: new THREE.Vector3(-width / 2, height / 2, 0),
          xAxis: new THREE.Vector3(0, 0, -length),
          yAxis: new THREE.Vector3(0, height, 0),
          normal: new THREE.Vector3(1, 0, 0),
          fallbackColor: wallColor,
          resolution: 192,
        },
        cameras
      ),
    [cameras, width, height, length, wallColor]
  );

  // A flat guessed wall color stays translucent so you can still see inside
  // while orbiting from outside — but a wall showing real captured pixels is
  // worth looking at directly, so it goes near-opaque instead.
  const wallOpacity = cameras.length > 0 ? 0.95 : 0.88;

  function wallMaterial(photo: THREE.CanvasTexture | null) {
    return (
      <meshStandardMaterial
        color={photo ? "#ffffff" : wallColor}
        map={photo ?? wallMap}
        side={THREE.DoubleSide}
        transparent
        opacity={wallOpacity}
        roughness={photo ? 0.85 : 0.95}
      />
    );
  }

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial
          color={floorPhoto ? "#ffffff" : floorColor}
          map={floorPhoto ?? floorMap}
          side={THREE.DoubleSide}
          roughness={floorPhoto ? 0.75 : floorRoughness}
        />
      </mesh>
      <WallPanel axis="z" sign={-1} limit={length / 2} position={[0, height / 2, -length / 2]}>
        <planeGeometry args={[width, height]} />
        {wallMaterial(backWallPhoto)}
      </WallPanel>
      <WallPanel axis="z" sign={1} limit={length / 2} position={[0, height / 2, length / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[width, height]} />
        {wallMaterial(frontWallPhoto)}
      </WallPanel>
      <WallPanel axis="x" sign={1} limit={width / 2} position={[width / 2, height / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[length, height]} />
        {wallMaterial(rightWallPhoto)}
      </WallPanel>
      <WallPanel axis="x" sign={-1} limit={width / 2} position={[-width / 2, height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[length, height]} />
        {wallMaterial(leftWallPhoto)}
      </WallPanel>
    </group>
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
}: {
  obj: RoomLayout["objects"][number];
  isDragging: boolean;
  isSelected: boolean;
  onDragStart: (id: string, y: number, e: ThreeEvent<PointerEvent>) => void;
  cameras: PreparedCamera[];
}) {
  const [, h] = obj.dimensions;
  // A catalog-bound object renders as the real product's mesh; everything else
  // keeps the procedural shape, which is still the right answer for the user's
  // own scanned furniture and for any product with no model paired to it.
  const item = obj.binding.source === "catalog" ? CATALOG_BY_ID.get(obj.binding.catalogItemId) : undefined;
  const productModelUrl = item ? modelUrlFor(item) : null;
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

  return (
    <group
      position={obj.position}
      rotation={[0, obj.rotationY, 0]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        (e.target as Element).setPointerCapture?.(e.pointerId);
        onDragStart(obj.id, obj.position[1], e);
      }}
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
      ) : productModelUrl && item ? (
        <Suspense
          fallback={
            <FurnitureMesh
              category={obj.category}
              dimensions={obj.dimensions}
              color={item.dominantHex}
              opacity={0.35}
              cameras={[]}
              objectPosition={obj.position}
              objectRotationY={obj.rotationY}
            />
          }
        >
          <ProductMesh
            modelUrl={productModelUrl}
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
          {obj.category}
        </div>
      </Html>
    </group>
  );
}

function Scene({
  layout,
  objects,
  cameras,
  selectedId,
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
        const snap = snapToWall(obj, obj.position[0], obj.position[1], obj.position[2], layout.room);
        const n =
          snap.side === "north"
            ? new THREE.Vector3(0, 0, 1)
            : snap.side === "south"
              ? new THREE.Vector3(0, 0, -1)
              : snap.side === "west"
                ? new THREE.Vector3(1, 0, 0)
                : new THREE.Vector3(-1, 0, 0);
        dragPlane.current.setFromNormalAndCoplanarPoint(
          n,
          new THREE.Vector3(snap.position[0], snap.position[1], snap.position[2])
        );
      } else {
        dragPlane.current.set(new THREE.Vector3(0, 1, 0), -y);
      }
    },
    [layout.room]
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
        const onWall = nearestWallPoint(raycaster.ray, layout.room);
        if (!onWall) return;
        next = snapToWall(dragged, onWall.x, onWall.y, onWall.z, layout.room).position;
        const facing = snapToWall(dragged, onWall.x, onWall.y, onWall.z, layout.room).rotationY;
        onObjectsChange(
          latest.current.map((o) =>
            o.id === draggingId ? { ...o, position: next, rotationY: facing } : o
          )
        );
        return;
      } else if (mount === "tabletop") {
        // Rest on whatever is underneath: a desk lamp rises onto a tall
        // nightstand and drops onto a lower desk without anyone typing a height.
        const [cx, cz] = clampToRoom(dragged, x, z, layout.room);
        const support = supportHeightAt(dragged, cx, cz, latest.current);
        next = [cx, support + dragged.dimensions[1] / 2, cz];
      } else {
        // Furniture in a real dorm lives against a wall, and getting something
        // exactly flush by hand in a 3D view is fiddly. Snapping is a toggle
        // because sometimes you do want a rug floating in the middle.
        const snapped = snapEnabled ? snapFloorNearWall(dragged, x, z, layout.room) : null;
        const [cx, cz] = clampToRoom(dragged, x, z, layout.room);
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
  }, [draggingId, camera, raycaster, gl, layout.room, onPositionsSettled, onObjectsChange, onSelect, snapEnabled]);

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
      <EnvironmentBoundary>
        <Suspense fallback={null}>
          <Environment preset="apartment" />
        </Suspense>
      </EnvironmentBoundary>
      {/* Tinted by the room's own estimated light color (warm bulb vs.
          daylight) instead of flat white — an incandescent-lit room and a
          daylit one shouldn't come out looking identically lit. */}
      <ambientLight intensity={0.25} color={lightColor} />
      <directionalLight
        position={[layout.room.width, layout.room.height * 3, layout.room.length]}
        intensity={1.7}
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
        intensity={0.45}
        color={lightColor}
      />
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
      <Walls room={layout.room} cameras={cameras} />
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
  const [layout, setLayout] = useState<RoomLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
    if (!frames?.length) {
      setCameras([]);
      return;
    }
    prepareCameras(frames).then((prepared) => {
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
          placed.position = initialPlacement(placed, current.room, objects);
          if (item.mount === "wall") {
            placed.rotationY = snapToWall(
              placed,
              placed.position[0],
              placed.position[1],
              placed.position[2],
              current.room
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
        placed.position = initialPlacement(placed, current.room, objects);
        placed.rotationY = snapToWall(
          placed,
          placed.position[0],
          placed.position[1],
          placed.position[2],
          current.room
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
      <div className="absolute top-3 left-3 z-10 bg-white/90 rounded-lg px-3 py-2 text-xs shadow">
        <div className="font-medium">
          {layout.room.width.toFixed(1)}m × {layout.room.length.toFixed(1)}m × {layout.room.height.toFixed(1)}m
        </div>
        <div className="text-gray-500">
          {layout.objects.length} objects — tap to select, drag to move
        </div>
        {totals.newSpend > 0 && (
          <div className="mt-1 border-t border-black/10 pt-1 font-medium text-gray-700">
            New spend: {formatPrice(totals.newSpend)}
          </div>
        )}
        {saving && <div className="text-gray-400">Saving…</div>}
        {/* Room shape lives with the room readout, not inside the furniture
            catalog — it is a property of the scan, not something you add. */}
        <button
          onClick={() => setRoomPanelOpen((v) => !v)}
          aria-expanded={roomPanelOpen}
          className="mt-2 w-full rounded border border-black/10 px-2 py-1 text-[11px] text-neutral-600 hover:bg-black/5 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          {roomPanelOpen ? "Close room settings" : "Room settings"}
        </button>
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
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
        {/* One row, always. When the viewport is too narrow for every control
            the bar scrolls sideways rather than wrapping into a second row that
            covers the room. */}
        <div className="pointer-events-auto flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full bg-white/95 p-1.5 shadow-lg backdrop-blur [scrollbar-width:none] dark:bg-neutral-900/95">
          <button
            onClick={() => setCatalogOpen((v) => !v)}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {selected ? "Swap…" : "Add furniture"}
          </button>
          <span className="mx-1 h-6 w-px bg-black/10 dark:bg-white/10" />
          <button
            onClick={undo}
            disabled={historyCounts.past === 0}
            title="Undo (Ctrl+Z)"
            className="rounded-full px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-white/10"
          >
            Undo
          </button>
          <button
            onClick={redo}
            disabled={historyCounts.future === 0}
            title="Redo (Ctrl+Shift+Z)"
            className="rounded-full px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-white/10"
          >
            Redo
          </button>
          <span className="mx-1 h-6 w-px bg-black/10 dark:bg-white/10" />
          <button
            onClick={() => rotateSelected(-Math.PI / 8)}
            disabled={!selected}
            title="Rotate left 22.5°"
            className="rounded-full px-3 py-2 text-sm disabled:opacity-30 enabled:hover:bg-black/5 dark:enabled:hover:bg-white/10"
          >
            ⟲
          </button>
          <button
            onClick={() => rotateSelected(Math.PI / 8)}
            disabled={!selected}
            title="Rotate right 22.5°"
            className="rounded-full px-3 py-2 text-sm disabled:opacity-30 enabled:hover:bg-black/5 dark:enabled:hover:bg-white/10"
          >
            ⟳
          </button>
          <button
            onClick={deleteSelected}
            disabled={!selected}
            title="Remove from room"
            className="rounded-full px-3 py-2 text-sm text-red-600 disabled:opacity-30 enabled:hover:bg-red-50 dark:enabled:hover:bg-red-950/40"
          >
            Delete
          </button>
          <span className="mx-1 h-6 w-px bg-black/10 dark:bg-white/10" />
          <button
            onClick={() => setSnapEnabled((v) => !v)}
            aria-pressed={snapEnabled}
            title="Snap furniture flush to walls when dragged near them"
            className={
              snapEnabled
                ? "rounded-full bg-blue-600 px-3 py-2 text-sm text-white"
                : "rounded-full px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            }
          >
            Snap
          </button>
          <button onClick={() => zoom(true)} title="Zoom in" className="rounded-full px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10">+</button>
          <button onClick={() => zoom(false)} title="Zoom out" className="rounded-full px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10">−</button>
          <span className="mx-1 h-6 w-px bg-black/10 dark:bg-white/10" />
          <button
            onClick={handleSnapshot}
            disabled={snapshotting}
            className="rounded-full px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
          >
            {snapshotting ? "Saving…" : "Snapshot"}
          </button>
          {/* The social workstream's entire integration ask: one link. */}
          <button
            onClick={resetRoom}
            title="Put the room back as it was scanned"
            className="rounded-full px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            Reset
          </button>
          <a
            href="/rooms"
            className="rounded-full px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            Rooms
          </a>
          <a
            href={`/share?session=${sessionId}`}
            className="rounded-full px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            Share
          </a>
        </div>
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
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Share this design
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
        swapTargetLabel={selected ? selected.category : null}
        onPick={handlePick}

        onAddPoster={addPoster}

        onAddLed={addLed}

        ledPresets={ledPresets}
      />
    </div>
  );
}
