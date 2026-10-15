import * as THREE from 'three';
import { toonMaterial, addOutline } from '../core/toon.js';

// Body measurements (metres). The model faces +Z; its left side is +X.
const LEG_TOP = 0.05;
const THIGH = 0.36;
const SHIN = 0.33;
const FOOT_H = 0.07;
export const STAND_HIPS = LEG_TOP + THIGH + SHIN + FOOT_H;
const PIVOT_Y = 0.48; // centre of the tucked body while rolling

const COLORS = {
  skin: 0xffd7b5,
  hair: 0x5b3420,
  tunic: 0x2e9c8c,
  pants: 0xefe3c4,
  boots: 0x5e3d27,
  belt: 0x47301f,
  scarf: 0xd8483c,
  bag: 0x9a6a3e,
  glove: 0x7a4b2a,
  eye: 0x1c1c28,
  white: 0xffffff,
  cheek: 0xff9b9b,
};

// Every animated joint angle / offset. Poses are plain objects with these keys.
const CHANNELS = [
  'hipsY', 'hipsX', 'hipsZ', 'spineX', 'spineY', 'spineZ', 'neckX', 'neckY',
  'shLx', 'shLz', 'elL', 'shRx', 'shRz', 'elR',
  'hpL', 'knL', 'hzL', 'hpR', 'knR', 'hzR', 'ftL', 'ftR',
];

// Vertical reach of a leg for the given hip pitch, knee bend and hip spread.
function legExtent(hp, kn, hz) {
  return LEG_TOP + (THIGH * Math.cos(hp) + SHIN * Math.cos(hp + kn)) * Math.cos(hz) + FOOT_H;
}

function basePose() {
  return {
    hipsY: STAND_HIPS, hipsX: 0, hipsZ: 0, spineX: 0, spineY: 0, spineZ: 0, neckX: 0, neckY: 0,
    shLx: 0, shLz: 0.12, elL: -0.15, shRx: 0, shRz: -0.12, elR: -0.15,
    hpL: 0, knL: 0.03, hzL: 0.04, hpR: 0, knR: 0.03, hzR: -0.04, ftL: 0, ftR: 0,
  };
}

// Put the lowest foot on the ground.
function ground(p, offset = 0) {
  p.hipsY = Math.max(legExtent(p.hpL, p.knL, p.hzL), legExtent(p.hpR, p.knR, p.hzR)) + offset;
  return p;
}

function flatFeet(p, k = 1) {
  p.ftL = -(p.hpL + p.knL) * k;
  p.ftR = -(p.hpR + p.knR) * k;
}

function lerpPose(a, b, t) {
  const out = {};
  for (const c of CHANNELS) out[c] = a[c] + (b[c] - a[c]) * t;
  return out;
}

const swing = (v, pow = 1.5) => Math.pow(Math.max(0, v), pow);

