import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CatLab } from './scene/CatLab';
import './styles.css';
import { useStore } from './store';
import * as registry from './sim/registry';
import { getLayout } from './world/layout';

if (import.meta.env.DEV) Object.assign(window, { __office: useStore, __registry: registry, __layout: getLayout });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.search.includes('catlab') ? <CatLab /> : <App />}
  </StrictMode>,
);
