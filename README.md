# Cauldron & Quill

A cozy recipe book for your phone: pixel-art thumbnails from Gemini, filters for cuisine, calories and protein, a cook mode with timers, and snap-a-recipe-card. Everything is stored in your phone's browser (IndexedDB), with optional sync to your own Neon database.

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

- Recipes, thumbnails, the food log and settings are saved in IndexedDB (database `cauldron-and-quill`), on that phone and in that browser. IndexedDB allows far more than the ~5 MB of localStorage, where older versions kept everything; that data is moved over automatically on first launch.
- Clearing the browser's site data deletes everything. Use Settings › Your recipes › Export now and then to save a backup file, and Import to restore it (also how you move recipes to a new phone).
- Your Gemini key and sync passphrase are never included in exported backups.
- With Sync on, every recipe is also kept in your Neon Postgres database (see below).

## Food log

- On any recipe, **Ate this today** logs it with servings (½ steps, or type any amount) and a meal slot. **Adjust numbers** overrides the estimate for that one entry.
- The calendar icon on the shelf opens the day: totals for calories, protein, fiber, carbs and fat, per meal, with arrows to earlier days. **Something else** adds food that isn't a recipe.
- **Copy for AI or notes** copies a plain-text summary of the day.
- Days sync like recipes, stored as rows with ids `day:YYYY-MM-DD`. App versions from before the food log never receive them.

## Sync with Neon

One serverless function, `api/sync.ts`, stores recipes in a single `recipes` table, which it creates on first use. Phones keep working offline and sync when they open, a few seconds after each edit, and when they come back online. If two phones edit the same recipe, the most recent edit wins. Deleting a recipe deletes it everywhere.

Setup, once:

1. Vercel › your project › Storage › Create › Neon (free plan). This adds `DATABASE_URL` to the project. Or create a project at neon.com and add its connection string as `DATABASE_URL` yourself.
2. Vercel › Settings › Environment Variables: add `APP_PASSPHRASE` with a long secret phrase, for Production.
3. Redeploy (`npm run ship`).
4. On each phone: Settings › Sync, type the passphrase, Connect. The first sync uploads that phone's shelf and downloads everything else.

Neon's free plan scales to zero when idle and wakes on the next request (a second or so), so the project is never paused the way Supabase's free tier is.

## Gemini

- Calls go straight from the phone to `generativelanguage.googleapis.com` using your key.
- Default models: `gemini-flash-latest` for reading cards and estimating nutrition, `gemini-3.1-flash-image` (Nano Banana 2) for thumbnails. When Gemini is overloaded the app retries, then falls back to the Lite models. Change models under Settings › Gemini › Advanced if Google renames them.
- Image generation isn't in Gemini's free API tier. Without billing, make the picture in the Gemini app and upload it instead.
- Uploaded or generated pictures can be pixelated in the browser to 48×36 (Chunky), 96×72 (Classic) or 160×120 (Fine), with zoom and drag to frame the dish.

## Code map

- `src/store.ts`: the app's data (`useSyncExternalStore`), saved to IndexedDB via `src/idb.ts`; tracks which recipes changed
- `src/log.ts`: food log helpers (dates, totals, copy text)
- `src/sync.ts`: phone side of sync (batching, merging, auto-sync)
- `api/sync.ts`, `api/_lib.ts`: the sync endpoint and its Postgres queries
- `src/parse.ts`: ingredient amounts, scaling, timers in steps
- `src/gemini.ts`: Gemini REST calls (structured JSON + image generation), retries and fallbacks
- `src/pixel.ts`: cropping, pixelation and colour quantisation on a canvas
- `src/theme.ts`: seasonal palettes
- `src/pages/`: Shelf (with filters), RecipeView, Today, LogSheet, Editor, ThumbSheet, CookMode, Snap, Settings
- `public/sw.js`: offline support
- `scripts/ship.mjs`: build, commit and push in one go
