import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initTelegramMiniApp } from './lib/telegram';
import { applyTheme } from './lib/themePref';
import './index.css';

applyTheme();

const startParam = initTelegramMiniApp();
if (startParam && window.location.pathname === '/') {
  window.history.replaceState(null, '', `/i/${startParam}`);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
