"use client";

import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, ThreeEvent, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Environment } from "@react-three/drei";
import * as THREE from "three";
import { FIXED_CATEGORIES, type RoomLayout } from "@/lib/roomLayoutSchema";
import FurnitureMesh from "./FurnitureMesh";
import { getTexture, getContactShadowTexture, type TextureKind } from "./textures";
import { prepareCameras, bakePlaneTexture, rotateY, type PreparedCamera } from "./projectiveTexture";

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

/// Walks the wall segments into a single closed outline so the floor can be
/// cut to the room's true shape instead of overhanging as a rectangle.
///
/// Greedy nearest-endpoint chaining rather than anything cleverer: scanned
/// walls are a loop in practice but rarely a *tidy* one — they overshoot at
/// corners, and RoomPlan gives no ordering or adjacency. Walking to whichever
/// unused endpoint is nearest reconstructs a sane perimeter for rectangles and
/// L-shapes alike, and degrades to "slightly wrong polygon" rather than
/// throwing when a scan is messy.
function wallOutline(walls: NonNullable<RoomLayout["walls"]>): THREE.Vector2[] | null {
  if (walls.length < 3) return null;

  // Each wall's footprint is the line its width traces along the floor.
  const segments = walls.map((w) => {
    const half = w.dimensions[0] / 2;
    const dir = rotateY(new THREE.Vector3(1, 0, 0), w.rotationY);
    const cx = w.position[0];
    const cz = w.position[2];
    return {
      a: new THREE.Vector2(cx - dir.x * half, cz - dir.z * half),
      b: new THREE.Vector2(cx + dir.x * half, cz + dir.z * half),
    };
  });

  const used = new Array(segments.length).fill(false);
  used[0] = true;
  const points = [segments[0].a, segments[0].b];

  for (let step = 1; step < segments.length; step++) {
    const tail = points[points.length - 1];
    let bestIndex = -1;
    let bestDistance = Infinity;
    let bestFar: THREE.Vector2 | null = null;

    for (let i = 0; i < segments.length; i++) {
      if (used[i]) continue;
      const { a, b } = segments[i];
      const da = tail.distanceTo(a);
      const db = tail.distanceTo(b);
      const near = Math.min(da, db);
      if (near < bestDistance) {
        bestDistance = near;
        bestIndex = i;
        bestFar = da <= db ? b : a;
      }
    }

    if (bestIndex < 0 || !bestFar) break;
    used[bestIndex] = true;
    points.push(bestFar);
  }

  return points.length >= 3 ? points : null;
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
}: {
  room: RoomLayout["room"];
  walls: RoomLayout["walls"];
  cameras: PreparedCamera[];
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

  // Shape space maps to the floor as (a, b) -> world (a, 0, -b), which is what
  // the -90° X rotation below does. ShapeGeometry's own UVs are raw model
  // coordinates, not 0..1, so they're recomputed here to match exactly what
  // planeGeometry would have produced — otherwise the baked floor photo
  // (which assumes the bounding rectangle's 0..1 span) lands scaled and
  // offset.
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

  const material = (
    <meshStandardMaterial
      color={floorPhoto ? "#ffffff" : floorColor}
      map={floorPhoto ?? floorMap}
      side={THREE.DoubleSide}
      roughness={floorPhoto ? 0.75 : floorRoughness}
    />
  );

  if (shaped) {
    return (
      <mesh geometry={shaped} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        {material}
      </mesh>
    );
  }

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[width, length]} />
      {material}
    </mesh>
  );
}

