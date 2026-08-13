import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initTelegramMiniApp } from './lib/telegram';
import './index.css';

const startParam = initTelegramMiniApp();
if (startParam && window.location.pathname === '/') {
  window.history.replaceState(null, '', `/i/${startParam}`);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
