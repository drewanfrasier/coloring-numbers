import { h, icon } from '../util/dom';

export function downloadCanvas(canvas: HTMLCanvasElement, title: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `${title.replace(/[^\w\- ]+/g, '').trim() || 'my-picture'}.png` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, 'image/png');
}

interface FinishOptions {
  title: string;
  image: HTMLCanvasElement;
  onReplay: () => void;
  onDownload: () => void;
  onFreePaint: () => void;
}

const CHEERS = ['Amazing work!', 'You did it!', 'Masterpiece!', 'Beautiful!', 'So colorful!', 'Fantastic!'];

/** The "you finished!" card. Returns a function that closes it. */
export function showFinish(opts: FinishOptions): () => void {
  const preview = opts.image;
  preview.className = 'finish-image';
  const close = () => {
    backdrop.classList.remove('show');
    window.removeEventListener('keydown', onKey);
    setTimeout(() => backdrop.remove(), 250);
  };
  const action = (fn: () => void) => () => { close(); fn(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };

  const card = h(
    'div',
    { class: 'finish-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Picture finished' },
    h('button', { class: 'icon-btn finish-close', 'aria-label': 'Close', onClick: close }, icon('close')),
    h('h2', {}, CHEERS[Math.floor(Math.random() * CHEERS.length)]),
    h('p', { class: 'finish-sub' }, `You finished “${opts.title}”`),
    h('div', { class: 'finish-frame' }, preview),
    h(
      'div',
      { class: 'finish-actions' },
      h('button', { class: 'btn', onClick: action(opts.onReplay) }, '▶ Watch replay'),
      h('button', { class: 'btn', onClick: opts.onDownload }, '⬇ Save picture'),
      h('button', { class: 'btn', onClick: action(opts.onFreePaint) }, '🎨 Free paint'),
      h('a', { class: 'btn primary', href: '#/' }, 'Color another →'),
    ),
  );
  const backdrop = h('div', { class: 'modal-backdrop', onClick: (e: Event) => { if (e.target === backdrop) close(); } }, card);
  document.body.append(backdrop);
  window.addEventListener('keydown', onKey);
  requestAnimationFrame(() => backdrop.classList.add('show'));
  return close;
}
