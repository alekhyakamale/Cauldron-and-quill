import { useEffect } from 'react';
import CookMode from './pages/CookMode';
import Editor from './pages/Editor';
import RecipeView from './pages/RecipeView';
import Settings from './pages/Settings';
import Shelf from './pages/Shelf';
import Snap from './pages/Snap';
import Today from './pages/Today';
import { dateKey, isDateKey } from './log';
import { resumePendingEstimates } from './recipes';
import { startAutoSync } from './sync';
import { useData } from './store';
import { activeSeason, applyPalette, PALETTES } from './theme';
import { Toaster, toast, useRoute } from './ui';

export default function App() {
  const route = useRoute();
  const { settings } = useData();
  const season = activeSeason(settings);

  useEffect(() => applyPalette(PALETTES[season]), [season]);
  useEffect(() => resumePendingEstimates(), []);
  useEffect(() => startAutoSync(), []);
  useEffect(() => {
    const onFail = (e: Event) => toast((e as CustomEvent<string>).detail);
    window.addEventListener('cq-save-failed', onFail);
    return () => window.removeEventListener('cq-save-failed', onFail);
  }, []);

  let page;
  switch (route[0]) {
    case 'r':
      page = <RecipeView key={route[1]} id={route[1]} />;
      break;
    case 'edit':
      page = <Editor key={'edit-' + route[1]} id={route[1]} />;
      break;
    case 'new':
      page = <Editor key="new" />;
      break;
    case 'cook':
      page = <CookMode key={route[1]} id={route[1]} />;
      break;
    case 'snap':
      page = <Snap />;
      break;
    case 'today': {
      const date = isDateKey(route[1]) ? route[1] : dateKey();
      page = <Today key={date} date={date} />;
      break;
    }
    case 'settings':
      page = <Settings />;
      break;
    default:
      page = <Shelf />;
  }
  return (
    <>
      {page}
      <Toaster />
    </>
  );
}
