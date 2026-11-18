import { parseIngredients, parseMinutes, parseSteps } from './parse';
import type { Meal, Nutrition, Recipe } from './types';

interface SampleInput {
  id: string;
  title: string;
  timeText: string;
  serves: number;
  meal: Meal;
  cuisine: string;
  thumb: string | null;
  nutrition: Nutrition;
  ingredients: string;
  method: string;
  cookedDaysAgo: number | null;
}

const SAMPLES: SampleInput[] = [
  {
    id: 'sample-summer-rolls', title: 'Summer Rolls', timeText: '30 min', serves: 4, meal: 'Light bites', cuisine: 'Vietnamese',
    thumb: '/samples/summer-rolls.png', nutrition: { kcal: 330, protein: 17, carbs: 40, fat: 12, fiber: 3 }, cookedDaysAgo: 3,
    ingredients: `For the rolls:
12 rice paper wrappers
100 g rice vermicelli
12 cooked prawns, halved lengthwise
1 carrot, cut into matchsticks
1 small cucumber, cut into batons
6 soft lettuce leaves
A handful each of mint, Thai basil and coriander
For the dip:
3 tbsp peanut butter
2 tbsp hoisin sauce
1 lime, juiced
Warm water, to loosen`,
    method: `Boil the vermicelli for 4 min, then rinse under cold water and drain well.
Whisk the peanut butter, hoisin and lime juice, adding warm water until the dip coats a spoon.
Dip a wrapper in warm water for about 10 sec, until just pliable, then lay it on a damp board.
Pile lettuce, noodles, carrot, cucumber and herbs on the lower third. Lay three prawn halves above, pink side down.
Fold in the sides and roll up tightly. Keep finished rolls under a damp cloth while you make the rest.`,
  },
  {
    id: 'sample-stew', title: 'Mushroom & Barley Stew', timeText: '1 h 20 min', serves: 4, meal: 'Soups & stews', cuisine: 'European',
    thumb: '/samples/stew.png', nutrition: { kcal: 250, protein: 8, carbs: 38, fat: 7, fiber: 8 }, cookedDaysAgo: 15,
    ingredients: `2 tbsp olive oil
1 onion, diced
2 carrots, diced
2 celery sticks, diced
3 cloves garlic, sliced
400 g mushrooms, sliced
150 g pearl barley, rinsed
1.2 l vegetable stock
2 sprigs thyme
Salt and pepper, to taste`,
    method: `Warm the oil and soften the onion, carrot and celery for 8 min.
Add the garlic and mushrooms and cook for 10 min, until browned.
Stir in the barley, stock and thyme. Simmer for 50 min, until the barley is tender.
Season, fish out the thyme stalks and serve.`,
  },
  {
    id: 'sample-chai', title: 'Masala Chai', timeText: '15 min', serves: 2, meal: 'Drinks', cuisine: 'Indian',
    thumb: '/samples/chai.png', nutrition: { kcal: 95, protein: 4, carbs: 12, fat: 4, fiber: 0 }, cookedDaysAgo: 0,
    ingredients: `1 cup water
1 cup milk
2 tsp black tea leaves
4 cardamom pods, crushed
1 inch ginger, grated
2 tsp sugar`,
    method: `Boil the water with the cardamom and ginger for 3 min.
Add the tea and simmer for 2 min.
Pour in the milk and sugar and bring back to the boil.
Strain into cups.`,
  },
  {
    id: 'sample-loaf', title: 'Honey Oat Loaf', timeText: '2 h 30 min', serves: 12, meal: 'Bakes', cuisine: 'British',
    thumb: '/samples/loaf.png', nutrition: { kcal: 205, protein: 6, carbs: 40, fat: 3, fiber: 3 }, cookedDaysAgo: 40,
    ingredients: `500 g strong white flour
75 g rolled oats, plus extra for the top
7 g fast-action yeast
1 tsp salt
3 tbsp honey
300 ml warm water
2 tbsp butter, melted`,
    method: `Mix the flour, oats, yeast and salt. Add the honey, water and butter and bring together.
Knead for 10 min until smooth and springy.
Cover and leave to rise for 1 hour, until doubled.
Shape into a loaf, put it in a tin, scatter with oats and prove for 40 min.
Bake at 200°C for 30 min, until it sounds hollow when tapped underneath.`,
  },
  {
    id: 'sample-paneer', title: 'Paneer Tikka', timeText: '40 min', serves: 2, meal: 'Mains', cuisine: 'Indian',
    thumb: '/samples/paneer.png', nutrition: { kcal: 470, protein: 25, carbs: 14, fat: 35, fiber: 2 }, cookedDaysAgo: 1,
    ingredients: `For the marinade:
150 g thick yogurt
1 tbsp ginger-garlic paste
1 tsp chilli powder
1 tsp garam masala
1 tbsp lemon juice
1 tbsp oil
Salt, to taste
For the skewers:
250 g paneer, cubed
1 green pepper, cut into squares
1 red onion, cut into chunks`,
    method: `Whisk the marinade ingredients together.
Toss the paneer, pepper and onion in it and marinate for 20 min.
Thread onto skewers.
Grill for 10 min, turning halfway, until charred at the edges.`,
  },
  {
    id: 'sample-crumble', title: 'Blackberry Crumble', timeText: '55 min', serves: 6, meal: 'Desserts', cuisine: 'British',
    thumb: '/samples/crumble.png', nutrition: { kcal: 400, protein: 5, carbs: 62, fat: 14, fiber: 7 }, cookedDaysAgo: null,
    ingredients: `500 g blackberries
2 apples, peeled and chopped
3 tbsp sugar
175 g plain flour
100 g cold butter, cubed
75 g brown sugar
50 g rolled oats`,
    method: `Heat the oven to 190°C. Toss the fruit with the sugar in a baking dish.
Rub the butter into the flour until it looks like breadcrumbs, then stir in the brown sugar and oats.
Scatter over the fruit and bake for 35 min, until golden and bubbling.
Rest for 10 min before serving.`,
  },
  {
    id: 'sample-lemon-rice', title: 'Lemon Rice', timeText: '25 min', serves: 3, meal: 'Mains', cuisine: 'Indian',
    thumb: null, nutrition: { kcal: 355, protein: 7, carbs: 55, fat: 12, fiber: 2 }, cookedDaysAgo: null,
    ingredients: `1 cup rice, cooked and cooled
2 tbsp oil
1 tsp mustard seeds
1 tbsp chana dal
2 tbsp peanuts
1 green chilli, slit
10 curry leaves
1/2 tsp turmeric
Juice of 1 lemon
Salt, to taste`,
    method: `Heat the oil and add the mustard seeds. When they splutter, add the chana dal and peanuts and fry for 2 min.
Add the chilli, curry leaves and turmeric and stir for 30 sec.
Tip in the rice, season and toss well.
Take off the heat and stir in the lemon juice.`,
  },
];

export function sampleRecipes(): Recipe[] {
  const now = Date.now();
  return SAMPLES.map((s, i) => ({
    id: s.id,
    title: s.title,
    timeText: s.timeText,
    minutes: parseMinutes(s.timeText),
    serves: s.serves,
    meal: s.meal,
    cuisine: s.cuisine,
    ingredientsText: s.ingredients,
    methodText: s.method,
    ingredients: parseIngredients(s.ingredients),
    steps: parseSteps(s.method),
    nutrition: s.nutrition,
    nutritionStatus: 'done',
    thumb: s.thumb,
    thumbFrom: s.thumb ? 'gemini' : null,
    createdAt: now - i * 1000,
    updatedAt: now - i * 1000,
    lastCooked: s.cookedDaysAgo === null ? null : now - s.cookedDaysAgo * 86400000,
    sample: true,
  }));
}
