import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// Standard React 19 boot. StrictMode double-invokes effects in dev, handy here,
// because it flushes out any shatter that forgets to clean up after itself.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
