import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { useStore } from './store';
import * as registry from './sim/registry';
import { getLayout } from './world/layout';

const CatLab = lazy(() => import('./scene/CatLab').then((m) => ({ default: m.CatLab })));

if (import.meta.env.DEV) Object.assign(window, { __office: useStore, __registry: registry, __layout: getLayout });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.search.includes('catlab') ? (
      <Suspense fallback={null}>
        <CatLab />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
