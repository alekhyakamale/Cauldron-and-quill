# Cauldron & Quill

A cozy recipe book for your phone: pixel-art thumbnails from Gemini, filters for cuisine, calories and protein, a cook mode with timers, and snap-a-recipe-card. Everything is stored in your phone's browser (local storage). There is no server and no database.

## Shipping changes

### One-time setup: auto-deploy on every push

1. Open the `cauldron-and-quill` project on vercel.com.
2. Go to **Settings → Git** and connect the GitHub repo `alekhyakamale/Cauldron-and-quill` (branch `main`).

From then on, every push to `main` deploys to production. Pushes to other branches get their own preview URLs.

### Every time after that

```bash
npm run ship -- "what changed"
```

This builds the app (so a broken build never reaches Vercel), then commits everything and pushes. Without a message it uses a timestamp.

### Deploying without Git

```bash
npm run deploy
```

This builds, then runs `vercel --prod` straight from your laptop. You need the Vercel CLI (`npm i -g vercel`) and to be logged in.

## Run locally

```bash
npm install
npm run dev
```

## Using it on your phone

1. Open the Vercel URL in Chrome (Android) or Safari (iPhone).
2. Add it to your home screen ("Install app" on Android, Share → "Add to Home Screen" on iPhone). It opens full-screen and works offline after the first visit.
3. In Settings, paste a Gemini API key from https://aistudio.google.com/app/apikey. This turns on thumbnails, card reading and calorie, protein and fiber estimates.

On iPhone, the home-screen app and Safari keep separate storage, so add recipes from the home-screen app.

## Where your data lives

- Recipes, thumbnails and settings are saved in `localStorage` under `cauldron-and-quill/v1`, only on that phone and in that browser.
- Clearing the browser's site data deletes everything. Use Settings › Your recipes › Export now and then to save a backup file, and Import to restore it (also how you move recipes to a new phone).
- Your Gemini key is never included in exported backups.

## Gemini

- Calls go straight from the phone to `generativelanguage.googleapis.com` using your key.
- Default models: `gemini-flash-latest` for reading cards and estimating nutrition, `gemini-3.1-flash-image` (Nano Banana 2) for thumbnails. When Gemini is overloaded the app retries, then falls back to the Lite models. Change models under Settings › Gemini › Advanced if Google renames them.
- Image generation isn't in Gemini's free API tier. Without billing, make the picture in the Gemini app and upload it instead.
- Uploaded or generated pictures can be pixelated in the browser to 48×36 (Chunky), 96×72 (Classic) or 160×120 (Fine), with zoom and drag to frame the dish.

## Code map

- `src/store.ts`: local-storage store (`useSyncExternalStore`)
- `src/parse.ts`: ingredient amounts, scaling, timers in steps
- `src/gemini.ts`: Gemini REST calls (structured JSON + image generation), retries and fallbacks
- `src/pixel.ts`: cropping, pixelation and colour quantisation on a canvas
- `src/theme.ts`: seasonal palettes
- `src/pages/`: Shelf (with filters), RecipeView, Editor, ThumbSheet, CookMode, Snap, Settings
- `public/sw.js`: offline support
- `scripts/ship.mjs`: build, commit and push in one go
