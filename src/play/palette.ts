import { hexToRgb, rgbCss, rgbToHex, textColorFor } from '../generator/color';
import type { RGB } from '../puzzle/types';
import { h } from '../util/dom';

/** Bottom bar of numbered color swatches with a progress ring on each. */
export class PaletteBar {
  readonly el: HTMLElement;
  private buttons: HTMLButtonElement[] = [];

  constructor(
    private palette: RGB[],
    private totals: Int32Array,
    private onSelect: (index: number) => void,
  ) {
    this.el = h('div', { class: 'palette', role: 'toolbar', 'aria-label': 'Colors' });
    this.buildNumbered();
  }

  private buildNumbered(): void {
    this.el.replaceChildren();
    this.el.classList.remove('free');
    this.buttons = this.palette.map((rgb, i) => {
      const btn = h(
        'button',
        {
          class: 'swatch',
          style: { '--c': rgbCss(rgb), '--ink': textColorFor(rgb) },
          'aria-label': `Color ${i + 1}`,
          onClick: () => this.onSelect(i),
        },
        h('span', { class: 'swatch-dot' }, h('span', { class: 'swatch-num' }, String(i + 1))),
      );
      this.el.append(btn);
      return btn;
    });
  }

  update(filledCounts: Int32Array, selected: number): void {
    this.buttons.forEach((btn, i) => {
      const done = filledCounts[i] >= this.totals[i];
      const pct = this.totals[i] ? (filledCounts[i] / this.totals[i]) * 100 : 100;
      btn.style.setProperty('--p', `${pct}%`);
      btn.classList.toggle('done', done);
      btn.classList.toggle('selected', i === selected);
      btn.setAttribute('aria-pressed', String(i === selected));
      btn.title = done ? `Color ${i + 1}: all done!` : `Color ${i + 1}: ${this.totals[i] - filledCounts[i]} left`;
      const num = btn.querySelector('.swatch-num')!;
      num.textContent = done ? '✓' : String(i + 1);
      if (i === selected) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  /** Free-paint mode: any color, not just the picture's own. */
  showFreePaint(current: RGB, onPick: (rgb: RGB) => void): void {
    this.el.replaceChildren();
    this.el.classList.add('free');
    const extras = [
      '#ff4d6d', '#ff8fab', '#ff9f1c', '#ffd166', '#fff3b0', '#06d6a0', '#2ec4b6', '#118ab2',
      '#4361ee', '#7209b7', '#b5179e', '#8d5524', '#c68642', '#000000', '#6c757d', '#ffffff',
    ].map(hexToRgb);
    const seen = new Set<string>();
    const all = [...this.palette, ...extras].filter((c) => {
      const k = c.join(',');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const mark = (btn: HTMLElement) => {
      this.el.querySelectorAll('.selected').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
    for (const rgb of all) {
      const btn = h('button', {
        class: 'swatch plain',
        style: { '--c': rgbCss(rgb), '--p': '100%' },
        'aria-label': `Paint with ${rgbToHex(rgb)}`,
        onClick: () => { mark(btn); onPick(rgb); },
      }, h('span', { class: 'swatch-dot' }));
      if (rgb.join(',') === current.join(',')) btn.classList.add('selected');
      this.el.append(btn);
    }
    const input = h('input', { type: 'color', value: rgbToHex(current), 'aria-label': 'Pick any color' }) as HTMLInputElement;
    const custom = h('label', { class: 'swatch custom', title: 'Pick any color' }, h('span', { class: 'swatch-dot' }, '+'), input);
    input.addEventListener('input', () => {
      mark(custom);
      custom.style.setProperty('--c', input.value);
      onPick(hexToRgb(input.value));
    });
    this.el.append(custom);
  }

  showNumbered(filledCounts: Int32Array, selected: number): void {
    this.buildNumbered();
    this.update(filledCounts, selected);
  }
}
