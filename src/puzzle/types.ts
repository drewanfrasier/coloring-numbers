export type Mode = 'outline' | 'pixel';
export type Detail = 'low' | 'medium' | 'high';
export type RGB = [number, number, number];

export interface PuzzleSettings {
  mode: Mode;
  colors: number;
  detail: Detail;
}

export interface PuzzleSource {
  kind: 'emoji' | 'photo' | 'builtin';
  ref: string;
}

/** What the generator produces. Region ids run 1..regionCount; 0 is background. */
export interface GeneratedPuzzle {
  mode: Mode;
  width: number;
  height: number;
  regionMap: Int32Array;
  regionCount: number;
  /** Palette index per region id (index 0 unused). */
  regionColor: Uint8Array;
  labelX: Float32Array;
  labelY: Float32Array;
  /** Radius of the largest circle that fits inside the region, in puzzle pixels. */
  labelR: Float32Array;
  area: Int32Array;
  palette: RGB[];
}

export interface Puzzle extends GeneratedPuzzle {
  id: string;
  title: string;
  source: PuzzleSource;
  settings: PuzzleSettings;
  sourceKey: string;
  createdAt: number;
}

export interface Progress {
  id: string;
  title: string;
  mode: Mode;
  sourceKey: string;
  fillOrder: number[];
  overrides: [number, RGB][];
  completed: boolean;
  percent: number;
  thumbnail: string;
  createdAt: number;
  updatedAt: number;
}

export interface ImageLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
