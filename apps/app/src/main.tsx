import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initPwa } from './lib/pwa';
import { applyTheme } from './lib/themePref';
import '@fontsource-variable/vazirmatn/index.css';
import './index.css';

applyTheme();
initPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
