import type { Meal, Nutrition, PixelSize, Settings } from './types';
import { MEALS } from './types';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

interface Part {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType: string; data: string };
  inline_data?: { mime_type: string; data: string };
}

async function generate(settings: Settings, model: string, body: unknown, signal?: AbortSignal): Promise<Part[]> {
  if (!settings.apiKey.trim()) throw new GeminiError('Add your Gemini API key in Settings first.');
  let res: Response;
  try {
    res = await fetch(BASE + encodeURIComponent(model.trim()) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey.trim() },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new GeminiError("Couldn't reach Gemini. Check your internet connection.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg: string = json?.error?.message || `Gemini returned an error (${res.status}).`;
    if (res.status === 400 && /api key/i.test(msg)) throw new GeminiError('Gemini rejected the API key. Check it in Settings.', 400);
    if (res.status === 403) throw new GeminiError('This API key is not allowed to use Gemini. Check it in Settings.', 403);
    if (res.status === 404) throw new GeminiError(`Gemini doesn't know the model "${model}". You can change it under Settings › Advanced.`, 404);
    if (res.status === 429) throw new GeminiError('Gemini says you have hit your usage limit. Try again in a little while.', 429);
    throw new GeminiError(msg, res.status);
  }
  const cand = json?.candidates?.[0];
  const parts: Part[] = cand?.content?.parts || [];
  if (!parts.length) {
    const reason = cand?.finishReason || json?.promptFeedback?.blockReason;
    throw new GeminiError(reason ? `Gemini returned nothing (${reason}). Try rewording.` : 'Gemini returned nothing. Try again.');
  }
  return parts;
}

function partsText(parts: Part[]): string {
  return parts.filter((p) => !p.thought && p.text).map((p) => p.text).join('');
}

function parseJSON<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new GeminiError("Gemini's answer wasn't in the expected format. Try again.");
  }
}

export function dataUrlParts(dataUrl: string): { mimeType: string; data: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new GeminiError('Unsupported image.');
  return { mimeType: m[1], data: m[2] };
}

async function generateJSON<T>(settings: Settings, parts: Part[], schema: unknown, signal?: AbortSignal): Promise<T> {
  const out = await generate(
    settings,
    settings.textModel,
    {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
    },
    signal,
  );
  return parseJSON<T>(partsText(out));
}

const NUTRITION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    kcal: { type: 'NUMBER' },
    protein: { type: 'NUMBER' },
    carbs: { type: 'NUMBER' },
    fat: { type: 'NUMBER' },
  },
  required: ['kcal', 'protein', 'carbs', 'fat'],
};

export interface Analysis {
  nutrition: Nutrition;
  cuisine: string;
  meal: Meal;
}

/** Estimates per-serving nutrition and suggests a cuisine and meal type. */
export async function analyzeRecipe(
  settings: Settings,
  r: { title: string; serves: number; ingredientsText: string; methodText: string },
): Promise<Analysis> {
  const prompt = [
    'You are a careful nutritionist. Estimate the nutrition PER SERVING for this home recipe.',
    'Use typical values for the ingredients as written; assume reasonable amounts where vague (e.g. "a handful").',
    `Also name the single most fitting cuisine (one or two words, like "Indian", "Vietnamese", "Italian", "British") and the meal type, one of: ${MEALS.join(', ')}.`,
    'Round kcal to the nearest 5 and grams to whole numbers.',
    '',
    `Recipe: ${r.title}`,
    `Serves: ${r.serves}`,
    'Ingredients:',
    r.ingredientsText,
    'Method:',
    r.methodText,
  ].join('\n');
  const res = await generateJSON<{ nutrition: Nutrition; cuisine: string; meal: string }>(settings, [{ text: prompt }], {
    type: 'OBJECT',
    properties: {
      nutrition: NUTRITION_SCHEMA,
      cuisine: { type: 'STRING' },
      meal: { type: 'STRING', enum: [...MEALS] },
    },
    required: ['nutrition', 'cuisine', 'meal'],
  });
  const n = res.nutrition;
  return {
    nutrition: {
      kcal: Math.round(Number(n.kcal) / 5) * 5,
      protein: Math.round(Number(n.protein)),
      carbs: Math.round(Number(n.carbs)),
      fat: Math.round(Number(n.fat)),
    },
    cuisine: (res.cuisine || '').trim(),
    meal: (MEALS as readonly string[]).includes(res.meal) ? (res.meal as Meal) : 'Mains',
  };
}

export interface CardIngredient {
  qty: number | null;
  unit: string;
  item: string;
  section: string;
  uncertain: boolean;
  note: string;
}

export interface CardReading {
  title: string;
  timeText: string;
  serves: number;
  meal: Meal;
  cuisine: string;
  ingredients: CardIngredient[];
  steps: string[];
  nutrition: Nutrition;
}

