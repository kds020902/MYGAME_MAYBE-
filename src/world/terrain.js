import * as THREE from 'three';
import { createNoise2D, fbm, ridged, smoothstep, lerp } from '../core/noise.js';
import { toonMaterial } from '../core/toon.js';

export const WORLD_SIZE = 640;
export const HALF = WORLD_SIZE / 2;
export const GRID = 257; // vertices per side
export const CELL = WORLD_SIZE / (GRID - 1);
export const WATER_LEVEL = 0;
const SEA_FLOOR = -9;

const hillNoise = createNoise2D(11);
const mountainNoise = createNoise2D(23);
const coastNoise = createNoise2D(37);
const detailNoise = createNoise2D(51);

// Island: meadow in the middle, rolling hills, ridged mountains, beaches all around.
function rawHeight(x, z) {
  const r = Math.hypot(x, z) / HALF;
  const land = 1 - smoothstep(0.6, 0.93, r + fbm(coastNoise, x * 0.008, z * 0.008, 3) * 0.12);
  let h = 5 + fbm(hillNoise, x * 0.005, z * 0.005, 4) * 9;
  const mountainMask = smoothstep(0.0, 0.45, fbm(mountainNoise, x * 0.0025 + 3.1, z * 0.0025 - 7.3, 2));
  h += Math.pow(ridged(mountainNoise, x * 0.007, z * 0.007, 4), 2.2) * 55 * mountainMask;
  h = lerp(5.5, h, smoothstep(14, 60, Math.hypot(x, z))); // flat starting meadow
  return lerp(SEA_FLOOR, h, land);
}

const C = (hex) => new THREE.Color(hex);
const PALETTE = {
  grassA: C(0x5c9a34),
  grassB: C(0x7cb443),
  sand: C(0xe6d39b),
  wetSand: C(0xc4ad78),
  rock: C(0xa39d90),
  rockDark: C(0x8a8478),
  snow: C(0xf3f6fa),
};

export class Terrain {
  constructor() {
    this.heights = new Float32Array(GRID * GRID);
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        this.heights[j * GRID + i] = rawHeight(-HALF + i * CELL, -HALF + j * CELL);
      }
    }
    this.mesh = this.#buildMesh();
    this.heightTexture = this.#buildHeightTexture();
  }

  #buildMesh() {
    const count = GRID * GRID;
    const positions = new Float32Array(count * 3);
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const k = j * GRID + i;
        positions[k * 3] = -HALF + i * CELL;
        positions[k * 3 + 1] = this.heights[k];
        positions[k * 3 + 2] = -HALF + j * CELL;
      }
    }
    // Same triangulation as heightAt(): diagonal from (i, j+1) to (i+1, j).
    const index = new Uint32Array((GRID - 1) * (GRID - 1) * 6);
    let n = 0;
    for (let j = 0; j < GRID - 1; j++) {
      for (let i = 0; i < GRID - 1; i++) {
        const a = j * GRID + i;
        const b = (j + 1) * GRID + i;
        const c = j * GRID + i + 1;
        const d = (j + 1) * GRID + i + 1;
        index.set([a, b, c, c, b, d], n);
        n += 6;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();

    const normals = geo.attributes.normal.array;
    const colors = new Float32Array(count * 3);
    this.grassMask = new Float32Array(count);
    const col = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const x = positions[k * 3], h = positions[k * 3 + 1], z = positions[k * 3 + 2];
      const ny = normals[k * 3 + 1];
      col.copy(PALETTE.grassA).lerp(PALETTE.grassB, fbm(detailNoise, x * 0.03, z * 0.03, 2) * 0.5 + 0.5);
      const rock = Math.max(1 - smoothstep(0.72, 0.84, ny), smoothstep(34, 40, h));
      col.lerp(detailNoise(x * 0.1, z * 0.1) > 0 ? PALETTE.rock : PALETTE.rockDark, rock);
      const sand = 1 - smoothstep(1.2, 2.2, h);
      col.lerp(h < -0.4 ? PALETTE.wetSand : PALETTE.sand, sand);
      col.lerp(PALETTE.snow, smoothstep(44, 48, h) * smoothstep(0.65, 0.75, ny));
      colors.set([col.r, col.g, col.b], k * 3);
      this.grassMask[k] = (1 - sand) * (1 - rock) * (1 - smoothstep(30, 36, h));
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mesh = new THREE.Mesh(geo, toonMaterial(0xffffff, { vertexColors: true }));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
  }

  // r = height, g = grass density; read by the grass and water shaders.
  #buildHeightTexture() {
    const data = new Float32Array(GRID * GRID * 4);
    for (let k = 0; k < GRID * GRID; k++) {
      data[k * 4] = this.heights[k];
      data[k * 4 + 1] = this.grassMask[k];
    }
    const tex = new THREE.DataTexture(data, GRID, GRID, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }

  // Exact height of the rendered triangle surface.
  heightAt(x, z) {
    const gx = (x + HALF) / CELL;
    const gz = (z + HALF) / CELL;
    if (gx < 0 || gz < 0 || gx >= GRID - 1 || gz >= GRID - 1) return SEA_FLOOR;
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const H = this.heights;
    const h00 = H[j * GRID + i], h10 = H[j * GRID + i + 1];
    const h01 = H[(j + 1) * GRID + i], h11 = H[(j + 1) * GRID + i + 1];
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.0;
    return out.set(
      this.heightAt(x - e, z) - this.heightAt(x + e, z),
      2 * e,
      this.heightAt(x, z - e) - this.heightAt(x, z + e)
    ).normalize();
  }
}
