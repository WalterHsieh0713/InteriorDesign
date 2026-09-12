import { createContext, useContext, useMemo } from "react";
import * as THREE from "three";
import { CATEGORY_TEXTURE, getTexture } from "./textures";
import { bakePlaneTexture, rotateY, type PreparedCamera } from "./projectiveTexture";

type Props = {
  category: string;
  dimensions: [number, number, number];
  color: string;
  opacity: number;
  cameras: PreparedCamera[];
  objectPosition: [number, number, number];
  objectRotationY: number;
};

// Every primitive inside one piece of furniture shares its detail map, so
// it's resolved once at the top and read back down rather than threaded
// through every Panel call.
const DetailMap = createContext<THREE.Texture | null>(null);

function shade(hex: string, percent: number) {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const clamp = (v: number) => Math.min(255, Math.max(0, v));
  const r = clamp((num >> 16) + amt);
  const g = clamp(((num >> 8) & 0xff) + amt);
  const b = clamp((num & 0xff) + amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function Panel({
  size,
  offset,
  color,
  opacity,
  roughness = 0.85,
  metalness = 0.05,
  transparent = false,
}: {
  size: [number, number, number];
  offset: [number, number, number];
  color: string;
  opacity: number;
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
}) {
  const map = useContext(DetailMap);
  return (
    <mesh position={offset} castShadow receiveShadow>
      <boxGeometry args={size.map((v) => Math.max(v, 0.01)) as [number, number, number]} />
      <meshStandardMaterial
        color={color}
        map={map}
        transparent={transparent || opacity < 1}
        opacity={opacity}
        roughness={roughness}
        metalness={metalness}
      />
    </mesh>
  );
}

// A thin plane laid directly over one hero face of a furniture piece (its
// tabletop, its seat, its front) carrying real projected photo pixels — see
// projectiveTexture.ts. This is deliberately NOT applied as the Panel's own
// `map`: a box's six faces all share one 0..1 UV space, so one texture on
// the box would smear the tabletop photo across its sides too. A dedicated
// overlay, positioned and rotated to sit flush on just that one face, is
// what keeps this to a single, correctly-oriented face.
//
// Only one hero face per object, not all six — RoomPlan/Gemini only ever
// give a bounding box, not a segmented mesh, so there's no clean way to
// wrap a chair's legs, seat, and back independently. The one face someone
// actually looks at (tabletop, seat, screen, front) is the tractable slice
// of this; everything else keeps its flat sampled color.
function ProjectedOverlay({
  facing,
  size,
  offset,
  fallbackColor,
  cameras,
  objectPosition,
  objectRotationY,
  opacity,
}: {
  facing: "up" | "front";
  size: [number, number];
  offset: [number, number, number];
  fallbackColor: string;
  cameras: PreparedCamera[];
  objectPosition: [number, number, number];
  objectRotationY: number;
  opacity: number;
}) {
  const photo = useMemo(() => {
    if (cameras.length === 0) return null;
    const [sizeA, sizeB] = size;
    // Local-object-space basis (before the object's own rotationY) — "up"
    // matches how the floor plane is derived in RoomScene.tsx, "front"
    // matches an unrotated wall. rotateY below carries both into world
    // space alongside the object's actual position/rotation.
    const localX = new THREE.Vector3(sizeA, 0, 0);
    const localY = facing === "up" ? new THREE.Vector3(0, 0, -sizeB) : new THREE.Vector3(0, sizeB, 0);
    const localNormal = facing === "up" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const localCenter = new THREE.Vector3(offset[0], offset[1], offset[2]);
    const worldOffset = new THREE.Vector3(objectPosition[0], objectPosition[1], objectPosition[2]);

    return bakePlaneTexture(
      {
        center: rotateY(localCenter, objectRotationY).add(worldOffset),
        xAxis: rotateY(localX, objectRotationY),
        yAxis: rotateY(localY, objectRotationY),
        normal: rotateY(localNormal, objectRotationY),
        fallbackColor,
        resolution: 96,
      },
      cameras
    );
  }, [facing, size, offset, fallbackColor, cameras, objectPosition, objectRotationY]);

  if (!photo) return null;

  const meshRotation: [number, number, number] = facing === "up" ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
  // Nudged just outside the solid panel along its own normal so the two
  // don't z-fight.
  const nudge: [number, number, number] =
    facing === "up" ? [offset[0], offset[1] + 0.004, offset[2]] : [offset[0], offset[1], offset[2] + 0.004];

  return (
    <mesh position={nudge} rotation={meshRotation}>
      <planeGeometry args={size} />
      <meshStandardMaterial
        map={photo}
        color="#ffffff"
        roughness={0.85}
        side={THREE.DoubleSide}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}

function Legs({
  w,
  d,
  legHeight,
  bottomY,
  color,
  opacity,
}: {
  w: number;
  d: number;
  legHeight: number;
  bottomY: number;
  color: string;
  opacity: number;
}) {
  const insetX = w * 0.42;
  const insetZ = d * 0.42;
  const thickness = Math.max(Math.min(w, d) * 0.07, 0.02);
  const positions: [number, number][] = [
    [-insetX, -insetZ],
    [-insetX, insetZ],
    [insetX, -insetZ],
    [insetX, insetZ],
  ];
  return (
    <>
      {positions.map(([x, z], i) => (
        <Panel
          key={i}
          size={[thickness, legHeight, thickness]}
          offset={[x, bottomY + legHeight / 2, z]}
          color={color}
          opacity={opacity}
        />
      ))}
    </>
  );
}

export default function FurnitureMesh(props: Props) {
  const map = useMemo(
    () => getTexture(CATEGORY_TEXTURE[props.category] ?? "plaster", 2),
    [props.category]
  );
  return (
    <DetailMap.Provider value={map}>
      <FurnitureGeometry {...props} />
    </DetailMap.Provider>
  );
}

function FurnitureGeometry({
  category,
  dimensions,
  color,
  opacity,
  cameras,
  objectPosition,
  objectRotationY,
}: Props) {
  const [w, h, d] = dimensions;
  const dark = shade(color, -18);
  const overlay = { cameras, objectPosition, objectRotationY, opacity };

  switch (category) {
    case "chair": {
      const seatH = h * 0.45;
      const seatThick = Math.max(h * 0.08, 0.03);
      const legH = seatH - seatThick / 2;
      const seatTopY = -h / 2 + legH + seatThick;
      return (
        <group>
          <Legs w={w * 0.85} d={d * 0.85} legHeight={legH} bottomY={-h / 2} color={dark} opacity={opacity} />
          <Panel size={[w * 0.85, seatThick, d * 0.85]} offset={[0, -h / 2 + legH + seatThick / 2, 0]} color={color} opacity={opacity} />
          <Panel size={[w * 0.85, h * 0.5, d * 0.08]} offset={[0, h / 2 - h * 0.25, -d / 2 + d * 0.04]} color={color} opacity={opacity} />
          <ProjectedOverlay facing="up" size={[w * 0.85, d * 0.85]} offset={[0, seatTopY, 0]} fallbackColor={color} {...overlay} />
        </group>
      );
    }

    case "sofa": {
      const bodyY = -h / 2 + h * 0.25;
      return (
        <group>
          <Panel size={[w, h * 0.5, d]} offset={[0, bodyY, 0]} color={color} opacity={opacity} />
          <Panel size={[w, h * 0.5, d * 0.15]} offset={[0, h / 2 - h * 0.25, -d / 2 + d * 0.075]} color={color} opacity={opacity} />
          <Panel size={[w * 0.15, h * 0.8, d]} offset={[-w / 2 + w * 0.075, -h / 2 + h * 0.4, 0]} color={dark} opacity={opacity} />
          <Panel size={[w * 0.15, h * 0.8, d]} offset={[w / 2 - w * 0.075, -h / 2 + h * 0.4, 0]} color={dark} opacity={opacity} />
          <ProjectedOverlay facing="front" size={[w, h * 0.5]} offset={[0, bodyY, d / 2]} fallbackColor={color} {...overlay} />
        </group>
      );
    }

    case "table":
    case "desk": {
      const topThick = Math.max(h * 0.06, 0.03);
      const legH = h - topThick;
      return (
        <group>
          <Legs w={w * 0.9} d={d * 0.9} legHeight={legH} bottomY={-h / 2} color={dark} opacity={opacity} />
          <Panel size={[w, topThick, d]} offset={[0, h / 2 - topThick / 2, 0]} color={color} opacity={opacity} />
          <ProjectedOverlay facing="up" size={[w, d]} offset={[0, h / 2, 0]} fallbackColor={color} {...overlay} />
        </group>
      );
    }

    case "bed": {
      return (
        <group>
          <Panel size={[w, h * 0.5, d]} offset={[0, -h / 2 + h * 0.25, 0]} color={color} opacity={opacity} />
          <Panel size={[w, h, d * 0.08]} offset={[0, 0, -d / 2 + d * 0.04]} color={dark} opacity={opacity} />
          <ProjectedOverlay facing="up" size={[w, d]} offset={[0, 0, 0]} fallbackColor={color} {...overlay} />
        </group>
      );
    }

    case "shelf": {
      const shelfThick = Math.max(h * 0.04, 0.02);
      const sidePanelThick = Math.max(w * 0.04, 0.02);
      return (
        <group>
          <Panel size={[w, h, d * 0.05]} offset={[0, 0, -d / 2 + d * 0.025]} color={dark} opacity={opacity} />
          <Panel size={[sidePanelThick, h, d]} offset={[-w / 2 + sidePanelThick / 2, 0, 0]} color={color} opacity={opacity} />
          <Panel size={[sidePanelThick, h, d]} offset={[w / 2 - sidePanelThick / 2, 0, 0]} color={color} opacity={opacity} />
          {[0.15, 0.5, 0.85].map((f, i) => (
            <Panel key={i} size={[w, shelfThick, d]} offset={[0, -h / 2 + h * f, 0]} color={color} opacity={opacity} />
          ))}
        </group>
      );
    }

    case "dresser":
    case "nightstand": {
      return (
        <group>
          <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} />
          {[0.2, 0.5, 0.8].map((f, i) => (
            <group key={i}>
              <Panel size={[w * 0.9, h * 0.25, d * 0.06]} offset={[0, -h / 2 + h * f, d / 2 - d * 0.03]} color={dark} opacity={opacity} />
              <Panel size={[w * 0.15, h * 0.03, d * 0.04]} offset={[0, -h / 2 + h * f, d / 2 + d * 0.01]} color="#2b2b2b" opacity={opacity} metalness={0.6} roughness={0.3} />
            </group>
          ))}
          <ProjectedOverlay facing="front" size={[w, h]} offset={[0, 0, d / 2]} fallbackColor={color} {...overlay} />
        </group>
      );
    }

    case "tv": {
      return (
        <group>
          <Panel size={[w, h * 0.85, d]} offset={[0, h * 0.075, 0]} color="#111111" opacity={opacity} roughness={0.2} metalness={0.4} />
          <Panel size={[w * 0.3, h * 0.15, d]} offset={[0, -h / 2 + h * 0.075, 0]} color={dark} opacity={opacity} />
          <ProjectedOverlay facing="front" size={[w, h * 0.85]} offset={[0, h * 0.075, d / 2]} fallbackColor="#111111" {...overlay} />
        </group>
      );
    }

    case "monitor": {
      const standW = Math.max(w * 0.2, 0.04);
      const standH = h * 0.35;
      return (
        <group>
          <Panel size={[standW, standH, standW]} offset={[0, -h / 2 + standH / 2, 0]} color={dark} opacity={opacity} metalness={0.4} roughness={0.4} />
          <Panel size={[w, h * 0.6, d]} offset={[0, -h / 2 + standH + h * 0.3, 0]} color="#111111" opacity={opacity} roughness={0.15} metalness={0.5} />
          <ProjectedOverlay
            facing="front"
            size={[w, h * 0.6]}
            offset={[0, -h / 2 + standH + h * 0.3, d / 2]}
            fallbackColor="#111111"
            {...overlay}
          />
        </group>
      );
    }

    case "stool": {
      const seatThick = Math.max(h * 0.12, 0.03);
      const legH = h - seatThick;
      const seatR = Math.min(w, d) * 0.5;
      return (
        <group>
          <Legs w={w * 0.7} d={d * 0.7} legHeight={legH} bottomY={-h / 2} color={dark} opacity={opacity} />
          <mesh position={[0, h / 2 - seatThick / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[seatR, seatR, seatThick, 20]} />
            <meshStandardMaterial color={color} opacity={opacity} transparent={opacity < 1} roughness={0.8} />
          </mesh>
        </group>
      );
    }

    case "ottoman": {
      return <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} roughness={0.9} />;
    }

    case "mirror": {
      return (
        <group>
          <Panel size={[w, h, Math.max(d, 0.03)]} offset={[0, 0, 0]} color={dark} opacity={opacity} />
          <Panel
            size={[w * 0.9, h * 0.9, Math.max(d * 0.3, 0.01)]}
            offset={[0, 0, d / 2]}
            color="#dfe7ea"
            opacity={opacity * 0.85}
            transparent
            roughness={0.05}
            metalness={0.9}
          />
        </group>
      );
    }

    case "plant": {
      const potH = h * 0.3;
      const potR = Math.min(w, d) * 0.4;
      return (
        <group>
          <mesh position={[0, -h / 2 + potH / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[potR * 0.8, potR, potH, 14]} />
            <meshStandardMaterial color="#8a6a4f" roughness={0.9} opacity={opacity} transparent={opacity < 1} />
          </mesh>
          <mesh position={[0, -h / 2 + potH + (h - potH) / 2, 0]} castShadow receiveShadow>
            <sphereGeometry args={[Math.min(w, d) * 0.5, 10, 8]} />
            <meshStandardMaterial color="#3f6b3f" roughness={1} opacity={opacity} transparent={opacity < 1} />
          </mesh>
        </group>
      );
    }

    case "door": {
      return (
        <group>
          <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} />
          <mesh position={[w * 0.35, 0, d / 2 + 0.02]} castShadow receiveShadow>
            <sphereGeometry args={[Math.min(w, h) * 0.04, 10, 10]} />
            <meshStandardMaterial color="#c9a227" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      );
    }

    case "window": {
      return (
        <group>
          <Panel size={[w, h, d]} offset={[0, 0, 0]} color={dark} opacity={opacity} />
          <Panel
            size={[w * 0.85, h * 0.85, d * 0.4]}
            offset={[0, 0, 0]}
            color="#a8dadc"
            opacity={opacity * 0.55}
            transparent
            roughness={0.1}
            metalness={0.1}
          />
        </group>
      );
    }

    case "rug":
      return (
        <group>
          <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} roughness={1} />
          <ProjectedOverlay facing="up" size={[w, d]} offset={[0, h / 2, 0]} fallbackColor={color} {...overlay} />
        </group>
      );

    default:
      return <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} />;
  }
}
