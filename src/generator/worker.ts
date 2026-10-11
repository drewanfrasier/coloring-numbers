import { generate, type GenerateOptions } from './generate';
import type { ImageLike } from '../puzzle/types';

interface Request {
  id: number;
  image: ImageLike;
  options: GenerateOptions;
}

self.onmessage = (e: MessageEvent<Request>) => {
  const { id, image, options } = e.data;
  try {
    const result = generate(image, options);
    const transfer = [result.regionMap, result.regionColor, result.labelX, result.labelY, result.labelR, result.area].map((a) => a.buffer);
    (self as unknown as Worker).postMessage({ id, result }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
