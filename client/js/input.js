import * as MT from '/shared/message-types.js';
import { KEYBINDS, SHOUT_BINDINGS } from './controls.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseWorldX = 0;
    this.mouseWorldY = 0;
    this.tabPressed = false;
    this.overviewPressed = false;
    this.pendingShout = null;

    window.addEventListener('keydown', (e) => {
      if (document.body.classList.contains('help-open')) return;

      this.keys.add(e.code);

      for (const b of SHOUT_BINDINGS) {
        if (b.codes.includes(e.code)) {
          this.pendingShout = b.shout;
          break;
        }
      }

      if (KEYBINDS.spectateNext.includes(e.code)) {
        e.preventDefault();
        this.tabPressed = true;
      }

      if (KEYBINDS.overviewToggle && KEYBINDS.overviewToggle.includes(e.code) && !e.repeat) {
        e.preventDefault();
        this.overviewPressed = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    this.mouseDown = false;
    this.rightMouseDown = false;

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (this._uiBlocked()) return;
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rightMouseDown = true;
    });

    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightMouseDown = false;
    });

    // Prevent context menu on right click
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  clearKeys() {
    this.keys.clear();
    this.mouseDown = false;
    this.rightMouseDown = false;
    this.tabPressed = false;
    this.overviewPressed = false;
    this.pendingShout = null;
  }

  _uiBlocked() {
    return document.body.classList.contains('help-open');
  }

  _hasAny(codes) {
    if (!codes) return false;
    for (const code of codes) {
      if (this.keys.has(code)) return true;
    }
    return false;
  }

  getMovement() {
    if (this._uiBlocked()) return { dx: 0, dy: 0 };
    let dx = 0, dy = 0;
    if (this._hasAny(KEYBINDS.moveLeft)) dx -= 1;
    if (this._hasAny(KEYBINDS.moveRight)) dx += 1;
    if (this._hasAny(KEYBINDS.moveUp)) dy -= 1;
    if (this._hasAny(KEYBINDS.moveDown)) dy += 1;
    return { dx, dy };
  }

  isAttacking() {
    if (this._uiBlocked()) return false;
    return this.mouseDown || this._hasAny(KEYBINDS.attack);
  }

  isBlocking() {
    if (this._uiBlocked()) return false;
    return this.rightMouseDown || this._hasAny(KEYBINDS.block);
  }

  isSpecial() {
    if (this._uiBlocked()) return false;
    return this._hasAny(KEYBINDS.special);
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

  consumeOverviewToggle() {
    const v = this.overviewPressed;
    this.overviewPressed = false;
    return v;
  }

  toInputMessage() {
    const { dx, dy } = this.getMovement();
    return {
      t: MT.MSG_INPUT,
      dx, dy,
      atk: this.isAttacking() ? 1 : 0,
      blk: this.isBlocking() ? 1 : 0,
      spc: this.isSpecial() ? 1 : 0,
      ax: Math.round(this.mouseWorldX),
      ay: Math.round(this.mouseWorldY)
    };
  }
}
