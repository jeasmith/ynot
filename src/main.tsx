import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createSessionStore } from './session/store.ts';
import { App } from './ui/App.tsx';
import './ui/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// The real YNAB client factory and PAT storage are the store's defaults. `start()` connects with
// a Remembered PAT, if there is one, before the first render so the connect screen does not flash.
const store = createSessionStore();
void store.start();

createRoot(root).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
