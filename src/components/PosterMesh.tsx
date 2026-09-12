"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { drawPoster, FRAME_DEPTH, type PosterArt } from "@/lib/posters";

/**
 * A framed poster: moulding, mount board, and the print itself.
 *
 * Built procedurally rather than loaded as a model because the artwork has to
 * change per poster. A wall-art mesh has its picture baked into a texture, so
 * one model can only ever be one poster.
 */
export default function PosterMesh({
  art,
  dimensions,
  frameColor = "#1d1f24",
  selected = false,
}: {
  art: PosterArt;
  /** Overall framed size, [width, height, depth] in metres. */
  dimensions: [number, number, number];
  frameColor?: string;
  selected?: boolean;
}) {
  const [w, h] = dimensions;
  const d = Math.max(dimensions[2], FRAME_DEPTH);

  const texture = useMemo(() => {
    const canvas = drawPoster(art, w / h, 640);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [art, w, h]);

  // A CanvasTexture holds a GPU allocation; without this, swapping posters or
  // deleting one leaks a texture per change.
  useEffect(() => () => texture.dispose(), [texture]);

  // The moulding is a proportion of the print, so a small frame doesn't get a
  // moulding as wide as an A1's.
  const bezel = Math.min(w, h) * 0.055;
  const artW = Math.max(w - bezel * 2, 0.01);
  const artH = Math.max(h - bezel * 2, 0.01);

  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={frameColor}
          roughness={0.55}
          emissive={selected ? "#24406e" : "#000000"}
          emissiveIntensity={selected ? 0.4 : 0}
        />
      </mesh>
      {/* The print sits just proud of the moulding's front face. */}
      <mesh position={[0, 0, d / 2 + 0.0015]}>
        <planeGeometry args={[artW, artH]} />
        <meshStandardMaterial map={texture} roughness={0.85} toneMapped={false} />
      </mesh>
    </group>
  );
}
