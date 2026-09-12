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
    // Ultrasonic diffusers are a wood-grain foot under a domed ceramic body.
    const bodyR = Math.min(w, d) / 2;
    return (
      <group>
        <mesh position={[0, -h * 0.38, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[bodyR * 0.92, bodyR * 0.86, h * 0.24, 28]} />
          <meshStandardMaterial color="#9C7A52" roughness={0.75} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        </mesh>
        <mesh position={[0, h * 0.06, 0]} castShadow receiveShadow>
          <sphereGeometry args={[bodyR, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          <meshStandardMaterial
            color={color}
            roughness={0.35}
            emissive={on ? "#5a4a86" : emissive}
            emissiveIntensity={on ? 0.5 : emissiveIntensity}
          />
        </mesh>
        {/* The mist plume, which is most of what you actually notice. */}
        {on && (
          <mesh position={[0, h * 0.62, 0]} raycast={() => null}>
            <coneGeometry args={[bodyR * 0.36, h * 0.7, 14, 1, true]} />
            <meshStandardMaterial
              color="#E9E4F5"
              transparent
              opacity={0.22}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        )}
        {on && <pointLight position={[0, h * 0.2, 0]} color="#a78bfa" intensity={0.7} distance={0.9} decay={2} />}
      </group>
    );
  }

  // Projector: a rounded body on a tilting yoke, lens facing -Z (its facing
  // direction), matching how rotationY is read everywhere else.
  const bodyW = w * 0.82;
  return (
    <group>
      <mesh position={[0, -h * 0.42, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[w * 0.34, w * 0.38, h * 0.16, 22]} />
        <meshStandardMaterial color="#D8D8D6" roughness={0.6} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      </mesh>
      <mesh position={[0, h * 0.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[bodyW, h * 0.66, d * 0.78]} />
        <meshStandardMaterial color={color} roughness={0.4} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      </mesh>
      <mesh position={[0, h * 0.08, -d * 0.4]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[h * 0.19, h * 0.19, d * 0.06, 22]} />
        <meshStandardMaterial color="#2A2C31" roughness={0.2} metalness={0.5} />
      </mesh>
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
