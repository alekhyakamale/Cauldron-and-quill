import { useEffect } from 'react';
import CookMode from './pages/CookMode';
import Editor from './pages/Editor';
import RecipeView from './pages/RecipeView';
import Settings from './pages/Settings';
import Shelf from './pages/Shelf';
import Snap from './pages/Snap';
import { resumePendingEstimates } from './recipes';
import { useData } from './store';
import { activeSeason, applyPalette, PALETTES } from './theme';
import { Toaster, useRoute } from './ui';

export default function App() {
  const route = useRoute();
  const { settings } = useData();
  const season = activeSeason(settings);

  useEffect(() => applyPalette(PALETTES[season]), [season]);
  useEffect(() => resumePendingEstimates(), []);

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