const POSES = {
  idle(ph, t) {
    const p = basePose();
    const b = Math.sin(t * 1.8);
    p.spineX = 0.03 + 0.02 * b;
    p.neckX = -0.02 * b;
    p.shLz = 0.12 + 0.03 * b;
    p.shRz = -0.12 - 0.03 * b;
    p.knL = p.knR = 0.05;
    flatFeet(p);
    return ground(p);
  },

  walk(ph) {
    const p = basePose();
    const a = Math.sin(ph), c = Math.cos(ph);
    p.hpL = -0.5 * a;
    p.hpR = 0.5 * a;
    p.knL = 0.1 + 0.85 * swing(c);
    p.knR = 0.1 + 0.85 * swing(-c);
    p.shLx = 0.45 * a;
    p.shRx = -0.45 * a;
    p.elL = p.elR = -0.35;
    p.spineX = 0.06;
    p.spineY = 0.1 * a;
    p.neckY = -0.08 * a;
    flatFeet(p, 0.8);
    return ground(p);
  },

  run(ph) {
    const p = basePose();
    const a = Math.sin(ph), c = Math.cos(ph);
    p.hpL = -0.8 * a;
    p.hpR = 0.8 * a;
    p.knL = 0.3 + 1.5 * swing(c, 1.2);
    p.knR = 0.3 + 1.5 * swing(-c, 1.2);
    p.shLx = 0.85 * a;
    p.shRx = -0.85 * a;
    p.shLz = 0.2;
    p.shRz = -0.2;
    p.elL = p.elR = -1.5;
    p.spineX = 0.28;
    p.spineY = 0.16 * a;
    p.neckX = -0.18;
    p.neckY = -0.1 * a;
    flatFeet(p, 0.6);
    ground(p);
    p.hipsY = THREE.MathUtils.lerp(p.hipsY, STAND_HIPS - 0.05, 0.5) + 0.03 * Math.abs(c);
    return p;
  },

  crouch(ph, t) {
    const p = basePose();
    const b = Math.sin(t * 1.6);
    p.hpL = p.hpR = -1.05;
    p.knL = p.knR = 1.95;
    p.hzL = 0.16;
    p.hzR = -0.16;
    p.spineX = 0.5 + 0.02 * b;
    p.neckX = -0.4;
    p.shLx = p.shRx = -0.45;
    p.shLz = 0.25;
    p.shRz = -0.25;
    p.elL = p.elR = -0.9;
    flatFeet(p);
    return ground(p);
  },

  crouchWalk(ph) {
    const p = basePose();
    const a = Math.sin(ph), c = Math.cos(ph);
    p.hpL = -1.0 - 0.3 * a;
    p.hpR = -1.0 + 0.3 * a;
    p.knL = 1.85 + 0.45 * swing(c, 1);
    p.knR = 1.85 + 0.45 * swing(-c, 1);
    p.hzL = 0.14;
    p.hzR = -0.14;
    p.spineX = 0.5;
    p.spineY = 0.12 * a;
    p.neckX = -0.42;
    p.shLx = -0.5 + 0.25 * a;
    p.shRx = -0.5 - 0.25 * a;
    p.shLz = 0.25;
    p.shRz = -0.25;
    p.elL = p.elR = -0.9;
    flatFeet(p);
    return ground(p);
  },

  // On hands and knees: body tipped forward so the torso is horizontal.
  proneIdle(ph, t) {
    const p = basePose();
    const b = Math.sin(t * 1.6);
    p.hipsX = 1.32;
    p.hipsY = 0.44 + 0.005 * b;
    p.spineX = 0.05;
    p.neckX = -1.05;
    p.shLx = p.shRx = -1.32;
    p.shLz = 0.1;
    p.shRz = -0.1;
    p.elL = p.elR = -0.1;
    p.hpL = p.hpR = -1.32;
    p.knL = p.knR = 1.45;
    p.hzL = 0.12;
    p.hzR = -0.12;
    p.ftL = p.ftR = 0.5;
    return p;
  },

  crawl(ph, t) {
    const p = POSES.proneIdle(ph, t);
    const a = Math.sin(ph), c = Math.cos(ph);
    p.hpL = -1.32 - 0.28 * a;
    p.hpR = -1.32 + 0.28 * a;
    p.knL = 1.45 + 0.2 * swing(c, 1);
    p.knR = 1.45 + 0.2 * swing(-c, 1);
    // diagonal gait: right hand moves with left knee
    p.shRx = -1.32 - 0.32 * a;
    p.shLx = -1.32 + 0.32 * a;
    p.elR = -0.1 - 0.5 * swing(c, 1);
    p.elL = -0.1 - 0.5 * swing(-c, 1);
    p.hipsZ = 0.05 * a;
    p.spineY = 0.06 * a;
    p.neckY = -0.08 * a;
    p.hipsY = 0.44 + 0.015 * Math.abs(c);
    return p;
  },

  jump(ph, t, s) {
    const rising = basePose();
    rising.hpL = -1.0; rising.knL = 1.5;
    rising.hpR = 0.15; rising.knR = 0.5;
    rising.shLx = 0.6; rising.shRx = -1.4;
    rising.elL = -0.4; rising.elR = -0.6;
    rising.spineX = 0.1;
    flatFeet(rising, 0.5);

    const falling = basePose();
    falling.hpL = -0.45; falling.knL = 0.5;
    falling.hpR = -0.1; falling.knR = 0.25;
    falling.shLx = falling.shRx = -0.3;
    falling.shLz = 1.0; falling.shRz = -1.0;
    falling.elL = falling.elR = -0.3;
    falling.spineX = 0.05;
    falling.neckX = 0.1;
    flatFeet(falling, 0.5);

    const p = lerpPose(falling, rising, THREE.MathUtils.clamp(s.vy / 6, -1, 1) * 0.5 + 0.5);
    p.hipsY = STAND_HIPS;
    return p;
  },

  // Tucked ball; the body itself spins around PIVOT_Y (see update()).
  roll(ph, t, s) {
    const p = basePose();
    p.hpL = p.hpR = -2.2;
    p.knL = p.knR = 2.4;
    p.hzL = 0.1;
    p.hzR = -0.1;
    p.spineX = 1.0;
    p.neckX = 0.6;
    p.shLx = p.shRx = -1.2;
    p.shLz = 0.3;
    p.shRz = -0.3;
    p.elL = p.elR = -1.6;
    p.ftL = p.ftR = 0.3;
    p.hipsY = PIVOT_Y;
    if (s.rollT > 0.8) return lerpPose(p, POSES.idle(ph, t), (s.rollT - 0.8) / 0.2);
    return p;
  },
};

