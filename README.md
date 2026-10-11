# Color Pop

A free color-by-number app. Pick any emoji, one of the built-in pictures, or upload your own photo. Color Pop turns it into a numbered coloring page. No ads, no accounts, no paywall.

## Features

- **Unlimited pictures**: about 300 emoji, 20 built-in illustrations, or any photo you drop in.
- **Two styles**: *Pixel squares* (the default: lots of tiny numbered squares you zoom in on and click or drag to paint) or *Coloring book* (outlined sections).
- **You choose the difficulty**: 4–15 colors, and big shapes up to tiny details.
- **Helpers**: "Find one" zooms to a section you missed. Wrong clicks just show the right number. Undo/redo.
- **Saves automatically**: every picture is kept in *My Art* in the browser, so you can pick up where you left off.
- **When you finish**: confetti, a replay of the picture being colored in, *Save picture* (PNG), and *Free paint* to recolor it however you like.
- Works offline once loaded.

### Controls

| Action | Mouse / keyboard |
| --- | --- |
| Fill a section | Click it (pixel art: click and drag) |
| Zoom | Mouse wheel, trackpad pinch, or `+` / `-` |
| Move around | Drag (coloring book), right-drag, or hold `Space` and drag |
| Pick a color | Click a swatch, `1`–`9`, `0` for 10, `[` / `]` for previous/next |
| Undo / redo | `Z` / `Y` |
| Find a missed section | `H` |
| Fit to screen | `F` |

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # generator unit tests
npm run build    # production build in dist/
```

## Putting it online (free)

The workflow in `.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. Turn it on once in the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The app will then be at `https://<your-username>.github.io/coloring-numbers/`.

## How it works

Every source goes through one generator (`src/generator/`), which runs in a Web Worker:

1. Draw the picture onto a canvas (about 1000px for coloring book, about 480px for pixel art).
2. Reduce it to *k* colors with k-means in CIELAB space, merging shades that are too similar.
3. Clean up speckle, strip thin slivers and halos, and merge sections that are too small for a number.
4. Put each number at the spot farthest from its section's edges (found with a distance transform).

Everything is stored in the browser (IndexedDB). Nothing is uploaded anywhere.
