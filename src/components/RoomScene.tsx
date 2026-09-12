"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, ThreeEvent, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type { RoomLayout } from "@/lib/roomLayoutSchema";
import FurnitureMesh from "./FurnitureMesh";

const CATEGORY_COLORS: Record<string, string> = {
  bed: "#c77dff",
  desk: "#4cc9f0",
  chair: "#f9c74f",
  sofa: "#f3722c",
  table: "#90be6d",
  shelf: "#577590",
  dresser: "#f94144",
  tv: "#212529",
  lamp: "#ffd60a",
  rug: "#a5a58d",
  door: "#6d4c41",
  window: "#8ecae6",
  other: "#adb5bd",
};

function Walls({ width, length, height }: { width: number; length: number; height: number }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial color="#f1f1f1" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, height / 2, -length / 2]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#dcdcdc" side={THREE.DoubleSide} transparent opacity={0.35} />
      </mesh>
      <mesh position={[0, height / 2, length / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#dcdcdc" side={THREE.DoubleSide} transparent opacity={0.35} />
      </mesh>
      <mesh position={[width / 2, height / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[length, height]} />
        <meshStandardMaterial color="#dcdcdc" side={THREE.DoubleSide} transparent opacity={0.35} />
      </mesh>
      <mesh position={[-width / 2, height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[length, height]} />
        <meshStandardMaterial color="#dcdcdc" side={THREE.DoubleSide} transparent opacity={0.35} />
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
  const color = CATEGORY_COLORS[obj.category] ?? CATEGORY_COLORS.other;

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
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
      <Walls width={layout.room.width} length={layout.room.length} height={layout.room.height} />
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
        if (!cancelled) setLayout(data);
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
      <Canvas camera={{ position: initialCameraPosition as unknown as [number, number, number], fov: 55 }}>
        <Scene layout={layout} onPositionsSettled={handlePositionsSettled} />
      </Canvas>
    </div>
  );
}
