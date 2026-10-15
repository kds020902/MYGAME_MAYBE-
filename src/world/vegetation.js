import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from '../core/toon.js';
import { mulberry32, createNoise2D } from '../core/noise.js';
import { HALF } from './terrain.js';

function smoothGeometry(geo) {
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const merged = mergeVertices(geo);
  merged.computeVertexNormals();
  return merged;
}

const LEAF_COLORS = [0x4f9a3a, 0x5aa83f, 0x47913a, 0x68b444, 0x7cbf4a].map((c) => new THREE.Color(c));
const PINE_COLORS = [0x2f6e3e, 0x356f3a, 0x2b6340, 0x3b7a3f].map((c) => new THREE.Color(c));
const ROCK_COLORS = [0x8f8a80, 0xa29d92, 0x7d786f, 0x96918a].map((c) => new THREE.Color(c));

// Broadleaf canopy made of soft blobs: [x, y, z, radius] relative to the trunk base.
const BLOBS = [[0, 3.7, 0, 2.0], [1.0, 3.2, 0.5, 1.5], [-0.9, 3.4, -0.4, 1.55], [0.2, 4.7, -0.2, 1.35], [-0.3, 3.0, 0.9, 1.3]];
// Pine layers: [y, radius, height] of each cone.
const CONES = [[1.3, 2.0, 2.6], [2.6, 1.55, 2.3], [3.8, 1.1, 2.0]];

