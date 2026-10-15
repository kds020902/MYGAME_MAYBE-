import * as THREE from 'three';
import { toonGradient } from '../core/toon.js';
import { WORLD_SIZE, GRID } from './terrain.js';
import { HEIGHT_SAMPLER_GLSL } from './heightGLSL.js';
import { mulberry32 } from '../core/noise.js';

// A patch of instanced grass blades that wraps around the player, placed on the terrain on the GPU.
// Each blade keeps a fixed world position, so moving around looks like walking through a real field.
export function createGrass(terrain, { radius = 30, density = 16 } = {}) {
  const count = Math.floor((radius * 2) ** 2 * density);

  // Blade: 4 segments, x in [-0.5, 0.5], y in [0, 1]; scaled in the shader.
  const SEG = 4;
  const pos = [];
  const idx = [];
  for (let i = 0; i < SEG; i++) {
    const y = i / SEG;
    const w = 0.5 * (1 - y * 0.85);
    pos.push(-w, y, 0, w, y, 0);
  }
  pos.push(0, 1, 0);
  for (let i = 0; i < SEG - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }
  idx.push((SEG - 1) * 2, (SEG - 1) * 2 + 1, SEG * 2);
  const normals = new Float32Array(pos.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1; // lit like the ground below

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(idx);

  const rand = mulberry32(4242);
  const offsets = new Float32Array(count * 2);
  const rnd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    offsets[i * 2] = (rand() * 2 - 1) * radius;
    offsets[i * 2 + 1] = (rand() * 2 - 1) * radius;
    for (let k = 0; k < 4; k++) rnd[i * 4 + k] = rand();
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2));
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rnd, 4));
  geo.instanceCount = count;

  const uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uPlayer: { value: new THREE.Vector3() },
    uRadius: { value: radius },
    uHeight: { value: terrain.heightTexture },
    uWorldSize: { value: WORLD_SIZE },
    uGrid: { value: GRID },
  };

  const material = new THREE.MeshToonMaterial({ gradientMap: toonGradient, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */ `#include <common>
uniform float uTime;
uniform vec2 uCenter;
uniform vec3 uPlayer;
uniform float uRadius;
attribute vec2 aOffset;
attribute vec4 aRand;
varying vec3 vGrassColor;
${HEIGHT_SAMPLER_GLSL}`)
      .replace('#include <begin_vertex>', /* glsl */ `
float period = uRadius * 2.0;
vec2 wp = aOffset + period * floor((uCenter - aOffset) / period + 0.5);
vec2 hm = terrainSample(wp);
float fade = 1.0 - smoothstep(uRadius * 0.6, uRadius * 0.95, length(wp - uCenter));
float s = smoothstep(0.15, 0.6, hm.y) * fade * (0.6 + 0.6 * aRand.y);
float H = 0.42 * s;
float W = 0.11 * (0.7 + 0.6 * aRand.z);
float ang = aRand.x * 6.2831853;
vec2 side = vec2(-sin(ang), cos(ang));
float y = position.y;
vec3 p = vec3(side.x * position.x * W, y * H, side.y * position.x * W);

vec2 bend = vec2(cos(ang), sin(ang)) * (aRand.w - 0.5) * 0.35;
float wind = sin(uTime * 1.6 + wp.x * 0.12 + wp.y * 0.09) * 0.5 + sin(uTime * 2.7 + wp.x * 0.4 - wp.y * 0.3) * 0.25;
bend += normalize(vec2(1.0, 0.35)) * wind * 0.25;
vec2 toPlayer = wp - uPlayer.xz;
float push = (1.0 - smoothstep(0.2, 1.1, length(toPlayer))) * step(abs(uPlayer.y - hm.x), 1.5);
bend += normalize(toPlayer + 1e-4) * push * 0.9;
float y2 = y * y;
p.xz += bend * y2 * H;
p.y -= length(bend) * y2 * H * 0.3;

vec3 transformed = vec3(wp.x, hm.x - 0.03, wp.y) + p;
if (s < 0.06) transformed = vec3(0.0, -1000.0, 0.0);

vGrassColor = mix(vec3(0.11, 0.27, 0.05), vec3(0.40, 0.62, 0.13), y) * (0.85 + 0.3 * aRand.z);
float flower = step(0.975, aRand.w) * step(0.99, y);
vGrassColor = mix(vGrassColor, aRand.y > 0.5 ? vec3(1.0, 0.95, 0.85) : vec3(1.0, 0.72, 0.12), flower);
`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrassColor;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vGrassColor;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
  };

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;

  const forward = new THREE.Vector3();
  return {
    mesh,
    update(time, playerPos, camera) {
      uniforms.uTime.value = time;
      uniforms.uPlayer.value.copy(playerPos);
      camera.getWorldDirection(forward);
      // Shift the patch ahead of the player so more of it is in view.
      uniforms.uCenter.value.set(playerPos.x + forward.x * radius * 0.4, playerPos.z + forward.z * radius * 0.4);
    },
  };
}
