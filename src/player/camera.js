import * as THREE from 'three';

// Orbit camera behind the player: mouse to look around, wheel to zoom.
export class ThirdPersonCamera {
  constructor(camera, input, terrain, colliders) {
    this.camera = camera;
    this.input = input;
    this.terrain = terrain;
    this.colliders = colliders;
    this.yaw = 0; // direction the camera looks, 0 = +Z
    this.pitch = 0.32;
    this.distance = 6.5;
    this.target = new THREE.Vector3();
    this.initialized = false;
  }

  update(dt, playerPos, eyeHeight) {
    const m = this.input.consumeMouse();
    this.yaw -= m.x * 0.0022;
    this.pitch = THREE.MathUtils.clamp(this.pitch + m.y * 0.0022, -0.45, 1.25);
    this.distance = THREE.MathUtils.clamp(this.distance + m.wheel * 0.006, 2.5, 14);

    const desiredY = playerPos.y + eyeHeight;
    if (!this.initialized) {
      this.target.set(playerPos.x, desiredY, playerPos.z);
      this.initialized = true;
    }
    const k = 1 - Math.exp(-12 * dt);
    this.target.x += (playerPos.x - this.target.x) * k;
    this.target.z += (playerPos.z - this.target.z) * k;
    this.target.y += (desiredY - this.target.y) * (1 - Math.exp(-6 * dt));

    const cp = Math.cos(this.pitch);
    const pos = this.camera.position;
    pos.set(
      this.target.x - Math.sin(this.yaw) * cp * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z - Math.cos(this.yaw) * cp * this.distance
    );
    this.colliders.resolve(pos, 0.6); // don't end up inside tree trunks or rocks
    const minY = this.terrain.heightAt(pos.x, pos.z) + 0.4;
    if (pos.y < minY) pos.y = minY;
    this.camera.lookAt(this.target);
  }
}
