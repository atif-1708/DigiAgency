// Fix for "Cannot set property fetch of #<Window>" in certain iframe environments
if (typeof window !== 'undefined') {
  try {
    const nativeFetch = window.fetch;
    if (nativeFetch) {
      Object.defineProperty(window, 'fetch', {
        value: nativeFetch.bind(window),
        configurable: true,
        writable: true,
      });
    }
  } catch (e) {
    // Ignore errors if we can't redefine fetch
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
