"use client";

import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, ThreeEvent, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Environment } from "@react-three/drei";
import * as THREE from "three";
import type { ItemBinding, RoomLayout } from "@/lib/roomLayoutSchema";
import { CATALOG_BY_ID, formatPrice } from "@/lib/catalog";
import { modelUrlFor, toBinding, toDimensions, type CatalogItem } from "@/lib/catalogItem";
import FurnitureMesh from "./FurnitureMesh";
import ProductMesh from "./ProductMesh";
import CatalogPanel from "./CatalogPanel";
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
  const wallOpacity = cameras.length > 0 ? 0.92 : 0.4;

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
      <mesh position={[0, height / 2, -length / 2]} receiveShadow>
        <planeGeometry args={[width, height]} />
        {wallMaterial(backWallPhoto)}
      </mesh>
      <mesh position={[0, height / 2, length / 2]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[width, height]} />
        {wallMaterial(frontWallPhoto)}
      </mesh>
      <mesh position={[width / 2, height / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[length, height]} />
        {wallMaterial(rightWallPhoto)}
      </mesh>
      <mesh position={[-width / 2, height / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[length, height]} />
        {wallMaterial(leftWallPhoto)}
      </mesh>
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
      {productModelUrl && item ? (
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
  onSelect,
  onObjectsChange,
  onPositionsSettled,
}: {
  layout: RoomLayout;
  objects: RoomLayout["objects"];
  cameras: PreparedCamera[];
  selectedId: string | null;
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

  const handleDragStart = useCallback((id: string, y: number, e: ThreeEvent<PointerEvent>) => {
    setDraggingId(id);
    gesture.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, moved: false };
    dragPlaneY.current = y;
    dragPlane.current.set(new THREE.Vector3(0, 1, 0), -y);
  }, []);

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
      if (raycaster.ray.intersectPlane(dragPlane.current, intersection.current)) {
        const { x, z } = intersection.current;
        onObjectsChange(
          latest.current.map((o) =>
            o.id === draggingId ? { ...o, position: [x, dragPlaneY.current, z] as [number, number, number] } : o
          )
        );
      }
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
  }, [draggingId, camera, raycaster, gl, onPositionsSettled, onObjectsChange, onSelect]);

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
      {objects.map((obj) => (
        <DraggableObject
          key={obj.id}
          obj={obj}
          isDragging={draggingId === obj.id}
          isSelected={selectedId === obj.id}
          onDragStart={handleDragStart}
          cameras={cameras}
        />
      ))}
      <OrbitControls enabled={!draggingId} makeDefault />
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
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/layout?session=${sessionId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load layout");
        if (!cancelled) setLayout(restOnFloor(data));
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

  const persist = useCallback(
    async (next: RoomLayout) => {
      setLayout(next);
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

  // Where a newly-added product lands. Dropping everything at the floor in the
  // centre would bury a wall mirror in the carpet and sink a desk lamp, so the
  // mount decides the height; the person drags it where they actually want it.
  const placementFor = useCallback((item: CatalogItem, room: RoomLayout["room"]): [number, number, number] => {
    const [, height] = toDimensions(item);
    if (item.mount === "wall") return [0, Math.min(1.5, room.height - height / 2), -room.length / 2 + 0.1];
    if (item.mount === "tabletop") return [0, 0.75 + height / 2, 0];
    return [0, height / 2, 0];
  }, []);

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
        mutateObjects((objects) => [
          ...objects,
          {
            id: crypto.randomUUID(),
            category: item.category,
            position: placementFor(item, current.room),
            rotationY: 0,
            dimensions,
            confidence: 1, // placed by a person, not guessed by a model
            color: item.dominantHex,
            binding,
          },
        ]);
      }
    },
    [mutateObjects, placementFor, selectedId]
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

  const handleSnapshot = useCallback(() => {
    const renderer = glRef.current;
    if (!renderer) return;
    setSnapshotting(true);
    // The Canvas is created with preserveDrawingBuffer, without which this
    // hands back a blank PNG and reports no error at all.
    renderer.domElement.toBlob((blob) => {
      setSnapshotting(false);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `room-${sessionId}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [sessionId]);

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
          onSelect={setSelectedId}
          onObjectsChange={handleObjectsChange}
          onPositionsSettled={handlePositionsSettled}
        />
      </Canvas>

      {/* Bottom action bar. Rotate and delete act on the selection, so they
          stay disabled until there is one rather than disappearing — a
          control that vanishes is harder to find the second time. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-full bg-white/95 p-1.5 shadow-lg backdrop-blur dark:bg-neutral-900/95">
          <button
            onClick={() => setCatalogOpen((v) => !v)}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {selected ? "Swap…" : "Add furniture"}
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
            onClick={handleSnapshot}
            disabled={snapshotting}
            className="rounded-full px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
          >
            {snapshotting ? "Saving…" : "Snapshot"}
          </button>
          {/* The social workstream's entire integration ask: one link. */}
          <a
            href={`/share?session=${sessionId}`}
            className="rounded-full px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            Share
          </a>
        </div>
      </div>

      <CatalogPanel
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        swapTargetLabel={selected ? selected.category : null}
        onPick={handlePick}
      />
    </div>
  );
}
