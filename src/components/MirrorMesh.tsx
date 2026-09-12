"use client";

import { MeshReflectorMaterial } from "@react-three/drei";

/**
 * A mirror that actually mirrors.
 *
 * A grey plate with a high metalness reads as metal, not glass — the thing that
 * makes a mirror legible is that you can see the room in it. This renders a
 * real planar reflection of the scene, which also does something useful rather
 * than merely decorative: it shows you the wall behind you, which is the view
 * you cannot otherwise get without orbiting away from what you are arranging.
 *
 * Resolution is kept modest on purpose. A reflection is an extra render pass of
 * the whole room every frame, and a dorm may hold several mirrors; at this size
 * it is sharp enough to recognise the furniture and cheap enough not to cost
 * the frame rate.
 */
export default function MirrorMesh({
  dimensions,
  frameColor = "#2f2c28",
  selected = false,
}: {
  dimensions: [number, number, number];
  frameColor?: string;
  selected?: boolean;
}) {
  const [w, h, d] = dimensions;
  const depth = Math.max(d, 0.02);
  // Frame thickness scales with the mirror so a small one does not get a
  // moulding as chunky as a full-length one's.
  const bezel = Math.min(w, h) * 0.045;

  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, depth]} />
        <meshStandardMaterial
          color={frameColor}
          roughness={0.5}
          emissive={selected ? "#24406e" : "#000000"}
          emissiveIntensity={selected ? 0.4 : 0}
        />
      </mesh>
      <mesh position={[0, 0, depth / 2 + 0.002]}>
        <planeGeometry args={[Math.max(w - bezel * 2, 0.01), Math.max(h - bezel * 2, 0.01)]} />
        <MeshReflectorMaterial
          resolution={512}
          mixBlur={0.35}
          mixStrength={2.2}
          // Real mirror glass is not perfectly flat and not perfectly clean;
          // a little blur and roughness stops the reflection looking like a
          // second camera cut into the wall.
          blur={[180, 60]}
          roughness={0.12}
          depthScale={0}
          metalness={0.55}
          color="#dfe4e6"
          mirror={0.92}
        />
      </mesh>
    </group>
  );
}
