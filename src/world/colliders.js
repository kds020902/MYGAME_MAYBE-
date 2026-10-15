// Circle colliders on the XZ plane, bucketed in a uniform grid.
export class ColliderGrid {
  constructor(cell = 8) {
    this.cell = cell;
    this.cells = new Map();
  }

  #key(cx, cz) {
    return `${cx},${cz}`;
  }

  add(x, z, r) {
    const key = this.#key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key).push({ x, z, r });
  }

  #forNear(x, z, fn) {
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = this.cells.get(this.#key(cx + dx, cz + dz));
        if (list) for (const c of list) fn(c);
      }
    }
  }

  // Push `pos` (Vector3) out of any collider it overlaps.
  resolve(pos, radius) {
    this.#forNear(pos.x, pos.z, (c) => {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (d < min && d > 1e-5) {
        const k = (min - d) / d;
        pos.x += dx * k;
        pos.z += dz * k;
      }
    });
  }

  isFree(x, z, dist) {
    let free = true;
    this.#forNear(x, z, (c) => {
      if (Math.hypot(x - c.x, z - c.z) < dist) free = false;
    });
    return free;
  }
}