/// Renders each individually measured wall where it actually stands, instead
/// of forcing the room into a width×length box. Each wall gets its own photo
/// bake, with the surface normal flipped to face the room's interior — that's
/// the side the cameras were on, so it's the only side worth projecting.
function MeasuredWalls({
  walls,
  wallColor,
  cameras,
}: {
  walls: NonNullable<RoomLayout["walls"]>;
  wallColor: string;
  cameras: PreparedCamera[];
}) {
  const wallMap = useMemo(() => getTexture("plaster", 6), []);

  const baked = useMemo(
    () =>
      walls.map((w) => {
        const [width, height] = w.dimensions;
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
          photo: bakePlaneTexture(
            {
              center,
              xAxis: rotateY(new THREE.Vector3(width, 0, 0), w.rotationY),
              yAxis: new THREE.Vector3(0, height, 0),
              normal,
              fallbackColor: wallColor,
              resolution: 192,
            },
            cameras
          ),
        };
      }),
    [walls, wallColor, cameras]
  );

  return (
    <group>
      {walls.map((w, i) => {
        const { photo, flipped } = baked[i];
        return (
          <mesh
            key={i}
            position={w.position}
            // Turned so the front face points into the room, which is what
            // makes backface culling work below.
            rotation={[0, w.rotationY + (flipped ? Math.PI : 0), 0]}
            receiveShadow
          >
            <planeGeometry args={[w.dimensions[0], w.dimensions[1]]} />
            {/* Fully opaque, and solved by culling rather than transparency:
                each wall only renders its inward face, so orbiting outside
                the room sees straight through the near walls to the interior
                while standing inside still shows solid, properly-coloured
                walls. The old 0.4-opacity ghost walls were a workaround for
                not having oriented normals. */}
            <meshStandardMaterial
              color={photo ? "#ffffff" : wallColor}
              map={photo ?? wallMap}
              side={THREE.FrontSide}
              roughness={photo ? 0.85 : 0.95}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Walls({ room, cameras }: { room: RoomLayout["room"]; cameras: PreparedCamera[] }) {
  const { width, length, height } = room;
  const wallColor = room.wallColor ?? "#d8d4cd";
  const wallMap = useMemo(() => getTexture("plaster", 6), []);
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
  onSelect,
  cameras,
}: {
  obj: RoomLayout["objects"][number];
  isDragging: boolean;
  isSelected: boolean;
  onDragStart: (id: string, y: number) => void;
  onSelect: (id: string) => void;
  cameras: PreparedCamera[];
}) {
  const [w, h, d] = obj.dimensions;
  // The object's own sampled color when we have one — that's what makes a
  // render recognizable as someone's actual room. Category palette is just
  // the fallback for older layouts and the LiDAR path.
  const color = obj.color ?? CATEGORY_COLORS[obj.category] ?? CATEGORY_COLORS.other;

  // Only things actually resting on the floor get a contact shadow. A wall
  // TV or a mirror would otherwise drop a blob on the floor beneath it,
  // which reads as a bug rather than as grounding.
  const shadowTexture = useMemo(() => getContactShadowTexture(), []);
  const baseHeight = obj.position[1] - h / 2;
  const showContactShadow = shadowTexture !== null && baseHeight < 0.3 && obj.category !== "rug";
  const isFixed = FIXED_CATEGORIES.includes(obj.category);

  return (
    <group
      position={obj.position}
      rotation={[0, obj.rotationY, 0]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        // Doors, windows, stairs and fireplaces are part of the building, not
        // the furniture. They're still selectable (so you can see what they
        // are) but never draggable — a door adrift in the middle of the floor
        // is nonsense, and moving one destroys the only record of where the
        // real opening was measured.
        onSelect(obj.id);
        if (isFixed) return;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        onDragStart(obj.id, obj.position[1]);
      }}
    >
      <FurnitureMesh
        category={obj.category}
        dimensions={obj.dimensions}
        color={color}
        opacity={isDragging ? 0.6 : 1}
        cameras={cameras}
        objectPosition={obj.position}
        objectRotationY={obj.rotationY}
      />
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
            opacity={isDragging ? 0.4 : 0.75}
          />
        </mesh>
      )}
      {/* Selection outline: a wireframe box on the object's own bounds, so
          it's obvious which item the rotate controls will act on. */}
      {isSelected && (
        <mesh>
          <boxGeometry args={[w * 1.04, h * 1.04, d * 1.04]} />
          <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.9} />
        </mesh>
      )}
      <Html position={[0, h / 2 + 0.15, 0]} center distanceFactor={8} style={{ pointerEvents: "none" }}>
        <div
          style={{
            background: isSelected ? "rgba(2,132,199,0.92)" : "rgba(0,0,0,0.75)",
            color: "white",
            padding: "2px 6px",
            borderRadius: 4,
            fontSize: 11,
            whiteSpace: "nowrap",
          }}
        >
          {obj.category}
          {isFixed && " · fixed"}
        </div>
      </Html>
    </group>
  );
}

