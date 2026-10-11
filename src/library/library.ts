import { hashString } from '../generator/color';
import { rasterizeEmoji, rasterizeFile, rasterizeUrl } from '../generator/rasterize';
import { openOrCreate } from '../puzzle/create';
import type { Detail, Mode, PuzzleSettings, PuzzleSource } from '../puzzle/types';
import { h, toast } from '../util/dom';
import { BUILTINS } from './builtins';
import { ALL_EMOJI, EMOJI_CATEGORIES, type EmojiItem } from './emoji-data';

const SETTINGS_KEY = 'color-pop-settings-v2';
const DEFAULT_SETTINGS: PuzzleSettings = { mode: 'pixel', colors: 10, detail: 'medium' };

function loadSettings(): PuzzleSettings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return {
      mode: s.mode === 'outline' ? 'outline' : 'pixel',
      colors: Math.min(15, Math.max(4, Number(s.colors) || DEFAULT_SETTINGS.colors)),
      detail: ['low', 'medium', 'high'].includes(s.detail) ? s.detail : DEFAULT_SETTINGS.detail,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function storeSettings(s: PuzzleSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Private mode etc. Settings just won't stick.
  }
}

let starting = false;
async function start(source: PuzzleSource, title: string, settings: PuzzleSettings, raster: (side: number) => Promise<ImageData | null>) {
  if (starting) return;
  starting = true;
  try {
    const id = await openOrCreate(source, title, settings, raster);
    location.hash = `#/play/${id}`;
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Something went wrong. Try again!');
  } finally {
    starting = false;
  }
}

function segmented<T extends string>(name: string, options: [T, string][], value: T, onChange: (v: T) => void) {
  const wrap = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': name });
  for (const [v, label] of options) {
    const btn = h('button', { role: 'radio', 'aria-checked': String(v === value), onClick: () => {
      wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', 'false'));
      btn.setAttribute('aria-checked', 'true');
      onChange(v);
    } }, label);
    wrap.append(btn);
  }
  return wrap;
}

