import { createContext, useContext, useMemo } from "react";
import * as THREE from "three";
import { CATEGORY_TEXTURE, getTexture } from "./textures";
import {
  dominantPlaneColor,
  prepareOccluders,
  rotateY,
  type PreparedCamera,
} from "./projectiveTexture";

type Props = {
  category: string;
  dimensions: [number, number, number];
  color: string;
  opacity: number;
  /** Captured camera frames for this session, empty on the Gemini-photo web
   * path (no per-photo camera pose) — see projectiveTexture.ts. */
  cameras: PreparedCamera[];
  /** Everything that can stand between a camera and this object's face. A
   * chair pushed under a desk otherwise paints itself onto the desktop. */
  occluders: ReturnType<typeof prepareOccluders>;
  objectPosition: [number, number, number];
  objectRotationY: number;
};

// Every primitive inside one piece of furniture shares its detail map, so
// it's resolved once at the top and read back down rather than threaded
// through every Panel call.
const DetailMap = createContext<THREE.Texture | null>(null);

// The colour measured off this object's most-visible face in the photos (see
// faceGeometryFor below), shared the same way as DetailMap. Null whenever
// there are no cameras, the category has no single flat face worth sampling
// (a lamp, a plant), or no camera actually saw this object — in which case
// the object keeps whichever colour colorize or the category palette gave it.
const FaceColor = createContext<string | null>(null);

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
  /** This is the panel standing in for the object's sampled face (see
   * faceGeometryFor) — only one Panel per object should set this. */
  usePhoto?: boolean;
}) {
  const detailMap = useContext(DetailMap);
  const sampledFace = useContext(FaceColor);
  // A measured colour beats the palette guess, but it's still just a colour —
  // the panel keeps its procedural grain rather than wearing a photo.
  const resolved = usePhoto && sampledFace ? sampledFace : color;
  return (
    <mesh position={offset} castShadow receiveShadow>
      <boxGeometry args={size.map((v) => Math.max(v, 0.01)) as [number, number, number]} />
      <meshStandardMaterial
        color={resolved}
        map={detailMap}
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
    // The appliances qualify because their door is drawn as its own thin
    // panel — projecting onto the full body box instead would smear the
    // front photo across the sides and back too.
    case "tv":
    case "monitor":
    case "door":
    case "refrigerator":
    case "dishwasher":
    case "washerDryer":
    case "oven":
    // Artwork most of all: a picture frame whose picture is a flat average
    // colour is just a rectangle.
    case "artwork":
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

function useFaceColor(props: Props): string | null {
  const { category, dimensions, color, cameras, occluders, objectPosition, objectRotationY } = props;
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

    return dominantPlaneColor(
      { center, xAxis, yAxis, normal, fallbackColor: color },
      cameras,
      occluders,
      // Coarser than a wall: a chair back is small, and a couple of hundred
      // accepted samples already settles its colour.
      24
    );
  }, [category, w, h, d, color, cameras, occluders, ox, oy, oz, objectRotationY]);
}

