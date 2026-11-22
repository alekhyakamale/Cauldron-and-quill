import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { getData, initStore } from './store';
import { activeSeason, applyPalette, PALETTES } from './theme';
import './styles.css';

// Load saved recipes first (IndexedDB is asynchronous), then paint the right season and render
void initStore().then(() => {
  applyPalette(PALETTES[activeSeason(getData().settings)]);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});

// Ask the browser to keep our recipes even when the phone is low on space
navigator.storage?.persist?.().catch(() => {
  // not supported everywhere; the app still works
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // offline support is a bonus; the app works without it
    });
  });
}
