"use client";

import * as THREE from "three";
import type { RoomLayout, WallFeature } from "@/lib/roomLayoutSchema";

/**
 * Places a wall feature in room space.
 *
 * `offset` runs along the wall from its centre, `depth` intrudes into the room,
 * and a recess goes the other way — into the wall — so an alcove reads as a
 * hole rather than a block.
 */
export function featureTransform(f: WallFeature, room: RoomLayout["room"]) {
  const hw = room.width / 2;
  const hl = room.length / 2;
  const inward = f.kind === "recess" ? -1 : 1;
  const half = f.depth / 2;
  const y = f.baseY + f.height / 2;

  switch (f.wall) {
    case "north":
      return { position: [f.offset, y, -hl + inward * half] as const, rotationY: 0,
        size: [f.width, f.height, f.depth] as const };
    case "south":
      return { position: [f.offset, y, hl - inward * half] as const, rotationY: 0,
        size: [f.width, f.height, f.depth] as const };
    case "west":
      return { position: [-hw + inward * half, y, f.offset] as const, rotationY: 0,
        size: [f.depth, f.height, f.width] as const };
    default:
      return { position: [hw - inward * half, y, f.offset] as const, rotationY: 0,
        size: [f.depth, f.height, f.width] as const };
  }
}

/** The floor area a feature eats, so furniture can be kept out of it. */
export function featureFootprint(f: WallFeature, room: RoomLayout["room"]) {
  const t = featureTransform(f, room);
  return {
    x: t.position[0],
    z: t.position[2],
    width: t.size[0],
    depth: t.size[2],
    // A recess adds floor rather than taking it, and something high up leaves
    // the floor clear underneath.
    blocks: f.kind !== "recess" && f.baseY < 0.4,
  };
}

export default function WallFeatures({
  room,
  color,
}: {
  room: RoomLayout["room"];
  color?: string;
}) {
  const features = room.wallFeatures ?? [];
  if (features.length === 0) return null;

  return (
    <group>
      {features.map((f) => {
        const t = featureTransform(f, room);
        return (
          <mesh
            key={f.id}
            position={t.position as unknown as [number, number, number]}
            castShadow
            receiveShadow
            // Structure, not furniture — clicking one should never select it or
            // steal a drag meant for the sofa in front of it.
            raycast={() => null}
          >
            <boxGeometry args={t.size as unknown as [number, number, number]} />
            <meshStandardMaterial
              color={color ?? room.wallColor ?? "#d8d4cd"}
              roughness={0.95}
              // A recess is a void: darkening it is what reads as depth without
              // actually cutting geometry out of the wall.
              emissive={f.kind === "recess" ? "#000000" : undefined}
              side={f.kind === "recess" ? THREE.BackSide : THREE.FrontSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}
