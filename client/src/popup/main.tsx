import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import PopupApp from '../app/PopupApp';

/**
 * Popup entry point.
 * Compact Chrome Extension popup — separate React tree from the Side Panel.
 */
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found. Ensure popup.html contains <div id="root">.');
}

createRoot(rootElement).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);

