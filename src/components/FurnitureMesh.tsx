import { createContext, useContext, useMemo } from "react";
import * as THREE from "three";
import { CATEGORY_TEXTURE, getTexture } from "./textures";
import { bakePlaneTexture, rotateY, type PreparedCamera } from "./projectiveTexture";

type Props = {
  category: string;
  dimensions: [number, number, number];
  color: string;
  opacity: number;
  /** Captured camera frames for this session, empty on the Gemini-photo web
   * path (no per-photo camera pose) — see projectiveTexture.ts. */
  cameras: PreparedCamera[];
  objectPosition: [number, number, number];
  objectRotationY: number;
};

// Every primitive inside one piece of furniture shares its detail map, so
// it's resolved once at the top and read back down rather than threaded
// through every Panel call.
const DetailMap = createContext<THREE.Texture | null>(null);

// The one real photo baked onto this object's single most-visible face (see
// faceGeometryFor below), shared the same way as DetailMap. Null whenever
// there are no cameras, the category has no single flat face worth texturing
// (a lamp, a plant), or no camera actually saw this object.
const PhotoMap = createContext<THREE.CanvasTexture | null>(null);

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
  usePhoto = false,
}: {
  size: [number, number, number];
  offset: [number, number, number];
  color: string;
  opacity: number;
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  /** This is the panel that stands in for the object's single baked photo
   * face (see faceGeometryFor) — only one Panel per object should set this. */
  usePhoto?: boolean;
}) {
  const detailMap = useContext(DetailMap);
  const contextPhotoMap = useContext(PhotoMap);
  const photoMap = usePhoto ? contextPhotoMap : null;
  const map = photoMap ?? detailMap;
  return (
    <mesh position={offset} castShadow receiveShadow>
      <boxGeometry args={size.map((v) => Math.max(v, 0.01)) as [number, number, number]} />
      <meshStandardMaterial
        color={photoMap ? "#ffffff" : color}
        map={map}
        transparent={transparent || opacity < 1}
        opacity={opacity}
        roughness={photoMap ? 0.85 : roughness}
        metalness={photoMap ? 0.05 : metalness}
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

// Which single local face (if any) stands in for "the photo" of this
// category, in the object's own unrotated local space (+Z is the object's
// forward axis at rotationY = 0). Deliberately scoped down: real furniture
// isn't a flat plane, so this bakes one representative face rather than
// attempting a full per-face UV wrap (see projectiveTexture.ts's documented
// limitations). Categories with no single dominant flat face (lamp, stool,
// plant, rug, window, dresser/nightstand/ottoman's fully-boxy bodies) return
// null and just keep their flat/procedural color as before.
function faceGeometryFor(
  category: string,
  dimensions: [number, number, number]
): { offset: THREE.Vector3; normal: THREE.Vector3; faceW: number; faceH: number } | null {
  const [w, h, d] = dimensions;
  switch (category) {
    // Backrest-style categories: the flat panel already rendered at -Z.
    case "chair":
    case "sofa":
    case "bed":
    case "shelf":
      return { offset: new THREE.Vector3(0, 0, -d / 2), normal: new THREE.Vector3(0, 0, -1), faceW: w, faceH: h };
    // Screen/front-facing categories: the flat panel already rendered at +Z.
    case "tv":
    case "monitor":
    case "door":
      return { offset: new THREE.Vector3(0, 0, d / 2), normal: new THREE.Vector3(0, 0, 1), faceW: w, faceH: h };
    // Horizontal top surface.
    case "table":
    case "desk":
    case "stool":
      return { offset: new THREE.Vector3(0, h / 2, 0), normal: new THREE.Vector3(0, 1, 0), faceW: w, faceH: d };
    default:
      return null;
  }
}

function useFacePhotoTexture(props: Props): THREE.CanvasTexture | null {
  const { category, dimensions, color, cameras, objectPosition, objectRotationY } = props;
  const [ox, oy, oz] = objectPosition;
  const [w, h, d] = dimensions;
  return useMemo(() => {
    const face = faceGeometryFor(category, [w, h, d]);
    if (!face || cameras.length === 0) return null;

    const center = new THREE.Vector3(ox, oy, oz).add(rotateY(face.offset, objectRotationY));
    const xAxis = rotateY(new THREE.Vector3(face.faceW, 0, 0), objectRotationY);
    // Horizontal (top) faces span depth on their "vertical" axis instead of
    // height — same convention the floor plane uses in Walls().
    const yAxis =
      face.normal.y !== 0
        ? rotateY(new THREE.Vector3(0, 0, -face.faceH), objectRotationY)
        : new THREE.Vector3(0, face.faceH, 0);
    const normal = rotateY(face.normal, objectRotationY);

    return bakePlaneTexture({ center, xAxis, yAxis, normal, fallbackColor: color, resolution: 96 }, cameras);
  }, [category, w, h, d, color, cameras, ox, oy, oz, objectRotationY]);
}

export default function FurnitureMesh(props: Props) {
  const map = useMemo(
    () => getTexture(CATEGORY_TEXTURE[props.category] ?? "plaster", 2),
    [props.category]
  );
  const photo = useFacePhotoTexture(props);
  return (
    <DetailMap.Provider value={map}>
      <PhotoMap.Provider value={photo}>
        <FurnitureGeometry {...props} />
      </PhotoMap.Provider>
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
          <Panel size={[w * 0.85, h * 0.5, d * 0.08]} offset={[0, h / 2 - h * 0.25, -d / 2 + d * 0.04]} color={color} opacity={opacity} usePhoto />
        </group>
      );
    }

    case "stool": {
      const seatThick = Math.max(h * 0.12, 0.03);
      const legH = h - seatThick;
      return (
        <group>
          <Legs w={w * 0.8} d={d * 0.8} legHeight={legH} bottomY={-h / 2} color={dark} opacity={opacity} />
          <Panel size={[w * 0.85, seatThick, d * 0.85]} offset={[0, h / 2 - seatThick / 2, 0]} color={color} opacity={opacity} usePhoto />
        </group>
      );
    }

    case "sofa": {
      return (
        <group>
          <Panel size={[w, h * 0.5, d]} offset={[0, -h / 2 + h * 0.25, 0]} color={color} opacity={opacity} />
          <Panel size={[w, h * 0.5, d * 0.15]} offset={[0, h / 2 - h * 0.25, -d / 2 + d * 0.075]} color={color} opacity={opacity} usePhoto />
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
          <Panel size={[w, topThick, d]} offset={[0, h / 2 - topThick / 2, 0]} color={color} opacity={opacity} usePhoto />
        </group>
      );
    }

    case "bed": {
      return (
        <group>
          <Panel size={[w, h * 0.5, d]} offset={[0, -h / 2 + h * 0.25, 0]} color={color} opacity={opacity} />
          <Panel size={[w, h, d * 0.08]} offset={[0, 0, -d / 2 + d * 0.04]} color={dark} opacity={opacity} usePhoto />
        </group>
      );
    }

    case "shelf": {
      const shelfThick = Math.max(h * 0.04, 0.02);
      const sidePanelThick = Math.max(w * 0.04, 0.02);
      return (
        <group>
          <Panel size={[w, h, d * 0.05]} offset={[0, 0, -d / 2 + d * 0.025]} color={dark} opacity={opacity} usePhoto />
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
        </group>
      );
    }

    case "tv": {
      return (
        <group>
          <Panel size={[w, h * 0.85, d]} offset={[0, h * 0.075, 0]} color="#111111" opacity={opacity} roughness={0.2} metalness={0.4} usePhoto />
          <Panel size={[w * 0.3, h * 0.15, d]} offset={[0, -h / 2 + h * 0.075, 0]} color={dark} opacity={opacity} />
        </group>
      );
    }

    case "monitor": {
      const standW = Math.max(w * 0.15, 0.03);
      const standH = h * 0.35;
      return (
        <group>
          <Panel
            size={[w, h * 0.75, Math.max(d * 0.5, 0.02)]}
            offset={[0, h * 0.12, 0]}
            color="#111111"
            opacity={opacity}
            roughness={0.15}
            metalness={0.3}
            usePhoto
          />
          <Panel size={[standW, standH, standW]} offset={[0, -h / 2 + standH / 2, 0]} color={dark} opacity={opacity} />
          <Panel size={[w * 0.4, h * 0.04, d * 0.4]} offset={[0, -h / 2 + h * 0.02, 0]} color={dark} opacity={opacity} />
        </group>
      );
    }

    case "ottoman": {
      return (
        <group>
          <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} roughness={0.95} />
          <Panel size={[w * 0.9, h * 0.06, d * 0.9]} offset={[0, h / 2 - h * 0.03, 0]} color={dark} opacity={opacity} roughness={0.9} />
        </group>
      );
    }

    case "mirror": {
      return (
        <group>
          <Panel size={[w, h, Math.max(d, 0.02)]} offset={[0, 0, 0]} color={dark} opacity={opacity} />
          <Panel
            size={[w * 0.85, h * 0.85, Math.max(d * 0.3, 0.01)]}
            offset={[0, 0, d * 0.1]}
            color="#dfe9ec"
            opacity={opacity * 0.9}
            roughness={0.05}
            metalness={0.9}
          />
        </group>
      );
    }

    case "plant": {
      const potH = h * 0.3;
      const potR = Math.min(w, d) * 0.4;
      const foliageR = Math.min(w, d) * 0.5;
      return (
        <group>
          <mesh position={[0, -h / 2 + potH / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[potR * 0.85, potR, potH, 16]} />
            <meshStandardMaterial color={dark} roughness={0.8} opacity={opacity} transparent={opacity < 1} />
          </mesh>
          <mesh position={[0, -h / 2 + potH + (h - potH) * 0.5, 0]} castShadow receiveShadow>
            <sphereGeometry args={[foliageR, 12, 10]} />
            <meshStandardMaterial color={color} roughness={1} opacity={opacity} transparent={opacity < 1} />
          </mesh>
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
          <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} usePhoto />
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
