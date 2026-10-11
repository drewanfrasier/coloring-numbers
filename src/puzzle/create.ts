import { generateInWorker } from '../generator/client';
import { hashString } from '../generator/color';
import { OUTLINE_SIZE } from '../generator/generate';
import { allProgress, saveProgress, savePuzzle } from '../storage/db';
import { busy, newId } from '../util/dom';
import type { PuzzleSettings, PuzzleSource } from './types';

const PIXEL_SOURCE_SIZE = 600;

/**
 * Turn a source into a playable puzzle and return its id. If she already has the same
 * picture with the same settings in progress, reopen that one instead of starting over.
 */
export async function openOrCreate(
  source: PuzzleSource,
  title: string,
  settings: PuzzleSettings,
  rasterize: (longSide: number) => Promise<ImageData | null>,
): Promise<string> {
  // Bump the trailing version when generator output changes, so old puzzles aren't reused.
  const sourceKey = `${source.kind}:${source.ref}:${settings.mode}:${settings.colors}:${settings.detail}:v2`;
  const existing = (await allProgress()).find((p) => p.sourceKey === sourceKey && !p.completed);
  if (existing) return existing.id;

  const done = busy('Making your picture…');
  try {
    const img = await rasterize(settings.mode === 'pixel' ? PIXEL_SOURCE_SIZE : OUTLINE_SIZE);
    if (!img) throw new Error("This computer can't draw that one. Try another!");
    const generated = await generateInWorker(img, {
      mode: settings.mode,
      colors: settings.colors,
      detail: settings.detail,
      smooth: source.kind === 'photo',
      seed: hashString(sourceKey),
    });
    if (generated.regionCount === 0) throw new Error('That picture came out empty. Try another!');
    const id = newId();
    const now = Date.now();
    await savePuzzle({ ...generated, id, title, source, settings, sourceKey, createdAt: now });
    await saveProgress({
      id, title, mode: settings.mode, sourceKey, fillOrder: [], overrides: [],
      completed: false, percent: 0, thumbnail: '', createdAt: now, updatedAt: now,
    });
    return id;
  } finally {
    done();
  }
}
