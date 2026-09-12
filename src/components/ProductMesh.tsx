"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { ModelMount } from "@/lib/models.generated";

// Decode Draco locally instead of from Google's CDN. drei defaults to
// gstatic, which turns every furniture model into a live network dependency —
// a bad trade at a demo where the wifi is someone else's problem.
useGLTF.setDecoderPath("/draco/gltf/");

type Props = {
  modelUrl: string;
  /** The real product's [width, height, depth] in metres. */
  dimensions: [number, number, number];
  mount: ModelMount;
  /** True when the mesh is the real product at its real size and must not be rescaled. */
  exact?: boolean;
  opacity?: number;
  selected?: boolean;
};

/**
 * Renders a catalog product's glTF model, resized to the product's true
 * real-world dimensions.
 *
 * The scaling is deliberately non-uniform. These meshes stand in for products
 * they are not — a lookalike desk, scaled — so the choice is between a model
 * with honest proportions and an object with an honest footprint. Footprint
 * wins: the entire point of arranging a room is knowing whether the desk
 * actually fits against that wall, and a 10% stretch is invisible next to a
 * 15cm lie about how much floor something eats.
 */
export default function ProductMesh({ modelUrl, dimensions, mount, exact = false, opacity = 1, selected = false }: Props) {
  const { scene } = useGLTF(modelUrl);

  const prepared = useMemo(() => {
    const root = scene.clone(true);

    // Wall pieces are authored inconsistently in the source data: some stand
    // upright, some lie flat on their back. "Flat" is detectable — the thinnest
    // axis is Y — and standing one up is a -90 degree turn about X.
    if (mount === "wall") {
      const raw = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
      if (raw.y < raw.x && raw.y < raw.z) root.rotateX(-Math.PI / 2);
    }

    // Measure AFTER any standing-up, then scale each axis to the product's
    // real size and re-centre on the origin — room objects are positioned by
    // their centre, so a model whose pivot sits at its feet would float.
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());

    const wrapper = new THREE.Group();
    const inner = new THREE.Group();
    inner.add(root);
    // Guard against a degenerate axis (flat wall art has near-zero depth):
    // dividing by it produces Infinity and the object vanishes from the scene.
    const safe = (n: number) => (n > 1e-4 ? n : 1e-4);
    if (exact) {
      // IKEA's own asset is the product, at the product's real size. Rescaling
      // it to our recorded dimensions could only ever make it less accurate —
      // our numbers are a transcription, this mesh is the source.
      inner.scale.setScalar(1);
    } else {
      inner.scale.set(
        dimensions[0] / safe(size.x),
        dimensions[1] / safe(size.y),
        dimensions[2] / safe(size.z)
      );
    }
    // Centre X/Z on the mesh's own geometry, but anchor Y to our recorded
    // height rather than the mesh's own true one. Everywhere an object's
    // position is computed (placement.ts) it assumes position[1] is the
    // centre and the object's bottom sits exactly dimensions[1] / 2 below
    // that — true by construction for a rescaled stand-in, since it's been
    // scaled to match dimensions exactly. An "exact" IKEA asset is kept at
    // its own real size instead, and that can differ from our recorded
    // number by a few millimetres to a couple of centimetres — enough to
    // read as the object floating just above the floor. Anchoring to the
    // same number placement.ts already assumed, rather than the mesh's own
    // true centre, is what actually makes it rest there.
    root.position.x -= centre.x;
    root.position.z -= centre.z;
    root.position.y -= box.min.y;
    inner.position.y -= dimensions[1] / 2;
    wrapper.add(inner);

    // Materials are shared across every clone of a model, so tweaking opacity
    // in place would fade every other copy of that desk in the room too.
    if (opacity < 1 || selected) {
      wrapper.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const wasArray = Array.isArray(mesh.material);
        const src = wasArray ? (mesh.material as THREE.Material[]) : [mesh.material as THREE.Material];
        const cloned = src.map((m) => {
          const copy = (m as THREE.Material).clone();
          copy.transparent = opacity < 1;
          copy.opacity = opacity;
          const std = copy as THREE.MeshStandardMaterial;
          if (selected && std.emissive) {
            std.emissive = new THREE.Color("#3b82f6");
            std.emissiveIntensity = 0.35;
          }
          return copy;
        });
        mesh.material = wasArray ? cloned : cloned[0];
      });
    }

    wrapper.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });

    return wrapper;
  }, [scene, dimensions, mount, exact, opacity, selected]);

  return <primitive object={prepared} />;
}
