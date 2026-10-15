import * as THREE from 'three';
import { WORLD_SIZE, GRID, WATER_LEVEL } from './terrain.js';
import { HEIGHT_SAMPLER_GLSL } from './heightGLSL.js';

const vertexShader = /* glsl */ `
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uLight;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
varying vec3 vWorld;
${HEIGHT_SAMPLER_GLSL}
#include <fog_pars_fragment>

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  float t = uTime;
  float depth = -terrainSample(vWorld.xz).r;
  vec3 col = mix(uShallow, uDeep, smoothstep(0.3, 6.0, depth));

  // cel-style wave patches
  float w = vnoise(vWorld.xz * 0.15 + vec2(t * 0.25, t * 0.1)) * vnoise(vWorld.xz * 0.32 - vec2(t * 0.18, -t * 0.22));
  col = mix(col, uShallow * 1.2, step(0.42, w) * 0.35);

  // shoreline foam: solid edge + moving bands
  float band = step(0.86, sin(depth * 7.0 - t * 2.2) * 0.5 + 0.5) * (1.0 - smoothstep(0.4, 1.4, depth));
  float foam = clamp(step(depth, 0.3) + band, 0.0, 1.0);
  col = mix(col, uFoam, foam);

  col *= uLight;

  // hard-edged sun glint
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vec3((vnoise(vWorld.xz * 0.6 + t * 0.4) - 0.5) * 0.3, 1.0, (vnoise(vWorld.xz * 0.6 - t * 0.35 + 7.0) - 0.5) * 0.3));
  float spec = pow(max(dot(reflect(-uSunDir, N), V), 0.0), 140.0);
  col += uSunColor * step(0.5, spec) * 0.9;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function createWater(terrain) {
  const geo = new THREE.PlaneGeometry(4000, 4000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uHeight: { value: null },
      uWorldSize: { value: WORLD_SIZE },
      uGrid: { value: GRID },
      uLight: { value: new THREE.Color(1, 1, 1) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uShallow: { value: new THREE.Color(0x52c7d8) },
      uDeep: { value: new THREE.Color(0x1d5fae) },
      uFoam: { value: new THREE.Color(0xf4fbff) },
    },
  ]);
  uniforms.uHeight.value = terrain.heightTexture;
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: true });
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = WATER_LEVEL;
  mesh.receiveShadow = false;

  return {
    mesh,
    update(time, dayNight) {
      uniforms.uTime.value = time;
      uniforms.uLight.value.copy(dayNight.flatLight);
      uniforms.uSunDir.value.copy(dayNight.lightDir);
      uniforms.uSunColor.value.copy(dayNight.sun.color).multiplyScalar(dayNight.isNight ? 0.35 : 1);
    },
  };
}