// How fast the gait cycle advances per metre travelled.
const STRIDE = { walk: 2.9, run: 1.75, crouchWalk: 3.4, crawl: 4.5 };

export class Character {
  constructor() {
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.pivot.position.y = PIVOT_Y;
    this.root.add(this.pivot);
    this.hips = new THREE.Group();
    this.pivot.add(this.hips);
    this.#build();

    this.phase = 0;
    this.time = 0;
    this.current = POSES.idle(0, 0);
    this.#applyPose();
  }

  #part(parent, geo, color, pos = [0, 0, 0], scale = null, rot = null, { outline = true, material = null } = {}) {
    const mesh = new THREE.Mesh(geo, material ?? toonMaterial(color));
    mesh.position.set(...pos);
    if (scale) mesh.scale.set(...scale);
    if (rot) mesh.rotation.set(...rot);
    mesh.castShadow = true;
    parent.add(mesh);
    if (outline) addOutline(mesh);
    return mesh;
  }

  #build() {
    const S = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
    const Cap = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 14);

    // Pelvis and torso
    this.#part(this.hips, S(0.16), COLORS.pants, [0, -0.03, 0], [1.2, 0.75, 1]);
    this.spine = new THREE.Group();
    this.spine.position.y = 0.02;
    this.hips.add(this.spine);
    this.#part(this.spine, new THREE.CylinderGeometry(0.2, 0.28, 0.26, 18), COLORS.tunic, [0, -0.05, 0]);
    this.#part(this.spine, Cap(0.17, 0.16), COLORS.tunic, [0, 0.22, 0], [1.12, 1, 0.86]);
    this.#part(this.spine, new THREE.TorusGeometry(0.2, 0.035, 8, 28), COLORS.belt, [0, 0.08, 0], [1.12, 0.92, 1], [Math.PI / 2, 0, 0]);
    this.#part(this.spine, S(0.14), COLORS.bag, [0, 0.24, -0.18], [1.15, 1.25, 0.6]);

    // Neck, scarf, head
    this.neck = new THREE.Group();
    this.neck.position.y = 0.45;
    this.spine.add(this.neck);
    this.#part(this.neck, new THREE.TorusGeometry(0.115, 0.055, 8, 20), COLORS.scarf, [0, -0.01, 0], null, [Math.PI / 2, 0, 0]);
    this.#part(this.neck, Cap(0.045, 0.16), COLORS.scarf, [0.07, -0.1, -0.13], [1, 1, 0.6], [0.5, 0, 0.3]);

    const head = new THREE.Group();
    head.position.set(0, 0.24, 0.01);
    this.neck.add(head);
    this.#part(head, S(0.26, 28, 20), COLORS.skin);
    const hairMat = toonMaterial(COLORS.hair, { side: THREE.DoubleSide });
    this.#part(head, new THREE.SphereGeometry(0.285, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, [0, 0.03, -0.015], null, [-0.42, 0, 0], { material: hairMat });
    this.#part(head, S(0.25), COLORS.hair, [0, -0.03, -0.075], [1.04, 1, 0.9]);
    for (const [x, y] of [[-0.11, 0.16], [0, 0.175], [0.11, 0.16]]) {
      this.#part(head, S(0.085, 12, 10), COLORS.hair, [x, y, 0.19]);
    }
    for (const sx of [-1, 1]) {
      this.#part(head, S(0.065, 12, 10), COLORS.skin, [sx * 0.255, -0.02, 0], [0.55, 1, 0.8]);
      this.#part(head, S(0.045, 12, 10), COLORS.eye, [sx * 0.095, -0.01, 0.232], [0.75, 1.15, 0.4], null, { outline: false });
      this.#part(head, S(0.016, 8, 6), COLORS.white, [sx * 0.095 + 0.012, 0.015, 0.252], null, null, { outline: false });
      this.#part(head, S(0.04, 10, 8), COLORS.cheek, [sx * 0.155, -0.085, 0.205], [1, 0.55, 0.35], null, { outline: false });
    }

    // Arms (L = +X, R = -X)
    this.shoulders = {};
    this.elbows = {};
    for (const [side, sx] of [['L', 1], ['R', -1]]) {
      const sh = new THREE.Group();
      sh.position.set(sx * 0.25, 0.38, 0);
      this.spine.add(sh);
      this.#part(sh, S(0.09), COLORS.tunic);
      this.#part(sh, Cap(0.062, 0.13), COLORS.tunic, [0, -0.11, 0]);
      const el = new THREE.Group();
      el.position.y = -0.24;
      sh.add(el);
      this.#part(el, Cap(0.055, 0.12), COLORS.skin, [0, -0.1, 0]);
      this.#part(el, S(0.072), COLORS.glove, [0, -0.22, 0], [1, 1.05, 0.9]);
      this.shoulders[side] = sh;
      this.elbows[side] = el;
    }

    // Legs
    this.thighs = {};
    this.knees = {};
    this.ankles = {};
    for (const [side, sx] of [['L', 1], ['R', -1]]) {
      const hp = new THREE.Group();
      hp.position.set(sx * 0.1, -LEG_TOP, 0);
      this.hips.add(hp);
      this.#part(hp, Cap(0.085, 0.19), COLORS.pants, [0, -0.18, 0]);
      const kn = new THREE.Group();
      kn.position.y = -THIGH;
      hp.add(kn);
      this.#part(kn, Cap(0.078, 0.17), COLORS.boots, [0, -0.165, 0]);
      const an = new THREE.Group();
      an.position.y = -SHIN;
      kn.add(an);
      this.#part(an, S(0.1), COLORS.boots, [0, -0.005, 0.05], [0.9, 0.65, 1.45]);
      this.thighs[side] = hp;
      this.knees[side] = kn;
      this.ankles[side] = an;
    }
  }

  /**
   * @param {number} dt
   * @param {{mode: string, speed: number, vy: number, rollT: number, landT: number}} s
   */
  update(dt, s) {
    this.time += dt;
    this.phase += s.speed * (STRIDE[s.mode] ?? 0) * dt;
    let target = POSES[s.mode](this.phase, this.time, s);

    // Short knee-bend when landing from a jump.
    if (s.landT > 0 && (s.mode === 'idle' || s.mode === 'walk' || s.mode === 'run')) {
      target = lerpPose(target, POSES.crouch(0, this.time), Math.min(1, s.landT / 0.2) * 0.55);
    }

    const k = s.mode === 'roll' ? 28 : 14;
    const a = 1 - Math.exp(-k * dt);
    for (const c of CHANNELS) this.current[c] += (target[c] - this.current[c]) * a;

    this.pivot.rotation.x = s.mode === 'roll' ? THREE.MathUtils.smoothstep(s.rollT, 0, 0.85) * Math.PI * 2 : 0;
    this.#applyPose();
  }

  #applyPose() {
    const p = this.current;
    this.hips.position.y = p.hipsY - PIVOT_Y;
    this.hips.rotation.set(p.hipsX, 0, p.hipsZ);
    this.spine.rotation.set(p.spineX, p.spineY, p.spineZ);
    this.neck.rotation.set(p.neckX, p.neckY, 0);
    this.shoulders.L.rotation.set(p.shLx, 0, p.shLz);
    this.shoulders.R.rotation.set(p.shRx, 0, p.shRz);
    this.elbows.L.rotation.x = p.elL;
    this.elbows.R.rotation.x = p.elR;
    this.thighs.L.rotation.set(p.hpL, 0, p.hzL);
    this.thighs.R.rotation.set(p.hpR, 0, p.hzR);
    this.knees.L.rotation.x = p.knL;
    this.knees.R.rotation.x = p.knR;
    this.ankles.L.rotation.x = p.ftL;
    this.ankles.R.rotation.x = p.ftR;
  }
}
