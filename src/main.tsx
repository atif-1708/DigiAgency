// Fix for "Cannot set property fetch of #<Window>" in certain iframe environments
// This must run before any other imports that might use cross-fetch (like Supabase)
if (typeof window !== 'undefined' && window.fetch) {
  const nativeFetch = window.fetch.bind(window);
  try {
    Object.defineProperty(window, 'fetch', {
      value: nativeFetch,
      configurable: true,
      writable: true,
    });
  } catch (e) {
    // If we can't redefine it, we hope the library respects the existing one
    // or we've already handled it in the client config
  }
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
