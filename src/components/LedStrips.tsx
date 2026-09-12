"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { LedSegment } from "@/lib/ledPresets";

const STRIP_THICKNESS = 0.018;

/**
 * Renders one LED run as a chain of glowing segments.
 *
 * The strip itself is emissive geometry — it does not light the room on its
 * own, so a few point lights are spread along the run to actually throw colour
 * onto nearby surfaces. They are deliberately sparse: a light per segment is
 * enough to read as a glow, and a light per centimetre would cost more than the
 * rest of the scene put together.
 */
export default function LedStrips({
  segments,
  color = "#8b5cf6",
  intensity = 1,
  castLight = true,
}: {
  segments: LedSegment[];
  color?: string;
  intensity?: number;
  castLight?: boolean;
}) {
  const pieces = useMemo(
    () =>
      segments.map((s) => {
        const from = new THREE.Vector3(...s.from);
        const to = new THREE.Vector3(...s.to);
        const mid = from.clone().add(to).multiplyScalar(0.5);
        const length = from.distanceTo(to);
        const dir = to.clone().sub(from).normalize();
        // Align the segment's local +Y with the run direction.
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        return { mid, length, quat };
      }),
    [segments]
  );

  // One light every couple of segments, capped so a four-sided ceiling run and
  // a two-run headboard cost about the same.
  const lights = useMemo(() => {
    const out: THREE.Vector3[] = [];
    const step = Math.max(1, Math.ceil(pieces.length / 4));
    for (let i = 0; i < pieces.length; i += step) out.push(pieces[i].mid);
    return out;
  }, [pieces]);

  return (
    <group>
      {pieces.map((p, i) => (
        <mesh
          key={i}
          position={p.mid}
          quaternion={p.quat}
          raycast={() => null /* a strip should never swallow a click meant for furniture */}
        >
          <boxGeometry args={[STRIP_THICKNESS, p.length, STRIP_THICKNESS]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={2.2 * intensity}
            toneMapped={false}
          />
        </mesh>
      ))}
      {castLight &&
        lights.map((pos, i) => (
          <pointLight
            key={`l${i}`}
            position={pos}
            color={color}
            intensity={2.6 * intensity}
            distance={2.8}
            decay={2}
          />
        ))}
    </group>
  );
}
