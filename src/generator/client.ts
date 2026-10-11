import type { GeneratedPuzzle } from '../puzzle/types';
import type { GenerateOptions } from './generate';

type Pending = { resolve: (p: GeneratedPuzzle) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const { id, result, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error));
    else p.resolve(result);
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'Generator crashed'));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** Run the puzzle generator off the main thread so the page stays responsive. */
export function generateInWorker(img: ImageData, options: GenerateOptions): Promise<GeneratedPuzzle> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const image = { data: img.data, width: img.width, height: img.height };
    getWorker().postMessage({ id, image, options }, [img.data.buffer]);
  });
}
