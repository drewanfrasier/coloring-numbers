type Child = Node | SVGElement | string | number | null | undefined | false;
type Props = Record<string, unknown>;

/** Tiny element builder: h('button', { class: 'x', onClick: fn }, 'Label'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') {
      // setProperty handles both regular properties and CSS variables (--x).
      for (const [prop, val] of Object.entries(v as Record<string, string>)) {
        el.style.setProperty(prop.startsWith('--') ? prop : prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), val);
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c != null && c !== false) el.append(typeof c === 'number' ? String(c) : c);
  return el;
}

const ICONS = {
  back: 'M15 18l-6-6 6-6',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 000 11H13',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  close: 'M6 6l12 12M18 6L6 18',
};

export function icon(name: keyof typeof ICONS): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<path d="${ICONS[name]}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  return svg;
}

export function toast(message: string, ms = 2600): void {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

export function busy(message: string): () => void {
  const el = h('div', { class: 'busy' }, h('div', { class: 'busy-card' }, h('div', { class: 'spinner' }), h('p', {}, message)));
  document.body.append(el);
  return () => el.remove();
}

export function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}
