import * as THREE from 'three';
import { WATER_LEVEL } from '../world/terrain.js';

const SPEED = { walk: 2.3, run: 6.2, crouch: 1.6, crawl: 1.0 };
const GRAVITY = 24;
const JUMP_VELOCITY = 8.2;
const ROLL_TIME = 0.65;
const ROLL_SPEED = 8.0;
const RADIUS = 0.35;
const MAX_WADE_DEPTH = 0.7;

export const MODE_LABELS = {
  idle: '대기',
  walk: '걷기',
  run: '달리기',
  jump: '점프',
  roll: '구르기',
  crouch: '앉기',
  crouchWalk: '앉아서 걷기',
  proneIdle: '엎드리기',
  crawl: '기어가기',
};

function dampAngle(current, target, lambda, dt) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * (1 - Math.exp(-lambda * dt));
}

export class PlayerController {
  constructor(character, terrain, colliders, input) {
    this.character = character;
    this.terrain = terrain;
    this.colliders = colliders;
    this.input = input;

    this.pos = new THREE.Vector3(0, terrain.heightAt(0, 0), 0);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.grounded = true;
    this.airTime = 0;
    this.stance = 'stand'; // stand | crouch | prone
    this.facing = 0;
    this.roll = null;
    this.landT = 0;
    this.mode = 'idle';
  }

  update(dt, cameraYaw) {
    const inp = this.input;
    const f = (inp.down('KeyW', 'ArrowUp') ? 1 : 0) - (inp.down('KeyS', 'ArrowDown') ? 1 : 0);
    const r = (inp.down('KeyD', 'ArrowRight') ? 1 : 0) - (inp.down('KeyA', 'ArrowLeft') ? 1 : 0);
    // Camera-relative movement: forward = (sin yaw, cos yaw), right = (-cos yaw, sin yaw).
    let mx = Math.sin(cameraYaw) * f - Math.cos(cameraYaw) * r;
    let mz = Math.cos(cameraYaw) * f + Math.sin(cameraYaw) * r;
    const len = Math.hypot(mx, mz);
    const moving = len > 0.01;
    if (moving) {
      mx /= len;
      mz /= len;
    }
    const sprint = moving && inp.down('ShiftLeft', 'ShiftRight');

    if (!this.roll) {
      if (inp.pressed('KeyC')) this.stance = this.stance === 'crouch' ? 'stand' : 'crouch';
      if (inp.pressed('KeyZ')) this.stance = this.stance === 'prone' ? 'stand' : 'prone';
      if (sprint && this.stance === 'crouch') this.stance = 'stand';

      if (inp.pressed('Space') && this.grounded) {
        if (this.stance === 'prone') {
          this.stance = 'stand';
        } else {
          this.stance = 'stand';
          this.vy = JUMP_VELOCITY;
          this.grounded = false;
          this.airTime = 0.2;
        }
      }

      if (inp.pressed('KeyQ') && this.grounded && this.stance !== 'prone') {
        const dx = moving ? mx : Math.sin(this.facing);
        const dz = moving ? mz : Math.cos(this.facing);
        this.roll = { t: 0, dx, dz };
        this.facing = Math.atan2(dx, dz);
      }
    }

    // Horizontal velocity
    if (this.roll) {
      this.roll.t += dt / ROLL_TIME;
      const sp = ROLL_SPEED * (1 - 0.6 * Math.min(this.roll.t, 1));
      this.vel.set(this.roll.dx * sp, 0, this.roll.dz * sp);
      if (this.roll.t >= 1) this.roll = null;
    } else {
      let speed = 0;
      if (moving) {
        speed = this.stance === 'prone' ? SPEED.crawl : this.stance === 'crouch' ? SPEED.crouch : sprint ? SPEED.run : SPEED.walk;
        this.facing = dampAngle(this.facing, Math.atan2(mx, mz), 12, dt);
      }
      const accel = this.grounded ? 12 : 2.5;
      const k = 1 - Math.exp(-accel * dt);
      this.vel.x += (mx * speed - this.vel.x) * k;
      this.vel.z += (mz * speed - this.vel.z) * k;
    }

    // Move, refusing to walk into deep water (slide along the shore instead).
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    const minGround = WATER_LEVEL - MAX_WADE_DEPTH;
    if (this.terrain.heightAt(nx, nz) >= minGround) {
      this.pos.x = nx;
      this.pos.z = nz;
    } else if (this.terrain.heightAt(nx, this.pos.z) >= minGround) {
      this.pos.x = nx;
      this.vel.z = 0;
    } else if (this.terrain.heightAt(this.pos.x, nz) >= minGround) {
      this.pos.z = nz;
      this.vel.x = 0;
    } else {
      this.vel.x = this.vel.z = 0;
    }
    this.colliders.resolve(this.pos, RADIUS);

    // Vertical
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;
    const groundY = this.terrain.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= groundY) {
      if (!this.grounded && this.vy < -4) this.landT = 0.2;
      this.pos.y = groundY;
      this.vy = 0;
      this.grounded = true;
    } else if (this.grounded && this.vy <= 0 && this.pos.y - groundY < 0.4) {
      this.pos.y = groundY; // stick to the ground walking downhill
      this.vy = 0;
    } else {
      this.grounded = false;
    }
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    this.landT = Math.max(0, this.landT - dt);

    // Animation state
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.roll) this.mode = 'roll';
    else if (!this.grounded && (this.airTime > 0.15 || this.vy > 0)) this.mode = 'jump';
    else if (this.stance === 'prone') this.mode = hs > 0.2 ? 'crawl' : 'proneIdle';
    else if (this.stance === 'crouch') this.mode = hs > 0.2 ? 'crouchWalk' : 'crouch';
    else if (hs > 4.0) this.mode = 'run';
    else if (hs > 0.3) this.mode = 'walk';
    else this.mode = 'idle';

    this.character.root.position.copy(this.pos);
    this.character.root.rotation.y = this.facing;
    this.character.update(dt, {
      mode: this.mode,
      speed: hs,
      vy: this.vy,
      rollT: this.roll ? this.roll.t : 1,
      landT: this.landT,
    });
  }

  // Height the camera looks at, depending on posture.
  get eyeHeight() {
    if (this.mode === 'roll') return 1.0;
    if (this.stance === 'prone') return 0.8;
    if (this.stance === 'crouch') return 1.05;
    return 1.45;
  }
}