/** Reads a photo of a handwritten or printed recipe and returns it structured. */
export async function readRecipeCard(settings: Settings, imageDataUrl: string, signal?: AbortSignal): Promise<CardReading> {
  const prompt = [
    'This photo shows a recipe (a handwritten card, a cookbook page or a screenshot). Transcribe it faithfully into the JSON schema.',
    '- Keep the cook\'s own wording for ingredient items and steps; fix only obvious spelling slips.',
    '- Split each ingredient into qty (a number, or null if none), unit (like g, ml, tbsp, tsp, cup, clove, inch, or empty) and item.',
    '- If a line belongs to a sub-heading like "For the dip", put that heading in section; otherwise use an empty string.',
    '- Set uncertain=true ONLY when a number or word is genuinely hard to read, and explain briefly in note (for example "The first digit is smudged: 600 or 800?"). Otherwise note is an empty string.',
    '- Write each method step as one clear sentence or two, keeping any times mentioned (e.g. "simmer for 20 min").',
    '- timeText is the total time like "35 min" or "1 h 20 min"; estimate it from the steps if not written.',
    '- If the number of servings is not written, estimate it.',
    `- meal is one of: ${MEALS.join(', ')}. cuisine is one or two words.`,
    '- nutrition is your best per-serving estimate.',
    'If the photo does not contain a recipe, return an empty title and empty lists.',
  ].join('\n');
  const res = await generateJSON<CardReading>(
    settings,
    [{ text: prompt }, { inlineData: dataUrlParts(imageDataUrl) }],
    {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING' },
        timeText: { type: 'STRING' },
        serves: { type: 'INTEGER' },
        meal: { type: 'STRING', enum: [...MEALS] },
        cuisine: { type: 'STRING' },
        ingredients: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              qty: { type: 'NUMBER', nullable: true },
              unit: { type: 'STRING' },
              item: { type: 'STRING' },
              section: { type: 'STRING' },
              uncertain: { type: 'BOOLEAN' },
              note: { type: 'STRING' },
            },
            required: ['qty', 'unit', 'item', 'section', 'uncertain', 'note'],
          },
        },
        steps: { type: 'ARRAY', items: { type: 'STRING' } },
        nutrition: NUTRITION_SCHEMA,
      },
      required: ['title', 'timeText', 'serves', 'meal', 'cuisine', 'ingredients', 'steps', 'nutrition'],
    },
    signal,
  );
  if (!res.title && !res.ingredients?.length) {
    throw new GeminiError("Gemini couldn't find a recipe in that photo. Try a closer, brighter shot.");
  }
  return {
    ...res,
    serves: Math.max(1, Math.round(Number(res.serves) || 2)),
    meal: (MEALS as readonly string[]).includes(res.meal) ? res.meal : 'Mains',
    ingredients: (res.ingredients || []).map((i) => ({ ...i, unit: i.unit || '', section: i.section || '', note: i.note || '' })),
    steps: (res.steps || []).filter(Boolean),
  };
}

const SIZE_WORDS: Record<PixelSize, string> = {
  Chunky: 'big, chunky 32×24-style pixels',
  Classic: 'classic 16-bit pixels',
  Fine: 'fine, detailed pixels',
};

export interface ThumbPromptInput {
  title: string;
  keyIngredients: string[];
  whisper: string;
  size: PixelSize;
  matchStyle: boolean;
}

/** Plain-English summary shown to the cook before conjuring */
export function describeThumbPrompt(p: ThumbPromptInput): string {
  const dish = p.title.trim() || 'your dish';
  const withIngr = p.keyIngredients.length ? ` with ${listJoin(p.keyIngredients.slice(0, 5))}` : '';
  const whisper = p.whisper.trim() ? `, ${p.whisper.trim()}` : '';
  const style = p.matchStyle ? ', matching the style of your shelf' : '';
  return `${dish}${withIngr}${whisper}, as cozy candlelit pixel art with ${SIZE_WORDS[p.size].replace(/ 32×24-style/, '')}${style}.`;
}

function listJoin(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
}

export async function conjureThumbnail(
  settings: Settings,
  p: ThumbPromptInput,
  reference: string | null,
  signal?: AbortSignal,
): Promise<string> {
  const lines = [
    `Pixel art illustration of ${p.title.trim() || 'a home-cooked dish'}${p.keyIngredients.length ? ' (made with ' + p.keyIngredients.slice(0, 6).join(', ') + ')' : ''}.`,
    p.whisper.trim() ? `Scene: ${p.whisper.trim()}.` : 'Plated on a rustic wooden kitchen table, seen from slightly above.',
    `Style: cozy, candlelit, warm autumn palette, ${SIZE_WORDS[p.size]}, crisp hard pixel edges, limited colour palette, gentle dithering, dark warm vignette.`,
    'The food fills most of the frame. No text, no letters, no logos, no border, no UI.',
  ];
  const parts: Part[] = [];
  if (reference && p.matchStyle) {
    lines.push('Match the pixel size, palette, lighting and framing of the attached reference image exactly, but show this new dish instead.');
  }
  parts.push({ text: lines.join('\n') });
  if (reference && p.matchStyle && reference.startsWith('data:')) parts.push({ inlineData: dataUrlParts(reference) });
  const out = await generate(
    settings,
    settings.imageModel,
    {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '4:3' } },
    },
    signal,
  );
  const images = out.filter((pt) => !pt.thought && (pt.inlineData || pt.inline_data));
  const last = images[images.length - 1];
  if (!last) {
    const said = partsText(out);
    throw new GeminiError(said ? `Gemini didn't paint anything: "${said.slice(0, 140)}"` : "Gemini didn't return a picture. Try again.");
  }
  const mime = last.inlineData?.mimeType || last.inline_data?.mime_type || 'image/png';
  const b64 = last.inlineData?.data || last.inline_data?.data || '';
  return `data:${mime};base64,${b64}`;
}

/** A tiny request to check the key works */
export async function testKey(settings: Settings): Promise<void> {
  await generate(settings, settings.textModel, { contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ready' }] }] });
}
