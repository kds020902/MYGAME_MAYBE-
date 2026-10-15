import * as THREE from 'three';

// 30 real minutes = 24 in-game hours.
export const REAL_SECONDS_PER_DAY = 30 * 60;
const TMP_COLOR = new THREE.Color();

// Look of the world at each hour; values in between are interpolated.
const KEYFRAMES = [
  { h: 0, top: 0x060a1e, horizon: 0x1a2446, light: 0x9fb2e8, li: 1.0, sky: 0x4a5f9e, ground: 0x1c2233, hi: 1.0 },
  { h: 4.6, top: 0x060a1e, horizon: 0x1a2446, light: 0x9fb2e8, li: 1.0, sky: 0x4a5f9e, ground: 0x1c2233, hi: 1.0 },
  { h: 5.6, top: 0x2d3f7c, horizon: 0xf2a07b, light: 0xffb27a, li: 1.7, sky: 0x9a9fcf, ground: 0x4a4038, hi: 1.25 },
  { h: 7.0, top: 0x3f86dc, horizon: 0xd4e9ff, light: 0xfff0d4, li: 2.4, sky: 0xbcdcff, ground: 0x5a5040, hi: 1.25 },
  { h: 12, top: 0x2f7fe6, horizon: 0xc4e4ff, light: 0xffffff, li: 2.9, sky: 0xc8e2ff, ground: 0x5f5545, hi: 1.35 },
  { h: 16.5, top: 0x3a7fd6, horizon: 0xd9ebff, light: 0xffeccc, li: 2.6, sky: 0xc0dcff, ground: 0x5a5040, hi: 1.25 },
  { h: 18.0, top: 0x40509a, horizon: 0xff9259, light: 0xff9a5c, li: 2.1, sky: 0xb09ab8, ground: 0x4d3c32, hi: 1.25 },
  { h: 19.2, top: 0x141b42, horizon: 0x53406e, light: 0x8f95d6, li: 0.9, sky: 0x4a5285, ground: 0x1c1d2c, hi: 0.95 },
  { h: 20.5, top: 0x060a1e, horizon: 0x1a2446, light: 0x9fb2e8, li: 1.0, sky: 0x4a5f9e, ground: 0x1c2233, hi: 1.0 },
  { h: 24, top: 0x060a1e, horizon: 0x1a2446, light: 0x9fb2e8, li: 1.0, sky: 0x4a5f9e, ground: 0x1c2233, hi: 1.0 },
].map((k) => ({
  ...k,
  top: new THREE.Color(k.top),
  horizon: new THREE.Color(k.horizon),
  light: new THREE.Color(k.light),
  sky: new THREE.Color(k.sky),
  ground: new THREE.Color(k.ground),
}));

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always on the far plane
}
`;

const skyFragment = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uSunGlow;
uniform float uStars;
uniform float uTime;
varying vec3 vDir;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.55, h));
  col = mix(col, uGround, smoothstep(0.0, -0.25, h));

  float sd = dot(d, uSunDir);
  float sunUp = smoothstep(-0.15, 0.05, uSunDir.y);
  col += uSunGlow * (pow(max(sd, 0.0), 6.0) * 0.35 + pow(max(sd, 0.0), 60.0) * 0.5) * sunUp;
  col = mix(col, vec3(1.0, 0.96, 0.82), smoothstep(0.9975, 0.9980, sd) * sunUp);

  float md = dot(d, uMoonDir);
  float moonUp = smoothstep(-0.05, 0.05, uMoonDir.y);
  col += vec3(0.5, 0.6, 0.9) * pow(max(md, 0.0), 150.0) * 0.25 * uStars;
  col = mix(col, vec3(0.93, 0.95, 1.0), smoothstep(0.9988, 0.9991, md) * moonUp);

  if (uStars > 0.001 && h > 0.0) {
    vec3 sp = d * 120.0;
    vec3 cell = floor(sp);
    float r = hash3(cell);
    float star = step(0.985, r) * (1.0 - smoothstep(0.05, 0.2, length(fract(sp) - 0.5)));
    float twinkle = 0.7 + 0.3 * sin(uTime * 3.0 + r * 100.0);
    col += vec3(star * twinkle * uStars * smoothstep(0.0, 0.15, h));
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class DayNight {
  constructor(scene, startHour = 8) {
    this.scene = scene;
    this.hours = startHour;
    this.day = 1;
    this.timeScale = 1;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sh = this.sun.shadow;
    sh.mapSize.set(2048, 2048);
    sh.camera.left = -40;
    sh.camera.right = 40;
    sh.camera.top = 40;
    sh.camera.bottom = -40;
    sh.camera.near = 1;
    sh.camera.far = 400;
    sh.bias = -0.0006;
    sh.normalBias = 0.09;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);

    this.skyUniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() },
      uMoonDir: { value: new THREE.Vector3() },
      uSunGlow: { value: new THREE.Color() },
      uStars: { value: 0 },
      uTime: { value: 0 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      })
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    scene.fog = new THREE.Fog(0xffffff, 90, 600);

    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.flatLight = new THREE.Color();
    this.isNight = false;
    this.elapsed = 0;
    this._k = { top: new THREE.Color(), horizon: new THREE.Color(), light: new THREE.Color(), sky: new THREE.Color(), ground: new THREE.Color(), li: 0, hi: 0 };
    this.#apply(new THREE.Vector3(), null);
  }

  #sample(h) {
    let i = 0;
    while (i < KEYFRAMES.length - 2 && h >= KEYFRAMES[i + 1].h) i++;
    const a = KEYFRAMES[i];
    const b = KEYFRAMES[i + 1];
    const t = THREE.MathUtils.smoothstep(h, a.h, b.h);
    const k = this._k;
    for (const key of ['top', 'horizon', 'light', 'sky', 'ground']) k[key].lerpColors(a[key], b[key], t);
    k.li = THREE.MathUtils.lerp(a.li, b.li, t);
    k.hi = THREE.MathUtils.lerp(a.hi, b.hi, t);
    return k;
  }

  update(dt, focus, camera) {
    this.elapsed += dt;
    this.hours += (dt * 24 * this.timeScale) / REAL_SECONDS_PER_DAY;
    while (this.hours >= 24) {
      this.hours -= 24;
      this.day++;
    }
    this.#apply(focus, camera);
  }

  #apply(focus, camera) {
    const k = this.#sample(this.hours);

    // Sun rises in the east (+X) at 06:00 and sets in the west at 18:00; the moon is opposite.
    const theta = ((this.hours - 6) / 12) * Math.PI;
    this.sunDir.set(Math.cos(theta), Math.sin(theta), -0.35).normalize();
    this.moonDir.set(-Math.cos(theta), -Math.sin(theta), -0.25).normalize();
    this.isNight = this.sunDir.y < 0;
    this.lightDir.copy(this.isNight ? this.moonDir : this.sunDir);
    this.lightDir.y = Math.max(this.lightDir.y, 0.18); // keep shadows from stretching forever at dawn/dusk
    this.lightDir.normalize();

    // Shadow camera follows the player, snapped to whole metres to reduce shimmering.
    const fx = Math.round(focus.x), fz = Math.round(focus.z);
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx, focus.y, fz).addScaledVector(this.lightDir, 150);
    this.sun.color.copy(k.light);
    this.sun.intensity = k.li;
    this.hemi.color.copy(k.sky);
    this.hemi.groundColor.copy(k.ground);
    this.hemi.intensity = k.hi;

    this.scene.fog.color.copy(k.horizon);

    const u = this.skyUniforms;
    u.uTop.value.copy(k.top);
    u.uHorizon.value.copy(k.horizon);
    u.uGround.value.copy(k.horizon).multiplyScalar(0.8);
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.copy(this.moonDir);
    u.uSunGlow.value.copy(k.light);
    u.uStars.value = THREE.MathUtils.smoothstep(-this.sunDir.y, -0.05, 0.25);
    u.uTime.value = this.elapsed;
    if (camera) this.sky.position.copy(camera.position);

    // Approximate light on an upward-facing surface, for custom shaders (water).
    this.flatLight.copy(k.light).multiplyScalar(k.li * this.lightDir.y).add(TMP_COLOR.copy(k.sky).multiplyScalar(k.hi)).multiplyScalar(1 / Math.PI);
  }

  get clockText() {
    const h = Math.floor(this.hours);
    const m = Math.floor((this.hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
