"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { LedSegment } from "@/lib/ledPresets";

const STRIP_THICKNESS = 0.018;

// The invisible sleeve you actually click. Generous, because a strip runs
// along an edge where there is rarely anything else competing for the hit.
const PICK_THICKNESS = 0.09;

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
  selected = false,
  onSelect,
}: {
  segments: LedSegment[];
  color?: string;
  intensity?: number;
  castLight?: boolean;
  selected?: boolean;
  onSelect?: () => void;
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
        <group key={i} position={p.mid} quaternion={p.quat}>
          <mesh raycast={() => null /* the visible strip is too thin to hit; the proxy below is what you click */}>
            <boxGeometry args={[STRIP_THICKNESS, p.length, STRIP_THICKNESS]} />
            <meshStandardMaterial
              color={color}
              emissive={selected ? "#ffffff" : color}
              emissiveIntensity={(selected ? 3.4 : 2.2) * intensity}
              toneMapped={false}
            />
          </mesh>
          {/* An 18mm strip is almost impossible to click, so an invisible
              sleeve around it catches the pointer. Without this a run could be
              installed and then never selected or deleted. */}
          {onSelect && (
            <mesh
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect();
              }}
            >
              <boxGeometry args={[PICK_THICKNESS, p.length, PICK_THICKNESS]} />
              <meshBasicMaterial visible={false} />
            </mesh>
          )}
        </group>
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
