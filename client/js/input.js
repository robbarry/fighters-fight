import * as MT from '/shared/message-types.js';
import { SHOUT_HELP, SHOUT_LETSGO, SHOUT_HI } from '/shared/message-types.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseWorldX = 0;
    this.mouseWorldY = 0;
    this.tabPressed = false;
    this.pendingShout = null;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyK') this.pendingShout = SHOUT_HELP;
      if (e.code === 'KeyL') this.pendingShout = SHOUT_LETSGO;
      if (e.code === 'KeyR') this.pendingShout = SHOUT_HI;
      if (e.code === 'Tab') {
        e.preventDefault();
        this.tabPressed = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    });
  }

  getMovement() {
    let dx = 0, dy = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
    return { dx, dy };
  }

  isAttacking() {
    return this.keys.has('Space');
  }

  isBlocking() {
    return this.keys.has('KeyQ');
  }

  consumeShout() {
    const s = this.pendingShout;
    this.pendingShout = null;
    return s;
  }

  consumeTab() {
    const t = this.tabPressed;
    this.tabPressed = false;
    return t;
  }

  toInputMessage() {
    const { dx, dy } = this.getMovement();
    return {
      t: MT.MSG_INPUT,
      dx, dy,
      atk: this.isAttacking() ? 1 : 0,
      blk: this.isBlocking() ? 1 : 0,
      ax: Math.round(this.mouseWorldX),
      ay: Math.round(this.mouseWorldY)
    };
  }
}
