"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, ThreeEvent, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Environment, SoftShadows } from "@react-three/drei";
import * as THREE from "three";
import type { RoomLayout } from "@/lib/roomLayoutSchema";
import FurnitureMesh from "./FurnitureMesh";
import { getTexture, type TextureKind } from "./textures";

// Plausible real-furniture tones, used only when we have no sampled color
// for an object. The previous palette was a categorical data-viz set — lime
// tables, canary chairs — which is what made scans read as a debug render
// rather than a room.
const CATEGORY_COLORS: Record<string, string> = {
  bed: "#b9bec7",
  desk: "#a97a5a",
  chair: "#c8a06a",
  sofa: "#8b8f98",
  table: "#b08a5e",
  shelf: "#9c7b55",
  dresser: "#8f6b4a",
  tv: "#1b1d20",
  lamp: "#e8dcc4",
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

function Walls({ room }: { room: RoomLayout["room"] }) {
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

  // Walls stay translucent so you can see in from outside while orbiting,
  // and single-sided from inside so the near wall doesn't block the view.
  const wall = (
    <meshStandardMaterial
      color={wallColor}
      map={wallMap}
      side={THREE.DoubleSide}
      transparent
      opacity={0.4}
      roughness={0.95}
    />
  );

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial
          color={floorColor}
          map={floorMap}
          side={THREE.DoubleSide}
          roughness={floorRoughness}
        />
      </mesh>
      <mesh position={[0, height / 2, -length / 2]} receiveShadow>
        <planeGeometry args={[width, height]} />
        {wall}
      </mesh>
      <mesh position={[0, height / 2, length / 2]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[width, height]} />
        {wall}
      </mesh>
      <mesh position={[width / 2, height / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[length, height]} />
        {wall}
      </mesh>
      <mesh position={[-width / 2, height / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[length, height]} />
        {wall}
      </mesh>
    </group>
  );
}

function DraggableObject({
  obj,
  isDragging,
  onDragStart,
}: {
  obj: RoomLayout["objects"][number];
  isDragging: boolean;
  onDragStart: (id: string, y: number) => void;
}) {
  const [, h] = obj.dimensions;
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
        onDragStart(obj.id, obj.position[1]);
      }}
    >
      <FurnitureMesh category={obj.category} dimensions={obj.dimensions} color={color} opacity={isDragging ? 0.6 : 1} />
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
  onPositionsSettled,
}: {
  layout: RoomLayout;
  onPositionsSettled: (objects: RoomLayout["objects"]) => void;
}) {
  const [objects, setObjects] = useState(layout.objects);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragPlaneY = useRef(0);
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const intersection = useRef(new THREE.Vector3());
  const { camera, raycaster, gl } = useThree();

  useEffect(() => setObjects(layout.objects), [layout]);

  const handleDragStart = useCallback((id: string, y: number) => {
    setDraggingId(id);
    dragPlaneY.current = y;
    dragPlane.current.set(new THREE.Vector3(0, 1, 0), -y);
  }, []);

  useEffect(() => {
    if (!draggingId) return;

    const canvas = gl.domElement;
    const pointer = new THREE.Vector2();

    function handleMove(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(dragPlane.current, intersection.current)) {
        const { x, z } = intersection.current;
        setObjects((prev) =>
          prev.map((o) => (o.id === draggingId ? { ...o, position: [x, dragPlaneY.current, z] } : o))
        );
      }
    }

    function handleUp() {
      setDraggingId(null);
      setObjects((current) => {
        onPositionsSettled(current);
        return current;
      });
    }

    canvas.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      canvas.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [draggingId, camera, raycaster, gl, onPositionsSettled]);

  return (
    <>
      <SoftShadows size={28} samples={12} />
      {/* Image-based lighting does most of the work here — flat ambient
          light makes every material read as the same plastic. The preset
          HDR is fetched from a CDN, so keep it behind Suspense: a slow or
          failed fetch should cost us reflections, not the whole scene. */}
      <Suspense fallback={null}>
        <Environment preset="apartment" />
      </Suspense>
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[layout.room.width, layout.room.height * 3, layout.room.length]}
        intensity={1.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-layout.room.width}
        shadow-camera-right={layout.room.width}
        shadow-camera-top={layout.room.length}
        shadow-camera-bottom={-layout.room.length}
        shadow-camera-far={layout.room.height * 8}
      />
      <Walls room={layout.room} />
      {objects.map((obj) => (
        <DraggableObject
          key={obj.id}
          obj={obj}
          isDragging={draggingId === obj.id}
          onDragStart={handleDragStart}
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

  const handlePositionsSettled = useCallback(
    async (objects: RoomLayout["objects"]) => {
      if (!layout) return;
      const updated = { ...layout, objects };
      setLayout(updated);
      setSaving(true);
      try {
        await fetch("/api/layout", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session: sessionId, layout: updated }),
        });
      } finally {
        setSaving(false);
      }
    },
    [layout, sessionId]
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
          {layout.objects.length} objects — drag to rearrange
        </div>
        {saving && <div className="text-gray-400">Saving…</div>}
      </div>
      <Canvas
        shadows
        camera={{ position: initialCameraPosition as unknown as [number, number, number], fov: 55 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      >
        <Scene layout={layout} onPositionsSettled={handlePositionsSettled} />
      </Canvas>
    </div>
  );
}