function Scene({
  layout,
  cameras,
  selectedId,
  onSelect,
  rotateNonce,
  onPositionsSettled,
}: {
  layout: RoomLayout;
  cameras: PreparedCamera[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /// Bumped by the HUD's rotate buttons, carrying the signed step to apply.
  /// A counter rather than an angle so repeated taps of the same direction
  /// each register instead of collapsing into one unchanged value.
  rotateNonce: { count: number; delta: number };
  onPositionsSettled: (objects: RoomLayout["objects"]) => void;
}) {
  const [objects, setObjects] = useState(layout.objects);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragPlaneY = useRef(0);
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const intersection = useRef(new THREE.Vector3());
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

    const windows = layout.objects.filter((o) => o.category === "window");
    const brightest = windows
      .slice()
      .sort((a, b) => b.dimensions[0] * b.dimensions[1] - a.dimensions[0] * a.dimensions[1])[0];

    if (!brightest) {
      return {
        position: [width, height * 3, length] as [number, number, number],
        intensity: 1.7,
        fromWindow: false,
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
      position: [
        outward.x * reach,
        brightest.position[1] + height * 0.45,
        outward.z * reach,
      ] as [number, number, number],
      intensity: 2.1,
      fromWindow: true,
    };
  }, [layout.room, layout.objects]);

  useEffect(() => setObjects(layout.objects), [layout]);

  // Applies a rotation step to whatever's selected and persists it the same
  // way a finished drag does. Keyed off the nonce's count so that holding the
  // same direction still fires on every press.
  const lastRotate = useRef(0);
  useEffect(() => {
    if (rotateNonce.count === lastRotate.current) return;
    lastRotate.current = rotateNonce.count;
    if (!selectedId) return;

    setObjects((prev) => {
      const next = prev.map((o) =>
        o.id === selectedId ? { ...o, rotationY: o.rotationY + rotateNonce.delta } : o
      );
      onPositionsSettled(next);
      return next;
    });
  }, [rotateNonce, selectedId, onPositionsSettled]);

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
      {/* Key light — positioned from the room's real largest window when the
          scan found one (see keyLight above), not a fixed corner. Its target
          defaults to the origin, which is the room's center, so it always
          rakes inward across the floor. */}
      <directionalLight
        position={keyLight.position}
        intensity={keyLight.intensity}
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
      {/* Windows don't just define the key light's direction, they're also
          bright surfaces in their own right — without this, the wall a window
          sits in reads as the darkest thing in the room, which is backwards. */}
      {objects
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
      {/* Clicking past everything clears the selection. */}
      <mesh
        visible={false}
        position={[0, -0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={() => onSelect(null)}
      >
        <planeGeometry args={[layout.room.width * 4, layout.room.length * 4]} />
      </mesh>
      <Floor room={layout.room} walls={layout.walls} cameras={cameras} />
      {layout.walls?.length ? (
        <MeasuredWalls
          walls={layout.walls}
          wallColor={layout.room.wallColor ?? "#d8d4cd"}
          cameras={cameras}
        />
      ) : (
        <Walls room={layout.room} cameras={cameras} />
      )}
      {objects.map((obj) => (
        <DraggableObject
          key={obj.id}
          obj={obj}
          isDragging={draggingId === obj.id}
          isSelected={selectedId === obj.id}
          onDragStart={handleDragStart}
          onSelect={onSelect}
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
  const [rotateNonce, setRotateNonce] = useState({ count: 0, delta: 0 });

  // 15° steps: fine enough to square something up against a wall, coarse
  // enough that a few taps do something visible.
  const ROTATION_STEP = Math.PI / 12;
  const rotate = useCallback((direction: 1 | -1) => {
    setRotateNonce((prev) => ({ count: prev.count + 1, delta: direction * ROTATION_STEP }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard alternative to the on-screen buttons. Ignored while typing, in
  // case an input ever lands on this page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selectedId) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (e.key === "q" || e.key === "Q" || e.key === "ArrowLeft") {
        e.preventDefault();
        rotate(-1);
      } else if (e.key === "e" || e.key === "E" || e.key === "ArrowRight") {
        e.preventDefault();
        rotate(1);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, rotate]);

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

  const selected = useMemo(
    () => layout?.objects.find((o) => o.id === selectedId) ?? null,
    [layout, selectedId]
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
          {layout.objects.length} objects — click to select, drag to move
        </div>
        {selected ? (
          <div className="mt-2 border-t pt-2">
            <div className="font-medium capitalize">{selected.category}</div>
            <div className="flex items-center gap-1 mt-1">
              <button
                onClick={() => rotate(-1)}
                className="px-2 py-1 rounded border text-sm leading-none hover:bg-gray-100"
                title="Rotate left (Q or ←)"
              >
                ⟲
              </button>
              <button
                onClick={() => rotate(1)}
                className="px-2 py-1 rounded border text-sm leading-none hover:bg-gray-100"
                title="Rotate right (E or →)"
              >
                ⟳
              </button>
              <span className="text-gray-400 ml-1">15° · Q/E</span>
            </div>
            {FIXED_CATEGORIES.includes(selected.category) && (
              <div className="text-gray-400 mt-1">fixed in place — can’t be moved</div>
            )}
          </div>
        ) : (
          <div className="text-gray-400 mt-1">nothing selected</div>
        )}
        {saving && <div className="text-gray-400">Saving…</div>}
      </div>
      <Canvas
        key={canvasKey}
        shadows
        camera={{ position: initialCameraPosition as unknown as [number, number, number], fov: 55 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        onCreated={({ gl }) => {
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
          cameras={cameras}
          selectedId={selectedId}
          onSelect={setSelectedId}
          rotateNonce={rotateNonce}
          onPositionsSettled={handlePositionsSettled}
        />
      </Canvas>
    </div>
  );
}