export function showLibrary(root: HTMLElement): () => void {
  const settings = loadSettings();
  const update = (patch: Partial<PuzzleSettings>) => {
    Object.assign(settings, patch);
    storeSettings(settings);
  };

  const startEmoji = (e: EmojiItem) =>
    start({ kind: 'emoji', ref: e.char }, e.title, settings, async (side) => rasterizeEmoji(e.char, side));
  const startBuiltin = (b: (typeof BUILTINS)[number]) =>
    start({ kind: 'builtin', ref: b.id }, b.title, settings, (side) => rasterizeUrl(b.url, side));
  const startPhoto = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast('That file is not a picture.');
      return;
    }
    const title = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'My Photo';
    start({ kind: 'photo', ref: `${file.name}:${file.size}:${file.lastModified}` }, title, settings, (side) => rasterizeFile(file, side));
  };

  // ---- picture of the day ----
  const today = new Date().toISOString().slice(0, 10);
  const pool = [...BUILTINS.map((b) => ({ b })), ...ALL_EMOJI.map((e) => ({ e }))];
  const daily = pool[hashString(today) % pool.length];
  const dailyArt = 'b' in daily
    ? h('img', { src: daily.b.url, alt: '' })
    : h('span', { class: 'daily-emoji' }, daily.e.char);
  const dailyTitle = 'b' in daily ? daily.b.title : daily.e.title;
  const dailyCard = h(
    'button',
    { class: 'daily', onClick: () => ('b' in daily ? startBuiltin(daily.b) : startEmoji(daily.e)) },
    h('div', { class: 'daily-art' }, dailyArt),
    h('div', { class: 'daily-text' }, h('span', { class: 'eyebrow' }, 'Picture of the day'), h('strong', {}, dailyTitle), h('span', { class: 'btn primary' }, 'Color it →')),
  );

  // ---- settings ----
  const colorsValue = h('output', { class: 'range-value' }, String(settings.colors));
  const colorsInput = h('input', { type: 'range', min: '4', max: '15', value: String(settings.colors), 'aria-label': 'Number of colors' }) as HTMLInputElement;
  colorsInput.addEventListener('input', () => {
    colorsValue.textContent = colorsInput.value;
    update({ colors: Number(colorsInput.value) });
  });
  const settingsCard = h(
    'section',
    { class: 'settings card' },
    h('h2', {}, 'How do you want to color?'),
    h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, 'Style'),
      segmented<Mode>('Style', [['pixel', '🟪 Pixel squares'], ['outline', '🖍️ Coloring book']], settings.mode, (mode) => update({ mode }))),
    h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, 'Colors'), h('div', { class: 'range' }, colorsInput, colorsValue)),
    h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, 'Detail'),
      segmented<Detail>('Detail', [['low', 'Bigger'], ['medium', 'Medium'], ['high', 'Tiny details']], settings.detail, (detail) => update({ detail }))),
    h('p', { class: 'hint-text' }, 'Every picture is free, as many times as you like.'),
  );

  // ---- photo upload ----
  const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true }) as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) startPhoto(f);
    fileInput.value = '';
  });
  const drop = h(
    'button',
    { class: 'dropzone', onClick: () => fileInput.click() },
    h('span', { class: 'dropzone-icon' }, '📷'),
    h('strong', {}, 'Use your own photo'),
    h('span', {}, 'Click to choose, or drop a picture here'),
    fileInput,
  );
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer?.files?.[0];
    if (f) startPhoto(f);
  });

  // ---- built-in pictures ----
  const builtinGrid = h('div', { class: 'tile-grid' },
    ...BUILTINS.map((b) =>
      h('button', { class: 'tile', title: b.title, onClick: () => startBuiltin(b) },
        h('img', { src: b.url, alt: '', loading: 'lazy' }), h('span', {}, b.title))));

  // ---- emoji ----
  let activeCat = 'all';
  const emojiGrid = h('div', { class: 'emoji-grid' });
  const search = h('input', { type: 'search', class: 'search', placeholder: 'Search emoji… (cat, pizza, rocket)', 'aria-label': 'Search emoji' }) as HTMLInputElement;
  const chips = h('div', { class: 'chips' });
  const renderEmoji = () => {
    const q = search.value.trim().toLowerCase();
    const list = q
      ? ALL_EMOJI.filter((e) => e.keywords.includes(q))
      : activeCat === 'all' ? ALL_EMOJI : EMOJI_CATEGORIES.find((c) => c.id === activeCat)!.items;
    emojiGrid.replaceChildren(
      ...list.map((e) => h('button', { class: 'emoji', title: e.title, 'aria-label': e.title, onClick: () => startEmoji(e) }, e.char)),
    );
    if (!list.length) emojiGrid.append(h('p', { class: 'muted' }, `No emoji found for “${q}”.`));
  };
  const cats = [{ id: 'all', label: '✨ All' }, ...EMOJI_CATEGORIES];
  for (const c of cats) {
    const chip = h('button', { class: 'chip', 'aria-pressed': String(c.id === activeCat), onClick: () => {
      activeCat = c.id;
      search.value = '';
      chips.querySelectorAll('.chip').forEach((el) => el.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');
      renderEmoji();
    } }, c.label);
    chips.append(chip);
  }
  search.addEventListener('input', renderEmoji);
  renderEmoji();

  root.replaceChildren(
    h('div', { class: 'library' },
      h('div', { class: 'hero' }, dailyCard, settingsCard),
      h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Pictures')), h('div', { class: 'tile-grid-wrap' }, drop, builtinGrid)),
      h('section', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', {}, 'Emoji'), h('span', { class: 'muted' }, `${ALL_EMOJI.length} to choose from`)),
        h('div', { class: 'emoji-tools' }, search, chips),
        emojiGrid),
    ),
  );
  return () => {};
}
