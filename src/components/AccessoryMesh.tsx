"use client";

import * as THREE from "three";
import type { Projection } from "@/lib/projection";

/** Which purpose-built shape an accessory gets, keyed off its catalog styleTags. */
export type AccessoryKind = "diffuser" | "projector";

export function accessoryKind(styleTags: string[]): AccessoryKind | null {
  if (styleTags.includes("diffuser")) return "diffuser";
  if (styleTags.includes("projector")) return "projector";
  return null;
}

/**
 * Accessories with no Amazon Berkeley Objects model, drawn to their real
 * measured size.
 *
 * A generic box would read as a cardboard carton on the desk; these are only a
 * few primitives each and the silhouette is what makes them recognisable at
 * room scale.
 */
export default function AccessoryMesh({
  kind,
  dimensions,
  color,
  selected = false,
  on = true,
}: {
  kind: AccessoryKind;
  dimensions: [number, number, number];
  color: string;
  selected?: boolean;
  on?: boolean;
}) {
  const [w, h, d] = dimensions;
  const emissive = selected ? "#24406e" : "#000000";
  const emissiveIntensity = selected ? 0.4 : 0;

  if (kind === "diffuser") {
    // The ASAKUKI is a wide frosted drum that rounds over into a dome, sitting
    // on a slightly tapered wood-grain foot — not a hemisphere. The silhouette
    // is the whole recognisability of this object at room scale, so the body is
    // lathed from a measured profile rather than approximated by a primitive.
    const r = Math.min(w, d) / 2;
    const footH = h * 0.34;
    const bodyH = h - footH;

    // Profile in the body's own space, bottom at 0. Straight-sided for the
    // lower half, then turning in to a flat-topped dome.
    const profile = [
      [1.0, 0.0], [1.0, 0.42], [0.985, 0.6], [0.945, 0.74],
      [0.87, 0.855], [0.74, 0.94], [0.54, 0.985], [0.3, 1.0], [0.0, 1.0],
    ].map(([rr, yy]) => new THREE.Vector2(rr * r, yy * bodyH));

    return (
      <group>
        {/* Wood foot, wider at the top where the body meets it. */}
        <mesh position={[0, -h / 2 + footH / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[r, r * 0.93, footH, 40]} />
          <meshStandardMaterial color="#C9A579" roughness={0.72} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        </mesh>
        {/* Control buttons along the front of the foot. */}
        {[-0.42, -0.14, 0.14, 0.42].map((t) => (
          <mesh key={t} position={[t * r, -h / 2 + footH * 0.42, d / 2 - 0.004]} castShadow>
            <boxGeometry args={[r * 0.2, footH * 0.24, 0.006]} />
            <meshStandardMaterial color="#B08F63" roughness={0.6} />
          </mesh>
        ))}
        {/* Frosted body. Lit from inside, which is what these actually do. */}
        <mesh position={[0, -h / 2 + footH, 0]} castShadow receiveShadow>
          <latheGeometry args={[profile, 44]} />
          <meshStandardMaterial
            color={color}
            roughness={0.42}
            emissive={on ? "#F0E4D0" : emissive}
            emissiveIntensity={on ? 0.34 : emissiveIntensity}
          />
        </mesh>
        {/* The mist vent — a small slot off-centre on the dome. */}
        <mesh position={[0, h / 2 - 0.001, d * 0.06]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[r * 0.5, r * 0.14]} />
          <meshStandardMaterial color="#E4E0DA" roughness={0.5} />
        </mesh>
        {on && (
          <mesh position={[0, h / 2 + h * 0.34, d * 0.06]} raycast={() => null}>
            <coneGeometry args={[r * 0.3, h * 0.68, 16, 1, true]} />
            <meshStandardMaterial color="#EFEBF7" transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        )}
        {on && <pointLight position={[0, 0, 0]} color="#ffd9a8" intensity={0.8} distance={1.1} decay={2} />}
      </group>
    );
  }

  // Projector: a body held in a tilt cradle on a round foot, lens facing -Z,
  // which is the direction rotationY points everywhere else in the scene.
  const bodyH = h * 0.7;
  const lensR = Math.min(bodyH, w) * 0.3;
  return (
    <group>
      <mesh position={[0, -h / 2 + h * 0.05, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[w * 0.42, w * 0.48, h * 0.1, 28]} />
        <meshStandardMaterial color="#D8D8D6" roughness={0.55} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      </mesh>
      {/* Cradle arms, which is what lets these tilt up at a wall. */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * w * 0.46, h * 0.05, 0]} castShadow>
          <boxGeometry args={[w * 0.07, bodyH * 0.8, d * 0.34]} />
          <meshStandardMaterial color="#CFCFCC" roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, h * 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.86, bodyH, d * 0.9]} />
        <meshStandardMaterial color={color} roughness={0.38} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      </mesh>
      {/* Lens barrel and glass. */}
      <mesh position={[0, h * 0.1, -d * 0.46]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[lensR, lensR * 1.1, d * 0.08, 26]} />
        <meshStandardMaterial color="#3A3D44" roughness={0.35} metalness={0.4} />
      </mesh>
      <mesh position={[0, h * 0.1, -d * 0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[lensR * 0.72, lensR * 0.72, d * 0.01, 26]} />
        <meshStandardMaterial color="#151A24" roughness={0.08} metalness={0.7} emissive="#1d3c6b" emissiveIntensity={0.5} />
      </mesh>
      {/* Vent slots down the side, the detail that stops it reading as a box. */}
      {[-0.22, 0, 0.22].map((t) => (
        <mesh key={t} position={[w * 0.44, h * 0.1, t * d]}>
          <boxGeometry args={[0.002, bodyH * 0.42, d * 0.06]} />
          <meshStandardMaterial color="#8E9298" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * The image a projector is throwing, drawn flat on the wall it faces.
 *
 * Deliberately not a photo of anything: a bright, faintly banded rectangle at
 * the true size reads as "this is how much wall you get", which is the only
 * question this is here to answer. It turns red when the image runs off the
 * wall, because that is the answer people most need to see.
 */
export function ProjectionScreen({ projection }: { projection: Projection }) {
  const { center, rotationY, width, height, fits } = projection;
  return (
    <group position={center} rotation={[0, rotationY, 0]} raycast={() => null}>
      <mesh position={[0, 0, 0.004]} raycast={() => null}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          color={fits ? "#cfe0ff" : "#ffb4a8"}
          emissive={fits ? "#7fa6ff" : "#d4553f"}
          emissiveIntensity={fits ? 0.85 : 0.7}
          transparent
          opacity={0.9}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.006]} raycast={() => null}>
        <planeGeometry args={[width * 0.995, height * 0.02]} />
        <meshBasicMaterial color={fits ? "#ffffff" : "#ffd9d2"} transparent opacity={0.35} toneMapped={false} />
      </mesh>
    </group>
  );
}