export default function FurnitureMesh(props: Props) {
  const map = useMemo(
    () => getTexture(CATEGORY_TEXTURE[props.category] ?? "plaster", 2),
    [props.category]
  );
  const faceColor = useFaceColor(props);
  return (
    <DetailMap.Provider value={map}>
      <FaceColor.Provider value={faceColor}>
        {/* A colour measured off the object's own pixels beats colorize's
            guess, so it becomes the whole object's colour rather than just
            the one sampled panel's. Previously a chair's backrest got the
            real colour while its seat and legs stayed whatever Gemini
            assumed a chair looks like, which is why chairs came out a
            uniform catalogue tan. Falls back to colorize, then the category
            palette, when nothing saw this object. */}
        <FurnitureGeometry {...props} color={faceColor ?? props.color} />
      </FaceColor.Provider>
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

    // Big boxy appliances: a slab body with a door seam and a handle. The
    // seam is what stops these reading as featureless grey blocks.
    case "refrigerator":
    case "dishwasher":
    case "washerDryer":
    case "oven": {
      const handleInset = Math.max(w * 0.08, 0.03);
      return (
        <group>
          <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} roughness={0.35} metalness={0.45} />
          <Panel
            size={[w * 0.9, h * 0.88, d * 0.04]}
            offset={[0, 0, d / 2 + 0.004]}
            color={dark}
            opacity={opacity}
            roughness={0.3}
            metalness={0.5}
            usePhoto
          />
          <Panel
            size={[Math.max(w * 0.05, 0.02), h * 0.5, Math.max(d * 0.05, 0.02)]}
            offset={[w / 2 - handleInset, h * 0.1, d / 2 + 0.03]}
            color="#8d9296"
            opacity={opacity}
            roughness={0.25}
            metalness={0.8}
          />
        </group>
      );
    }

    case "stove": {
      const topThick = Math.max(h * 0.05, 0.02);
      return (
        <group>
          <Panel size={[w, h - topThick, d]} offset={[0, -topThick / 2, 0]} color={color} opacity={opacity} roughness={0.4} metalness={0.4} />
          <Panel size={[w, topThick, d]} offset={[0, h / 2 - topThick / 2, 0]} color="#26292c" opacity={opacity} roughness={0.2} metalness={0.5} />
          {/* Four burners, so a cooktop reads as a cooktop from above. */}
          {[
            [-0.24, -0.22],
            [0.24, -0.22],
            [-0.24, 0.22],
            [0.24, 0.22],
          ].map(([fx, fz], i) => (
            <mesh key={i} position={[w * fx, h / 2 + 0.002, d * fz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <circleGeometry args={[Math.min(w, d) * 0.12, 16]} />
              <meshStandardMaterial color="#15171a" roughness={0.5} />
            </mesh>
          ))}
        </group>
      );
    }

    case "toilet": {
      const tankH = h * 0.45;
      return (
        <group>
          <mesh position={[0, -h / 2 + (h - tankH) / 2, d * 0.08]} castShadow receiveShadow>
            <cylinderGeometry args={[Math.min(w, d) * 0.36, Math.min(w, d) * 0.3, h - tankH, 16]} />
            <meshStandardMaterial color={color} roughness={0.18} opacity={opacity} transparent={opacity < 1} />
          </mesh>
          <Panel size={[w * 0.75, tankH, d * 0.28]} offset={[0, h / 2 - tankH / 2, -d / 2 + d * 0.16]} color={color} opacity={opacity} roughness={0.18} />
        </group>
      );
    }

    case "sink": {
      const rim = Math.max(h * 0.15, 0.03);
      return (
        <group>
          <Panel size={[w, rim, d]} offset={[0, h / 2 - rim / 2, 0]} color={color} opacity={opacity} roughness={0.15} metalness={0.3} />
          <Panel size={[w * 0.75, h - rim, d * 0.75]} offset={[0, -rim / 2, 0]} color={dark} opacity={opacity} roughness={0.2} metalness={0.4} />
          <mesh position={[0, h / 2 + h * 0.18, -d * 0.32]} castShadow>
            <cylinderGeometry args={[Math.min(w, d) * 0.045, Math.min(w, d) * 0.05, h * 0.4, 12]} />
            <meshStandardMaterial color="#b9bfc4" roughness={0.15} metalness={0.85} />
          </mesh>
        </group>
      );
    }

    case "bathtub": {
      const wallThick = Math.max(Math.min(w, d) * 0.07, 0.03);
      return (
        <group>
          <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} roughness={0.15} />
          {/* Recessed basin — without it a tub is just a slab. */}
          <Panel
            size={[w - wallThick * 2, h * 0.7, d - wallThick * 2]}
            offset={[0, h * 0.2, 0]}
            color={shade(color, -8)}
            opacity={opacity}
            roughness={0.2}
          />
        </group>
      );
    }

    case "fireplace": {
      return (
        <group>
          <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} roughness={0.9} />
          <Panel
            size={[w * 0.6, h * 0.55, d * 0.3]}
            offset={[0, -h * 0.15, d / 2 - d * 0.15]}
            color="#1a1613"
            opacity={opacity}
            roughness={1}
          />
        </group>
      );
    }

    case "stairs": {
      // Stepped rather than a ramp — the whole point of drawing stairs is
      // that they read as stairs at a glance.
      const steps = Math.max(3, Math.min(12, Math.round(h / 0.18)));
      return (
        <group>
          {Array.from({ length: steps }, (_, i) => {
            const stepH = h / steps;
            const stepD = d / steps;
            return (
              <Panel
                key={i}
                size={[w, stepH, d - stepD * i]}
                offset={[0, -h / 2 + stepH * (i + 0.5), d / 2 - (d - stepD * i) / 2]}
                color={i % 2 === 0 ? color : shade(color, -6)}
                opacity={opacity}
              />
            );
          })}
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

    // Flat wall fittings. They all end up the same shape — a thin plate with
    // a slightly inset face — so they share one case rather than five
    // near-identical ones. The inset is what stops them reading as stickers
    // painted onto the wall.
    case "thermostat":
    case "outlet":
    case "lightSwitch":
    case "vent":
    case "clock": {
      const plate = Math.max(d, 0.015);
      return (
        <group>
          <Panel size={[w, h, plate]} offset={[0, 0, 0]} color={color} opacity={opacity} roughness={0.5} />
          <Panel
            size={[w * 0.66, h * 0.66, plate * 0.5]}
            offset={[0, 0, plate * 0.5]}
            color={dark}
            opacity={opacity}
            roughness={0.35}
          />
        </group>
      );
    }

    case "smokeAlarm": {
      const radius = Math.max(Math.min(w, h), 0.02) / 2;
      const depth = Math.max(d, 0.02);
      return (
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[radius, radius * 0.92, depth, 20]} />
          <meshStandardMaterial color={color} roughness={0.6} opacity={opacity} transparent={opacity < 1} />
        </mesh>
      );
    }

    case "artwork": {
      const frameDepth = Math.max(d, 0.02);
      return (
        <group>
          <Panel size={[w, h, frameDepth]} offset={[0, 0, 0]} color={dark} opacity={opacity} roughness={0.7} />
          {/* The canvas takes the projected photo when a camera saw it —
              artwork is the one small item where the real image is the whole
              point of the object. */}
          <Panel
            size={[w * 0.88, h * 0.88, frameDepth * 0.4]}
            offset={[0, 0, frameDepth * 0.4]}
            color={color}
            opacity={opacity}
            roughness={0.85}
            usePhoto
          />
        </group>
      );
    }

    case "keyboard": {
      return (
        <group>
          <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} roughness={0.7} />
          <Panel
            size={[w * 0.94, h * 0.25, d * 0.88]}
            offset={[0, h * 0.4, 0]}
            color={shade(color, 12)}
            opacity={opacity}
            roughness={0.6}
          />
        </group>
      );
    }

    case "speaker": {
      return (
        <group>
          <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} roughness={0.75} />
          <mesh position={[0, 0, d / 2 + 0.002]} castShadow receiveShadow>
            <cylinderGeometry args={[Math.min(w, h) * 0.3, Math.min(w, h) * 0.3, 0.006, 16]} />
            <meshStandardMaterial color={shade(color, -20)} roughness={0.9} />
          </mesh>
        </group>
      );
    }

    case "books": {
      // A run of individual spines rather than one block, so a row of books
      // doesn't read as a solid brick.
      const count = Math.max(3, Math.min(9, Math.round(w / 0.04)));
      const spine = w / count;
      return (
        <group>
          {Array.from({ length: count }, (_, i) => (
            <Panel
              key={i}
              size={[spine * 0.85, h * (0.82 + ((i * 37) % 18) / 100), d]}
              offset={[-w / 2 + spine * (i + 0.5), 0, 0]}
              color={i % 3 === 0 ? shade(color, 14) : i % 3 === 1 ? shade(color, -12) : color}
              opacity={opacity}
              roughness={0.9}
            />
          ))}
        </group>
      );
    }

    case "rug":
      return <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} roughness={1} />;

    default:
      return <Panel size={[w, h, d]} offset={[0, 0, 0]} color={color} opacity={opacity} />;
  }
}
