# Cauldron & Quill

A cozy recipe book for your phone: pixel-art thumbnails from Gemini, filters for cuisine, calories and protein, a cook mode with timers, and snap-a-recipe-card. Everything is stored in your phone's browser (local storage). There is no server and no database.

## Deploy to Vercel

```bash
npm install
npx vercel --prod
```

The first run asks you to log in and confirm the project settings (the Vite defaults are right). It ends by printing your live URL.

To deploy from GitHub instead, push this folder to a repo and import it at https://vercel.com/new. Framework preset: Vite. Build command: `npm run build`. Output folder: `dist`.

## Run locally

```bash
npm install
npm run dev
```

## Using it on your phone

1. Open the Vercel URL in Chrome (Android) or Safari (iPhone).
2. Add it to your home screen ("Install app" on Android, Share → "Add to Home Screen" on iPhone). It opens full-screen and works offline after the first visit.
3. In Settings, paste a Gemini API key from https://aistudio.google.com/app/apikey. This turns on thumbnails, card reading and calorie/protein estimates.

## Where your data lives

- Recipes, thumbnails and settings are saved in `localStorage` under `cauldron-and-quill/v1`, only on that phone and in that browser.
- Thumbnails are stored as tiny pixel PNGs (a few KB each), so hundreds of recipes fit in the browser's roughly 5 MB limit.
- Clearing the browser's site data deletes everything. Use Settings › Your recipes › Export now and then to save a backup file, and Import to restore it (also how you move recipes to a new phone).
- Your Gemini key is never included in exported backups.

## Gemini

- Calls go straight from the phone to `generativelanguage.googleapis.com` using your key.
- Default models: `gemini-flash-latest` for reading cards and estimating nutrition, `gemini-3.1-flash-image` (Nano Banana 2) for thumbnails. Change them under Settings › Gemini › Advanced if Google renames them.
- Gemini's images are shrunk to a 32×24, 48×36 or 64×48 grid and reduced to a limited colour palette in the browser, which is what makes them true pixel art.

## Code map

- `src/store.ts`: local-storage store (`useSyncExternalStore`)
- `src/parse.ts`: ingredient amounts, scaling, timers in steps
- `src/gemini.ts`: Gemini REST calls (structured JSON + image generation)
- `src/pixel.ts`: pixelation and colour quantisation on a canvas
- `src/theme.ts`: seasonal palettes
- `src/pages/`: Shelf (with filters), RecipeView, Editor, ThumbSheet, CookMode, Snap, Settings
- `public/sw.js`: offline support
