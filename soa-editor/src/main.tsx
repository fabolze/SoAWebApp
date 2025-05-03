// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import AbilitiesEditor from './pages/AbilitiesEditor';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AbilitiesEditor />
  </React.StrictMode>
);