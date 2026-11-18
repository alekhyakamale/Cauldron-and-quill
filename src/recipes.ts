import { analyzeRecipe, GeminiError } from './gemini';
import { parseIngredients, parseMinutes, parseSteps, uid } from './parse';
import { getData, getRecipe, patchRecipe, StorageFullError } from './store';
import type { Meal, Nutrition, Recipe } from './types';

export interface Draft {
  id?: string;
  title: string;
  timeText: string;
  serves: string;
  meal: Meal;
  cuisine: string;
  ingredientsText: string;
  methodText: string;
  thumb: string | null;
  thumbFrom: Recipe['thumbFrom'];
}

export function emptyDraft(): Draft {
  return {
    title: '', timeText: '', serves: '4', meal: 'Mains', cuisine: '',
    ingredientsText: '', methodText: '', thumb: null, thumbFrom: null,
  };
}

export function draftFromRecipe(r: Recipe): Draft {
  return {
    id: r.id, title: r.title, timeText: r.timeText, serves: String(r.serves), meal: r.meal, cuisine: r.cuisine,
    ingredientsText: r.ingredientsText, methodText: r.methodText, thumb: r.thumb, thumbFrom: r.thumbFrom,
  };
}

/** Builds a full recipe from what the cook typed, keeping history (last cooked, nutrition) when editing. */
export function recipeFromDraft(d: Draft, prev?: Recipe, nutrition?: Nutrition | null): Recipe {
  const now = Date.now();
  const serves = Math.max(1, Math.round(Number(d.serves) || 1));
  const contentChanged =
    !prev ||
    prev.ingredientsText !== d.ingredientsText ||
    prev.serves !== serves ||
    prev.title !== d.title.trim();
  const keepNutrition = prev && !contentChanged ? prev.nutrition : null;
  const finalNutrition = nutrition !== undefined ? nutrition : keepNutrition;
  return {
    id: prev?.id || d.id || uid(),
    title: d.title.trim(),
    timeText: d.timeText.trim(),
    minutes: parseMinutes(d.timeText),
    serves,
    meal: d.meal,
    cuisine: d.cuisine.trim(),
    ingredientsText: d.ingredientsText.trim(),
    methodText: d.methodText.trim(),
    ingredients: parseIngredients(d.ingredientsText),
    steps: parseSteps(d.methodText),
    nutrition: finalNutrition,
    nutritionStatus: finalNutrition ? 'done' : 'none',
    thumb: d.thumb,
    thumbFrom: d.thumbFrom,
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    lastCooked: prev?.lastCooked ?? null,
  };
}

const inFlight = new Set<string>();

/** Asks Gemini for calories, protein, cuisine and meal type, then saves them onto the recipe. */
export async function estimateInBackground(id: string): Promise<void> {
  const { settings } = getData();
  const r = getRecipe(id);
  if (!r || !settings.apiKey || inFlight.has(id)) return;
  inFlight.add(id);
  try {
    patchRecipe(id, { nutritionStatus: 'pending', nutritionError: undefined });
    const a = await analyzeRecipe(settings, r);
    const latest = getRecipe(id);
    if (!latest) return;
    patchRecipe(id, {
      nutrition: a.nutrition,
      nutritionStatus: 'done',
      cuisine: latest.cuisine || a.cuisine,
    });
  } catch (e) {
    const msg = e instanceof GeminiError || e instanceof StorageFullError ? e.message : 'Something went wrong.';
    try {
      patchRecipe(id, { nutritionStatus: 'error', nutritionError: msg });
    } catch {
      // storage full; nothing more to do
    }
  } finally {
    inFlight.delete(id);
  }
}

/** Picks up estimates that were interrupted (e.g. the app was closed mid-request). */
export function resumePendingEstimates(): void {
  const { recipes, settings } = getData();
  if (!settings.apiKey) return;
  recipes.filter((r) => r.nutritionStatus === 'pending').forEach((r) => void estimateInBackground(r.id));
}

export function isHot(r: Recipe): boolean {
  return r.meal === 'Soups & stews' || /\b(chai|tea|coffee|cocoa|soup|stew|curry|dal|broth|ramen|porridge|toddy|cider)\b/i.test(r.title);
}

/** Pixel thumbnails are stored as PNG; full photos (when pixelating is off) as JPEG. */
export function isPixelThumb(thumb: string): boolean {
  return !thumb.startsWith('data:image/jpeg');
}

/** A prompt the cook can paste into any AI (Gemini app, ChatGPT, Claude) when the built-in estimate fails. */
export function nutritionPrompt(r: Pick<Recipe, 'title' | 'serves' | 'ingredientsText' | 'methodText'>): string {
  return [
    'Estimate the nutrition PER SERVING (per person) for this home recipe.',
    '',
    `Recipe: ${r.title}`,
    `Serves: ${r.serves}`,
    '',
    'Ingredients:',
    r.ingredientsText.trim() || '(none listed)',
    '',
    'Method:',
    r.methodText.trim() || '(none listed)',
    '',
    'Use typical values for the ingredients as written. If an amount is vague, assume a normal home portion and say briefly what you assumed.',
    'Give single numbers, not ranges. End your reply with exactly this line, filled in:',
    'Calories: ___ kcal | Protein: ___ g | Fiber: ___ g | Carbs: ___ g | Fat: ___ g',
  ].join('\n');
}

/** Reads the numbers back out of an AI's reply. Uses the last mention of each, which is the summary line. */
export function parseNutritionReply(text: string): Nutrition | null {
  const last = (re: RegExp): number | null => {
    const all = [...text.matchAll(re)];
    if (!all.length) return null;
    const n = Number(all[all.length - 1][1].replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const NUM = String.raw`[:=\-–]?\s*(?:about|approx\.?|~|≈)?\s*(\d+(?:[.,]\d+)?)`;
  const kcal = last(new RegExp(String.raw`(?:calories|energy|kcal)\s*` + NUM, 'gi')) ?? last(/(\d+(?:[.,]\d+)?)\s*k?cal\b/gi);
  const protein = last(new RegExp(String.raw`protein\s*` + NUM, 'gi'));
  const fiber = last(new RegExp(String.raw`fib(?:er|re)\s*` + NUM, 'gi'));
  const carbs = last(new RegExp(String.raw`carb(?:ohydrate)?s?\s*` + NUM, 'gi'));
  const fat = last(new RegExp(String.raw`\bfats?\s*` + NUM, 'gi'));
  if (kcal === null || protein === null || carbs === null || fat === null) return null;
  return {
    kcal: Math.round(kcal / 5) * 5,
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    ...(fiber !== null ? { fiber: Math.round(fiber * 2) / 2 } : {}),
  };
}
