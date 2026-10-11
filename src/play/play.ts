import { rgbCss, textColorFor } from '../generator/color';
import { confetti } from '../finish/confetti';
import { downloadCanvas, showFinish } from '../finish/finish';
import type { RGB } from '../puzzle/types';
import { loadProgress, loadPuzzle, saveProgress } from '../storage/db';
import { h, icon } from '../util/dom';
import { PaletteBar } from './palette';
import { Renderer, type PaintState } from './renderer';
import { Viewport } from './viewport';

type Action =
  | { kind: 'fill'; regions: number[] }
  | { kind: 'paint'; changes: { r: number; prev: RGB | undefined; next: RGB }[] };

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export async function showPlay(root: HTMLElement, id: string): Promise<() => void> {
  const [puzzle, progress] = await Promise.all([loadPuzzle(id), loadProgress(id)]);
  if (!puzzle) {
    root.replaceChildren(
      h('div', { class: 'empty' }, h('p', {}, "Hmm, we couldn't find that picture."), h('a', { class: 'btn primary', href: '#/' }, 'Back to pictures')),
    );
    return () => {};
  }

  const n = puzzle.regionCount;
  const K = puzzle.palette.length;
  const { regionColor, regionMap } = puzzle;

  // ---- state ----
  const filled = new Uint8Array(n + 1);
  const fillOrder: number[] = [];
  const totals = new Int32Array(K);
  const done = new Int32Array(K);
  for (let r = 1; r <= n; r++) totals[regionColor[r]]++;
  for (const r of progress?.fillOrder ?? []) {
    if (r < 1 || r > n || filled[r]) continue;
    filled[r] = 1;
    fillOrder.push(r);
    done[regionColor[r]]++;
  }
  let filledCount = fillOrder.length;
  let completed = filledCount === n;
  const state: PaintState = { filled, selected: -1, overrides: new Map(progress?.overrides ?? []) };
  let freePaint = false;
  let freeColor: RGB = puzzle.palette[0];
  const undoStack: Action[] = [];
  const redoStack: Action[] = [];
  let hintCursor = 0;
  let replaying = false;

  // ---- DOM ----
  const canvas = h('canvas', { class: 'stage-canvas' });
  const bubble = h('div', { class: 'bubble', 'aria-live': 'polite' });
  const stage = h('div', { class: 'stage' }, canvas, bubble);
  const progressFill = h('span', { class: 'progress-fill' });
  const progressText = h('span', { class: 'progress-text' });
  const iconBtn = (label: string, name: Parameters<typeof icon>[0], onClick: () => void) =>
    h('button', { class: 'icon-btn', title: label, 'aria-label': label, onClick }, icon(name));
  const undoBtn = iconBtn('Undo (Z)', 'undo', () => undo());
  const redoBtn = iconBtn('Redo (Y)', 'redo', () => redo());
  const hintBtn = h('button', { class: 'btn hint-btn', title: 'Find a section you missed (H)', onClick: () => hint() }, '🔍 Find one');
  const freeBtn = h('button', { class: 'btn', onClick: () => setFreePaint(!freePaint) }, '🎨 Free paint');
  const cheerBtn = h('button', { class: 'btn primary', onClick: () => openFinish() }, '🎉 Finished!');
  const toolbar = h(
    'header',
    { class: 'play-bar' },
    h('a', { class: 'icon-btn back', href: '#/', title: 'Back to pictures', 'aria-label': 'Back to pictures' }, icon('back')),
    h('div', { class: 'play-title' }, h('strong', {}, puzzle.title), h('div', { class: 'progress' }, progressFill, progressText)),
    h('div', { class: 'spacer' }),
    hintBtn,
    freeBtn,
    cheerBtn,
    h('div', { class: 'btn-group' }, undoBtn, redoBtn),
    h(
      'div',
      { class: 'btn-group' },
      iconBtn('Zoom out (−)', 'minus', () => zoomCenter(1 / 1.4)),
      iconBtn('Fit to screen (F)', 'fit', () => animateTo(fitTarget())),
      iconBtn('Zoom in (+)', 'plus', () => zoomCenter(1.4)),
    ),
  );
  const palette = new PaletteBar(puzzle.palette, totals, (i) => selectColor(i));
  root.replaceChildren(h('div', { class: `play mode-${puzzle.mode}` }, toolbar, stage, palette.el));

  const renderer = new Renderer(canvas, puzzle, state);
  const view = new Viewport(puzzle.width, puzzle.height, puzzle.mode === 'pixel' ? 90 : 12);

  // ---- rendering ----
  let raf = 0;
  const requestRender = () => { if (!raf) raf = requestAnimationFrame(frame); };
  function frame() {
    raf = 0;
    if (renderer.draw(view, !replaying)) requestRender();
  }

  let sized = false;
  const ro = new ResizeObserver(() => {
    const w = stage.clientWidth, hh = stage.clientHeight;
    if (!w || !hh) return;
    renderer.resize(w, hh, window.devicePixelRatio || 1);
    if (!sized) { view.fit(w, hh); sized = true; } else view.clamp(w, hh);
    requestRender();
  });
  ro.observe(stage);

  function fitTarget() {
    const v = new Viewport(puzzle!.width, puzzle!.height, 1);
    v.fit(renderer.cssW, renderer.cssH);
    return { scale: v.scale, ox: v.ox, oy: v.oy };
  }

  let anim = 0;
  function animateTo(target: { scale: number; ox: number; oy: number }, then?: () => void) {
    cancelAnimationFrame(anim);
    const cw = renderer.cssW, ch = renderer.cssH;
    // Interpolate the point at screen center and log-scale, so zooming feels natural.
    const [sx, sy] = view.toPuzzle(cw / 2, ch / 2);
    const tx = (cw / 2 - target.ox) / target.scale, ty = (ch / 2 - target.oy) / target.scale;
    const s0 = Math.log(view.scale), s1 = Math.log(target.scale);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 450);
      const k = easeInOut(t);
      const s = Math.exp(s0 + (s1 - s0) * k);
      const cx = sx + (tx - sx) * k, cy = sy + (ty - sy) * k;
      view.scale = s;
      view.ox = cw / 2 - cx * s;
      view.oy = ch / 2 - cy * s;
      requestRender();
      if (t < 1) anim = requestAnimationFrame(step);
      else then?.();
    };
    anim = requestAnimationFrame(step);
  }

  function zoomCenter(f: number) {
    const t = new Viewport(puzzle!.width, puzzle!.height, 1);
    Object.assign(t, { scale: view.scale, ox: view.ox, oy: view.oy, minScale: view.minScale, maxScale: view.maxScale });
    t.zoomAt(f, renderer.cssW / 2, renderer.cssH / 2);
    animateTo({ scale: t.scale, ox: t.ox, oy: t.oy });
  }

  // ---- game logic ----
  function firstUnfinished(from = 0): number {
    for (let k = 0; k < K; k++) {
      const i = (from + k) % K;
      if (done[i] < totals[i]) return i;
    }
    return -1;
  }

  function selectColor(i: number) {
    if (freePaint || i < 0 || i >= K) return;
    const prev = state.selected;
    state.selected = i;
    renderer.paintColor(prev);
    renderer.paintColor(i);
    hintCursor = 0;
    palette.update(done, i);
    requestRender();
  }

  function fill(r: number): boolean {
    if (r <= 0 || filled[r]) return false;
    filled[r] = 1;
    fillOrder.push(r);
    done[regionColor[r]]++;
    filledCount++;
    renderer.paintRegion(r);
    return true;
  }

  function unfill(r: number) {
    if (!filled[r]) return;
    filled[r] = 0;
    const at = fillOrder.lastIndexOf(r);
    if (at >= 0) fillOrder.splice(at, 1);
    done[regionColor[r]]--;
    filledCount--;
    renderer.paintRegion(r);
  }

  function updateProgress() {
    const pct = n ? Math.floor((filledCount / n) * 100) : 100;
    progressFill.style.width = `${pct}%`;
    progressText.textContent = completed ? 'Done!' : `${pct}%`;
    undoBtn.toggleAttribute('disabled', undoStack.length === 0);
    redoBtn.toggleAttribute('disabled', redoStack.length === 0);
    hintBtn.hidden = completed;
    freeBtn.hidden = !completed;
    cheerBtn.hidden = !completed || freePaint;
    freeBtn.textContent = freePaint ? '✓ Done painting' : '🎨 Free paint';
    freeBtn.classList.toggle('primary', freePaint);
  }

  // When a color is finished it stays selected; she picks the next one herself.
  function afterChange() {
    const sel = state.selected;
    if (filledCount === n && !completed) {
      completed = true;
      state.selected = -1;
      renderer.paintColor(sel);
      saveNow();
      setTimeout(() => {
        confetti(puzzle!.palette.map(rgbCss));
        openFinish();
      }, 450);
    }
    palette.update(done, state.selected);
    updateProgress();
    scheduleSave();
    requestRender();
  }

  function regionAt(sx: number, sy: number): number {
    const [px, py] = view.toPuzzle(sx, sy);
    const x = Math.floor(px), y = Math.floor(py);
    if (x < 0 || y < 0 || x >= puzzle!.width || y >= puzzle!.height) return 0;
    return regionMap[y * puzzle!.width + x];
  }

  function paintOverride(r: number, changes: { r: number; prev: RGB | undefined; next: RGB }[]) {
    const prev = state.overrides.get(r);
    if (prev && prev.join() === freeColor.join()) return;
    changes.push({ r, prev, next: freeColor });
    state.overrides.set(r, freeColor);
    renderer.paintRegion(r);
  }

  /** Click on a section. Returns the regions changed (for undo). */
  function tapAt(sx: number, sy: number, stroke: number[], showWrong: boolean) {
    const r = regionAt(sx, sy);
    if (!r || filled[r]) return;
    if (regionColor[r] === state.selected) {
      if (fill(r)) stroke.push(r);
    } else if (showWrong) {
      showBubble(sx, sy, regionColor[r]);
    }
  }

  function commit(action: Action) {
    const empty = action.kind === 'fill' ? action.regions.length === 0 : action.changes.length === 0;
    if (empty) return;
    undoStack.push(action);
    redoStack.length = 0;
    afterChange();
  }

  function undo() {
    const a = undoStack.pop();
    if (!a || replaying) return;
    if (a.kind === 'fill') {
      for (const r of a.regions) unfill(r);
      if (completed && filledCount < n) completed = false;
    } else {
      for (const c of [...a.changes].reverse()) {
        if (c.prev) state.overrides.set(c.r, c.prev);
        else state.overrides.delete(c.r);
        renderer.paintRegion(c.r);
      }
    }
    redoStack.push(a);
    if (!completed && state.selected < 0) selectColor(firstUnfinished());
    afterChange();
  }

  function redo() {
    const a = redoStack.pop();
    if (!a || replaying) return;
    if (a.kind === 'fill') a.regions.forEach(fill);
    else for (const c of a.changes) { state.overrides.set(c.r, c.next); renderer.paintRegion(c.r); }
    undoStack.push(a);
    afterChange();
  }

  function hint() {
    if (completed || freePaint) return;
    let c = state.selected;
    if (c < 0 || done[c] >= totals[c]) {
      c = firstUnfinished();
      if (c < 0) return;
      selectColor(c);
    }
    const left = renderer.colorRegions[c].filter((r) => !filled[r]);
    if (!left.length) return;
    let r: number;
    if (puzzle!.mode === 'pixel') {
      // The closest missed square to where she's looking.
      const [cx, cy] = view.toPuzzle(renderer.cssW / 2, renderer.cssH / 2);
      const dist = (q: number) => (puzzle!.labelX[q] - cx) ** 2 + (puzzle!.labelY[q] - cy) ** 2;
      r = left.reduce((best, q) => (dist(q) < dist(best) ? q : best));
    } else {
      // Smallest first: those are the ones that are easy to miss.
      left.sort((a, b) => puzzle!.area[a] - puzzle!.area[b]);
      r = left[hintCursor++ % left.length];
    }
    const x = puzzle!.labelX[r], y = puzzle!.labelY[r];
    const want = puzzle!.mode === 'pixel' ? Math.max(view.scale, 34) : Math.max(view.fitScale, 24 / Math.max(puzzle!.labelR[r], 1));
    animateTo(view.target(x, y, want, renderer.cssW, renderer.cssH), () => {
      renderer.flashAt(x, y);
      requestRender();
    });
  }

  let bubbleTimer = 0;
  function showBubble(sx: number, sy: number, c: number) {
    const rgb = puzzle!.palette[c];
    bubble.replaceChildren(
      h('span', { class: 'bubble-dot', style: { background: rgbCss(rgb), color: textColorFor(rgb) } }, String(c + 1)),
      `That one is color ${c + 1}`,
    );
    bubble.style.left = `${sx}px`;
    bubble.style.top = `${sy}px`;
    bubble.classList.remove('show');
    void bubble.offsetWidth;
    bubble.classList.add('show');
    stage.classList.remove('nudge');
    void stage.offsetWidth;
    stage.classList.add('nudge');
    clearTimeout(bubbleTimer);
    bubbleTimer = window.setTimeout(() => bubble.classList.remove('show'), 1400);
  }

  function setFreePaint(on: boolean) {
    if (!completed) return;
    freePaint = on;
    undoStack.length = 0;
    redoStack.length = 0;
    if (on) palette.showFreePaint(freeColor, (rgb) => (freeColor = rgb));
    else palette.showNumbered(done, state.selected);
    stage.classList.toggle('free', on);
    updateProgress();
  }

  function openFinish() {
    showFinish({
      title: puzzle!.title,
      image: renderer.exportImage(900),
      onReplay: replay,
      onDownload: () => downloadCanvas(renderer.exportImage(), puzzle!.title),
      onFreePaint: () => setFreePaint(true),
    });
  }

  // ---- timelapse replay ----
  let replayRaf = 0;
  let replayEndTimer = 0;
  function replay() {
    if (replaying || fillOrder.length === 0) return;
    replaying = true;
    const temp = new Uint8Array(n + 1);
    state.filled = temp;
    renderer.paintAll();
    const order = fillOrder.slice();
    const duration = Math.min(9000, Math.max(2500, order.length * 35));
    const f = fitTarget();
    Object.assign(view, f);
    const start = performance.now();
    let i = 0;
    const tick = (now: number) => {
      if (!replaying) return;
      const target = Math.min(order.length, Math.ceil(((now - start) / duration) * order.length));
      while (i < target) {
        temp[order[i]] = 1;
        renderer.paintRegion(order[i]);
        i++;
      }
      renderer.draw(view, false);
      if (i < order.length) replayRaf = requestAnimationFrame(tick);
      else replayEndTimer = window.setTimeout(endReplay, 900);
    };
    replayRaf = requestAnimationFrame(tick);
  }

  function endReplay() {
    if (!replaying) return;
    replaying = false;
    cancelAnimationFrame(replayRaf);
    clearTimeout(replayEndTimer);
    state.filled = filled;
    renderer.paintAll();
    requestRender();
  }

  // ---- saving ----
  let saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 700);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    return saveProgress({
      id: puzzle!.id,
      title: puzzle!.title,
      mode: puzzle!.mode,
      sourceKey: puzzle!.sourceKey,
      fillOrder: fillOrder.slice(),
      overrides: [...state.overrides],
      completed,
      percent: n ? Math.floor((filledCount / n) * 100) : 100,
      thumbnail: renderer.thumbnail(),
      createdAt: progress?.createdAt ?? puzzle!.createdAt,
      updatedAt: Date.now(),
    });
  }
  const onHide = () => { if (document.visibilityState === 'hidden' && saveTimer) saveNow(); };
  document.addEventListener('visibilitychange', onHide);

  // ---- input ----
  let spaceDown = false;
  type Drag = { mode: 'pending' | 'pan' | 'paint'; sx: number; sy: number; lx: number; ly: number; stroke: number[]; changes: { r: number; prev: RGB | undefined; next: RGB }[] };
  let drag: Drag | null = null;
  const local = (e: PointerEvent | WheelEvent) => {
    const rect = stage.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top] as const;
  };

  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.addEventListener('pointerdown', (e) => {
    if (replaying) { endReplay(); return; }
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is already gone; drag still works within the stage.
    }
    const [x, y] = local(e);
    const panning = e.button === 1 || e.button === 2 || spaceDown;
    const painting = !panning && (puzzle!.mode === 'pixel' || freePaint);
    drag = { mode: panning ? 'pan' : painting ? 'paint' : 'pending', sx: x, sy: y, lx: x, ly: y, stroke: [], changes: [] };
    stage.classList.toggle('panning', panning);
    if (painting) paintAt(x, y, drag, true);
  });

  function paintAt(x: number, y: number, d: Drag, showWrong: boolean) {
    if (freePaint) {
      const r = regionAt(x, y);
      if (r) paintOverride(r, d.changes);
    } else {
      tapAt(x, y, d.stroke, showWrong);
    }
    requestRender();
  }

  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const [x, y] = local(e);
    if (drag.mode === 'pending' && Math.hypot(x - drag.sx, y - drag.sy) > 6) {
      drag.mode = 'pan';
      stage.classList.add('panning');
    }
    if (drag.mode === 'pan') {
      view.pan(x - drag.lx, y - drag.ly);
      view.clamp(renderer.cssW, renderer.cssH);
      requestRender();
    } else if (drag.mode === 'paint') {
      // Sample along the drag so fast strokes don't skip cells.
      const dist = Math.hypot(x - drag.lx, y - drag.ly);
      const steps = Math.max(1, Math.ceil(dist / Math.max(2, view.scale * 0.4)));
      for (let i = 1; i <= steps; i++) {
        paintAt(drag.lx + ((x - drag.lx) * i) / steps, drag.ly + ((y - drag.ly) * i) / steps, drag, false);
      }
      if (drag.stroke.length) {
        palette.update(done, state.selected);
        updateProgress();
      }
    }
    drag.lx = x;
    drag.ly = y;
  });

  const endDrag = (e: PointerEvent) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    stage.classList.remove('panning');
    if (d.mode === 'pending' && e.type === 'pointerup') {
      const [x, y] = local(e);
      tapAt(x, y, d.stroke, true);
    }
    if (d.changes.length) commit({ kind: 'paint', changes: d.changes });
    else if (d.stroke.length) commit({ kind: 'fill', regions: d.stroke });
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    cancelAnimationFrame(anim);
    const [x, y] = local(e);
    const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    view.zoomAt(Math.exp(-delta * (e.ctrlKey ? 0.012 : 0.0022)), x, y);
    view.clamp(renderer.cssW, renderer.cssH);
    requestRender();
  }, { passive: false });

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.target instanceof Element && e.target.closest('input, textarea')) || document.querySelector('.modal-backdrop')) return;
    const k = e.key.toLowerCase();
    if (k === ' ') {
      spaceDown = true;
      stage.classList.add('grab');
      e.preventDefault();
    } else if (/^[0-9]$/.test(k) && !e.metaKey && !e.ctrlKey) {
      selectColor(k === '0' ? 9 : Number(k) - 1);
    } else if (k === ']') {
      selectColor(firstUnfinished(state.selected + 1));
    } else if (k === '[') {
      for (let j = 1; j <= K; j++) {
        const i = (state.selected - j + K * 2) % K;
        if (done[i] < totals[i]) { selectColor(i); break; }
      }
    } else if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
    } else if (k === 'h') hint();
    else if (k === 'f') animateTo(fitTarget());
    else if (k === '+' || k === '=') zoomCenter(1.4);
    else if (k === '-' || k === '_') zoomCenter(1 / 1.4);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ') {
      spaceDown = false;
      stage.classList.remove('grab');
    }
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // ---- start ----
  if (!completed) selectColor(firstUnfinished());
  palette.update(done, state.selected);
  updateProgress();
  // Give the gallery a thumbnail right away for new pictures.
  if (!progress?.thumbnail) scheduleSave();

  return () => {
    if (saveTimer) saveNow();
    endReplay();
    ro.disconnect();
    cancelAnimationFrame(raf);
    cancelAnimationFrame(anim);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('visibilitychange', onHide);
    document.querySelector('.modal-backdrop')?.remove();
  };
}
