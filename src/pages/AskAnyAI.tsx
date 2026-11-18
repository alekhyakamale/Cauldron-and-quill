import { useRef, useState } from 'react';
import { nutritionPrompt, parseNutritionReply } from '../recipes';
import { patchRecipe } from '../store';
import type { Recipe } from '../types';
import { Icon, toast } from '../ui';

/** Fallback when Gemini can't estimate: copy a prompt into any AI, then paste its answer back. */
export default function AskAnyAI({ recipe }: { recipe: Recipe }) {
  const prompt = nutritionPrompt(recipe);
  const [showPrompt, setShowPrompt] = useState(false);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast('Prompt copied. Paste it into any AI');
    } catch {
      // Clipboard blocked: show the prompt selected so the cook can copy it by hand
      setShowPrompt(true);
      setTimeout(() => {
        promptRef.current?.focus();
        promptRef.current?.select();
      }, 0);
      toast('Select the prompt and copy it');
    }
  };

  const save = () => {
    const n = parseNutritionReply(reply);
    if (!n) {
      setError("Couldn't find all the numbers. Make sure the answer includes the “Calories: … | Protein: … | Fiber: … | Carbs: … | Fat: …” line.");
      return;
    }
    try {
      patchRecipe(recipe.id, { nutrition: n, nutritionStatus: 'done', nutritionError: undefined });
      toast('Estimates saved');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'var(--raised)', border: '2px solid var(--edge)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="display" style={{ fontSize: 19 }}>Or ask any AI</span>
        <span className="muted" style={{ fontSize: 14, lineHeight: 1.45 }}>
          Copy this prompt into the Gemini app, ChatGPT or Claude. It includes your servings, ingredients and method. Then paste the answer below.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 10 }}>
        <button className="btn btn-primary" onClick={copy}>
          <Icon name="check" size={16} stroke={3} /> Copy prompt
        </button>
        <button className="btn btn-dark" aria-expanded={showPrompt} onClick={() => setShowPrompt((v) => !v)} style={{ fontSize: 15 }}>
          {showPrompt ? 'Hide prompt' : 'See prompt'}
        </button>
      </div>

      {showPrompt && (
        <textarea ref={promptRef} className="input" readOnly rows={9} value={prompt} aria-label="Prompt to copy" style={{ fontSize: 14, lineHeight: 1.45 }} />
      )}

      <label className="field">
        <span className="label muted">Paste the answer</span>
        <textarea
          className="input"
          rows={4}
          value={reply}
          onChange={(e) => {
            setReply(e.target.value);
            setError('');
          }}
          placeholder="Calories: 330 kcal | Protein: 17 g | Fiber: 3 g | Carbs: 40 g | Fat: 12 g"
          style={{ fontSize: 15 }}
        />
      </label>
      {error && <div className="error-box" role="alert">{error}</div>}
      <button className="btn btn-dark" disabled={!reply.trim()} onClick={save}>
        Save these estimates
      </button>
    </section>
  );
}