export function createVegetation(scene, terrain, colliders) {
  const rand = mulberry32(2024);
  const forestNoise = createNoise2D(77);
  const forest = (x, z) => forestNoise(x * 0.011, z * 0.011) * 0.7 + forestNoise(x * 0.03 + 9, z * 0.03) * 0.3;
  const normal = new THREE.Vector3();

  const broad = [];
  const pines = [];
  for (let k = 0; k < 80000 && broad.length + pines.length < 1300; k++) {
    const x = (rand() * 2 - 1) * HALF * 0.95;
    const z = (rand() * 2 - 1) * HALF * 0.95;
    if (Math.hypot(x, z) < 18) continue;
    const h = terrain.heightAt(x, z);
    if (h < 2.0 || h > 38) continue;
    if (terrain.normalAt(x, z, normal).y < 0.8) continue;
    const f = forest(x, z);
    const chance = f > 0.2 ? 0.6 : f > 0 ? 0.08 : 0.012;
    if (rand() > chance || !colliders.isFree(x, z, 2.6)) continue;
    const tree = { x, z, h, s: 0.8 + rand() * 0.6, rot: rand() * Math.PI * 2 };
    (rand() < (h > 16 ? 0.85 : 0.2) ? pines : broad).push(tree);
    colliders.add(x, z, 0.45 * tree.s);
  }

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const meshes = [];
  const instanced = (geo, mat, n) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(n, 1));
    m.count = n;
    m.castShadow = true;
    m.receiveShadow = true;
    meshes.push(m);
    return m;
  };
  const place = (mesh, i, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };

  // Trunks (shared by both tree types).
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.32, 3.2, 7);
  trunkGeo.translate(0, 1.6, 0);
  const trunks = instanced(trunkGeo, toonMaterial(0x7a5233), broad.length + pines.length);
  let ti = 0;
  for (const t of broad) place(trunks, ti++, t.x, t.h - 0.2, t.z, t.s, t.s, t.s, t.rot);
  for (const t of pines) place(trunks, ti++, t.x, t.h - 0.2, t.z, t.s * 0.9, t.s * 0.75, t.s * 0.9, t.rot);

  // Broadleaf canopies.
  const blobGeo = smoothGeometry(new THREE.IcosahedronGeometry(1, 2));
  const leaves = instanced(blobGeo, toonMaterial(0xffffff), broad.length * BLOBS.length);
  let li = 0;
  for (const t of broad) {
    const base = LEAF_COLORS[Math.floor(rand() * LEAF_COLORS.length)];
    const cos = Math.cos(t.rot), sin = Math.sin(t.rot);
    for (const [bx, by, bz, br] of BLOBS) {
      const r = br * t.s * (0.9 + rand() * 0.2);
      place(leaves, li, t.x + (bx * cos - bz * sin) * t.s, t.h + by * t.s, t.z + (bx * sin + bz * cos) * t.s, r, r * 0.85, r, rand() * 6);
      leaves.setColorAt(li++, color.copy(base).offsetHSL(0, 0, (rand() - 0.5) * 0.06));
    }
  }

  // Pine cones.
  const coneGeo = new THREE.ConeGeometry(1, 1, 9);
  coneGeo.translate(0, 0.5, 0);
  const cones = instanced(coneGeo, toonMaterial(0xffffff), pines.length * CONES.length);
  let ci = 0;
  for (const t of pines) {
    const base = PINE_COLORS[Math.floor(rand() * PINE_COLORS.length)];
    for (const [cy, cr, ch] of CONES) {
      place(cones, ci, t.x, t.h + cy * t.s, t.z, cr * t.s, ch * t.s, cr * t.s, rand() * 6);
      cones.setColorAt(ci++, color.copy(base).offsetHSL(0, 0, (rand() - 0.5) * 0.05));
    }
  }

  // Bushes.
  const bushData = [];
  for (let k = 0; k < 20000 && bushData.length < 900; k++) {
    const x = (rand() * 2 - 1) * HALF * 0.95;
    const z = (rand() * 2 - 1) * HALF * 0.95;
    if (Math.hypot(x, z) < 8) continue;
    const h = terrain.heightAt(x, z);
    if (h < 1.8 || h > 30 || terrain.normalAt(x, z, normal).y < 0.82) continue;
    if (rand() > (forest(x, z) > 0.1 ? 0.5 : 0.1)) continue;
    bushData.push({ x, z, h, s: 0.5 + rand() * 0.6 });
  }
  const bushes = instanced(blobGeo, toonMaterial(0xffffff), bushData.length);
  bushes.castShadow = false;
  bushData.forEach((b, i) => {
    place(bushes, i, b.x, b.h + 0.15 * b.s, b.z, 1.2 * b.s, 0.8 * b.s, 1.2 * b.s, rand() * 6);
    bushes.setColorAt(i, color.copy(LEAF_COLORS[i % LEAF_COLORS.length]).offsetHSL(0, 0.02, -0.03));
  });

  // Rocks (flat-shaded for a chunky look).
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockData = [];
  for (let k = 0; k < 20000 && rockData.length < 450; k++) {
    const x = (rand() * 2 - 1) * HALF * 0.95;
    const z = (rand() * 2 - 1) * HALF * 0.95;
    if (Math.hypot(x, z) < 8) continue;
    const h = terrain.heightAt(x, z);
    if (h < -0.5) continue;
    const steep = 1 - terrain.normalAt(x, z, normal).y;
    if (rand() > 0.05 + steep * 1.5 + (h > 20 ? 0.1 : 0)) continue;
    const s = 0.3 + rand() ** 2 * 2.2;
    if (s > 0.6 && !colliders.isFree(x, z, s + 0.5)) continue;
    rockData.push({ x, z, h, s });
    if (s > 0.6) colliders.add(x, z, s * 0.9);
  }
  const rocks = instanced(rockGeo, toonMaterial(0xffffff), rockData.length);
  rockData.forEach((r, i) => {
    place(rocks, i, r.x, r.h - r.s * 0.25, r.z, r.s * (0.8 + rand() * 0.5), r.s * (0.6 + rand() * 0.4), r.s * (0.8 + rand() * 0.5), rand() * 6, rand() * 0.4, rand() * 0.4);
    rocks.setColorAt(i, ROCK_COLORS[i % ROCK_COLORS.length]);
  });

  for (const m of meshes) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    scene.add(m);
  }
  return { trees: broad.length + pines.length, rocks: rockData.length, bushes: bushData.length };
}
