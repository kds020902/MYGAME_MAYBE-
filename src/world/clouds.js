import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from '../core/toon.js';
import { mulberry32 } from '../core/noise.js';

const SPREAD = 750;
const WIND = new THREE.Vector2(3.5, 1.2);

// Puffy toon clouds drifting with the wind; lit by the scene lights so they follow the time of day.
export function createClouds({ count = 34 } = {}) {
  const rand = mulberry32(909);
  let geo = new THREE.IcosahedronGeometry(1, 2);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  geo.computeVertexNormals();

  const clouds = [];
  let puffCount = 0;
  for (let i = 0; i < count; i++) {
    const puffs = [];
    const n = 4 + Math.floor(rand() * 4);
    const size = 8 + rand() * 10;
    for (let k = 0; k < n; k++) {
      puffs.push({
        x: (k - n / 2) * size * 0.7 + (rand() - 0.5) * size * 0.5,
        y: (rand() - 0.3) * size * 0.35,
        z: (rand() - 0.5) * size * 0.8,
        r: size * (0.55 + rand() * 0.5),
      });
    }
    puffCount += n;
    clouds.push({ x: (rand() * 2 - 1) * SPREAD, y: 130 + rand() * 60, z: (rand() * 2 - 1) * SPREAD, puffs });
  }

  const mesh = new THREE.InstancedMesh(geo, toonMaterial(0xffffff, { fog: false }), puffCount);
  mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();

  return {
    mesh,
    update(dt, focus) {
      let i = 0;
      for (const c of clouds) {
        c.x += WIND.x * dt;
        c.z += WIND.y * dt;
        // keep clouds within a square around the player
        if (c.x - focus.x > SPREAD) c.x -= SPREAD * 2;
        if (c.x - focus.x < -SPREAD) c.x += SPREAD * 2;
        if (c.z - focus.z > SPREAD) c.z -= SPREAD * 2;
        if (c.z - focus.z < -SPREAD) c.z += SPREAD * 2;
        for (const p of c.puffs) {
          dummy.position.set(c.x + p.x, c.y + p.y, c.z + p.z);
          dummy.scale.set(p.r, p.r * 0.7, p.r);
          dummy.updateMatrix();
          mesh.setMatrixAt(i++, dummy.matrix);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
