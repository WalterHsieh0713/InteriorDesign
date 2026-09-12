import { createContext, useContext, useMemo } from "react";
import * as THREE from "three";
import { CATEGORY_TEXTURE, getTexture } from "./textures";

type Props = {
  category: string;
  dimensions: [number, number, number];
  color: string;
  opacity: number;
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

function FurnitureGeometry({ category, dimensions, color, opacity }: Props) {
  const [w, h, d] = dimensions;
  const dark = shade(color, -18);

  switch (category) {
    case "chair": {
      const seatH = h * 0.45;
      const seatThick = Math.max(h * 0.08, 0.03);
      const legH = seatH - seatThick / 2;
      return (
        <group>
          <Legs w={w * 0.85} d={d * 0.85} legHeight={legH} bottomY={-h / 2} color={dark} opacity={opacity} />
          <Panel size={[w * 0.85, seatThick, d * 0.85]} offset={[0, -h / 2 + legH + seatThick / 2, 0]} color={color} opacity={opacity} />
          <Panel size={[w * 0.85, h * 0.5, d * 0.08]} offset={[0, h / 2 - h * 0.25, -d / 2 + d * 0.04]} color={color} opacity={opacity} />
        </group>
      );
    }

    case "sofa": {
      return (
        <group>
          <Panel size={[w, h * 0.5, d]} offset={[0, -h / 2 + h * 0.25, 0]} color={color} opacity={opacity} />
          <Panel size={[w, h * 0.5, d * 0.15]} offset={[0, h / 2 - h * 0.25, -d / 2 + d * 0.075]} color={color} opacity={opacity} />
          <Panel size={[w * 0.15, h * 0.8, d]} offset={[-w / 2 + w * 0.075, -h / 2 + h * 0.4, 0]} color={dark} opacity={opacity} />
          <Panel size={[w * 0.15, h * 0.8, d]} offset={[w / 2 - w * 0.075, -h / 2 + h * 0.4, 0]} color={dark} opacity={opacity} />
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
        </group>
      );
    }

    case "bed": {
      return (
        <group>
          <Panel size={[w, h * 0.5, d]} offset={[0, -h / 2 + h * 0.25, 0]} color={color} opacity={opacity} />
          <Panel size={[w, h, d * 0.08]} offset={[0, 0, -d / 2 + d * 0.04]} color={dark} opacity={opacity} />
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

    case "dresser": {
      return (
        <group>
          <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} />
          {[0.2, 0.5, 0.8].map((f, i) => (
            <group key={i}>
              <Panel size={[w * 0.9, h * 0.25, d * 0.06]} offset={[0, -h / 2 + h * f, d / 2 - d * 0.03]} color={dark} opacity={opacity} />
              <Panel size={[w * 0.15, h * 0.03, d * 0.04]} offset={[0, -h / 2 + h * f, d / 2 + d * 0.01]} color="#2b2b2b" opacity={opacity} metalness={0.6} roughness={0.3} />
            </group>
          ))}
        </group>
      );
    }

    case "tv": {
      return (
        <group>
          <Panel size={[w, h * 0.85, d]} offset={[0, h * 0.075, 0]} color="#111111" opacity={opacity} roughness={0.2} metalness={0.4} />
          <Panel size={[w * 0.3, h * 0.15, d]} offset={[0, -h / 2 + h * 0.075, 0]} color={dark} opacity={opacity} />
        </group>
      );
    }

    case "lamp": {
      const baseR = Math.min(w, d) * 0.45;
      const poleR = Math.min(w, d) * 0.08;
      const baseH = h * 0.05;
      const poleH = h * 0.7;
      const shadeH = h * 0.25;
      return (
        <group>
          <mesh position={[0, -h / 2 + baseH / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[baseR, baseR, baseH, 16]} />
            <meshStandardMaterial color={dark} opacity={opacity} transparent={opacity < 1} />
          </mesh>
          <mesh position={[0, -h / 2 + baseH + poleH / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[poleR, poleR, poleH, 12]} />
            <meshStandardMaterial color={dark} opacity={opacity} transparent={opacity < 1} />
          </mesh>
          <mesh position={[0, h / 2 - shadeH / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[baseR * 0.55, baseR, shadeH, 16, 1, true]} />
            <meshStandardMaterial color={color} opacity={opacity * 0.9} transparent side={THREE.DoubleSide} />
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
      return <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} roughness={1} />;

    default:
      return <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} />;
  }
}
