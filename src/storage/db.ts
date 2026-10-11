import type { Progress, Puzzle } from '../puzzle/types';

const DB_NAME = 'color-pop';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Big puzzle data and the small progress records live apart so the gallery loads fast.
      if (!db.objectStoreNames.contains('puzzles')) db.createObjectStore('puzzles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export const savePuzzle = (p: Puzzle) => run('puzzles', 'readwrite', (s) => s.put(p));
export const loadPuzzle = (id: string) => run<Puzzle | undefined>('puzzles', 'readonly', (s) => s.get(id));
export const saveProgress = (p: Progress) => run('progress', 'readwrite', (s) => s.put(p));
export const loadProgress = (id: string) => run<Progress | undefined>('progress', 'readonly', (s) => s.get(id));
export const allProgress = () => run<Progress[]>('progress', 'readonly', (s) => s.getAll());

export async function deletePicture(id: string): Promise<void> {
  await run('puzzles', 'readwrite', (s) => s.delete(id));
  await run('progress', 'readwrite', (s) => s.delete(id));
}
