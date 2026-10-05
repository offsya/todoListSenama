import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';
import { App } from './App';
import './styles/global.css';

// zod compiles validators with `new Function` when it can. The Content-Security-Policy of the
// Docker image forbids that, and zod's probe would log a CSP violation on the first validation.
z.config({ jitless: true });

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing in index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
