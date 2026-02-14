import { HELP_SECTIONS } from './controls.js';

function keyLabel(code) {
  if (!code) return '';
  if (code === 'Space') return 'Space';
  if (code === 'Escape') return 'Esc';
  if (code === 'Tab') return 'Tab';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Arrow')) return code.slice(5);
  if (code === 'Slash') return '/';
  return code;
}

function renderKeyGroup(group) {
  const el = document.createElement('div');
  el.className = 'help-keys';

  for (const code of group) {
    const k = document.createElement('kbd');
    k.textContent = keyLabel(code);
    el.appendChild(k);
  }

  return el;
}

function renderRow(row) {
  const wrap = document.createElement('div');
  wrap.className = 'help-row';

  const left = document.createElement('div');
  left.className = 'help-row-keys';

  if (row.keysText) {
    const k = document.createElement('kbd');
    k.textContent = row.keysText;
    left.appendChild(k);
  } else if (row.combos && row.combos.length > 0) {
    const joiner = row.joiner || 'or';
    for (let i = 0; i < row.combos.length; i++) {
      left.appendChild(renderKeyGroup(row.combos[i]));
      if (i < row.combos.length - 1) {
        const j = document.createElement('span');
        j.className = 'help-joiner';
        j.textContent = ` ${joiner} `;
        left.appendChild(j);
      }
    }
  }

  const right = document.createElement('div');
  right.className = 'help-row-text';
  right.textContent = row.text || '';

  wrap.appendChild(left);
  wrap.appendChild(right);
  return wrap;
}

export class HelpOverlay {
  constructor(overlayEl, contentEl) {
    this.overlayEl = overlayEl;
    this.contentEl = contentEl;

    this._build();
  }

  _build() {
    this.contentEl.innerHTML = '';

    for (const section of HELP_SECTIONS) {
      const s = document.createElement('div');
      s.className = 'help-section';

      const title = document.createElement('div');
      title.className = 'help-section-title';
      title.textContent = section.title;
      s.appendChild(title);

      for (const row of section.rows) {
        s.appendChild(renderRow(row));
      }

      this.contentEl.appendChild(s);
    }
  }

  isOpen() {
    return document.body.classList.contains('help-open');
  }

  open() {
    document.body.classList.add('help-open');
  }

  close() {
    document.body.classList.remove('help-open');
  }

  toggle() {
    if (this.isOpen()) this.close();
    else this.open();
  }
}

