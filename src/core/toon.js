import * as THREE from 'three';

// 3-band cel shading ramp shared by every toon material.
export const toonGradient = new THREE.DataTexture(new Uint8Array([105, 180, 255]), 3, 1, THREE.RedFormat);
toonGradient.minFilter = THREE.NearestFilter;
toonGradient.magFilter = THREE.NearestFilter;
toonGradient.generateMipmaps = false;
toonGradient.needsUpdate = true;

const cache = new Map();

export function toonMaterial(color = 0xffffff, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshToonMaterial({ color, gradientMap: toonGradient, ...opts }));
  }
  return cache.get(key);
}

// Inverted-hull outline: a back-face copy of the mesh pushed out along its normals.
let outlineMaterial = null;

function getOutlineMaterial() {
  if (!outlineMaterial) {
    outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x2a1d1d, side: THREE.BackSide });
    outlineMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        'vec3 transformed = position + normalize(normal) * 0.012;'
      );
    };
  }
  return outlineMaterial;
}

export function addOutline(mesh) {
  const outline = new THREE.Mesh(mesh.geometry, getOutlineMaterial());
  outline.castShadow = false;
  outline.receiveShadow = false;
  mesh.add(outline);
  return outline;
}
