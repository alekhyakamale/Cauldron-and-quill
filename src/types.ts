export const MEALS = ['Breakfast', 'Light bites', 'Mains', 'Soups & stews', 'Bakes', 'Desserts', 'Drinks'] as const;
export type Meal = (typeof MEALS)[number];

export interface Ingredient {
  /** The line exactly as written */
  text: string;
  qty: number | null;
  unit: string;
  item: string;
  section: string;
}

export interface Step {
  text: string;
  timerSec: number | null;
  timerLabel: string;
}

export interface Nutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Dietary fibre in grams; missing on recipes estimated before fibre was added */
  fiber?: number;
}

export type NutritionStatus = 'none' | 'pending' | 'done' | 'error';

export interface Recipe {
  id: string;
  title: string;
  timeText: string;
  minutes: number | null;
  serves: number;
  meal: Meal;
  cuisine: string;
  ingredientsText: string;
  methodText: string;
  ingredients: Ingredient[];
  steps: Step[];
  nutrition: Nutrition | null;
  nutritionStatus: NutritionStatus;
  nutritionError?: string;
  thumb: string | null;
  thumbFrom: 'gemini' | 'upload' | null;
  createdAt: number;
  updatedAt: number;
  lastCooked: number | null;
  sample?: boolean;
}

export type Season = 'Autumn' | 'Winter' | 'Spring' | 'Summer';
export type PixelSize = 'Chunky' | 'Classic' | 'Fine';

export interface Settings {
  season: Season;
  autoSeason: boolean;
  apiKey: string;
  textModel: string;
  imageModel: string;
  pixelSize: PixelSize;
  matchStyle: boolean;
  pixelateUploads: boolean;
  keepAwake: boolean;
  timerSound: boolean;
  showKcal: boolean;
}

export const DEFAULT_TEXT_MODEL = 'gemini-flash-latest';
export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';

export const DEFAULT_SETTINGS: Settings = {
  season: 'Autumn',
  autoSeason: true,
  apiKey: '',
  textModel: DEFAULT_TEXT_MODEL,
  imageModel: DEFAULT_IMAGE_MODEL,
  pixelSize: 'Classic',
  matchStyle: true,
  pixelateUploads: true,
  keepAwake: true,
  timerSound: true,
  showKcal: true,
};
