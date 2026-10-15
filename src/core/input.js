// Keyboard + mouse state. `down` = held, `pressed` = went down this frame.
export class Input {
  constructor(element) {
    this.element = element;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.wheel = 0;

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.justPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseX += e.movementX;
        this.mouseY += e.movementY;
      }
    });
    element.addEventListener('wheel', (e) => {
      this.wheel += e.deltaY;
      e.preventDefault();
    }, { passive: false });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get locked() {
    return document.pointerLockElement === this.element;
  }

  requestLock() {
    const p = this.element.requestPointerLock?.();
    if (p && p.catch) p.catch(() => {});
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  pressed(...codes) {
    return codes.some((c) => this.justPressed.has(c));
  }

  consumeMouse() {
    const m = { x: this.mouseX, y: this.mouseY, wheel: this.wheel };
    this.mouseX = this.mouseY = this.wheel = 0;
    return m;
  }

  endFrame() {
    this.justPressed.clear();
  }
}
