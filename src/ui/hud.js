import { MODE_LABELS } from '../player/controller.js';

export class Hud {
  constructor(input) {
    this.input = input;
    this.clockIcon = document.getElementById('clock-icon');
    this.clockTime = document.getElementById('clock-time');
    this.clockDay = document.getElementById('clock-day');
    this.state = document.getElementById('state');
    this.help = document.getElementById('help');
    this.overlay = document.getElementById('overlay');
    this.fast = document.getElementById('fast');

    this.overlay.addEventListener('click', () => input.requestLock());
    input.element.addEventListener('click', () => {
      if (!input.locked) input.requestLock();
    });
    document.addEventListener('pointerlockchange', () => this.#syncOverlay());
    this.#syncOverlay();
  }

  #syncOverlay() {
    this.overlay.classList.toggle('hidden', this.input.locked);
  }

  update(dayNight, player) {
    if (this.input.pressed('KeyH')) this.help.classList.toggle('hidden');
    this.clockIcon.textContent = dayNight.isNight ? '🌙' : '☀️';
    this.clockTime.textContent = dayNight.clockText;
    this.clockDay.textContent = `${dayNight.day}일차`;
    this.state.textContent = MODE_LABELS[player.mode] ?? player.mode;
    this.fast.classList.toggle('hidden', dayNight.timeScale === 1);
  }
}
