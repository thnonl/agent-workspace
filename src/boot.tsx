import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useStore } from './store';
import * as registry from './sim/registry';
import { getLayout } from './world/layout';
import { useProgress } from './progress';

const CatLab = lazy(() => import('./scene/CatLab').then((m) => ({ default: m.CatLab })));
const PlantLab = lazy(() => import('./scene/PlantLab').then((m) => ({ default: m.PlantLab })));
const WardrobeLab = lazy(() => import('./scene/WardrobeLab').then((m) => ({ default: m.WardrobeLab })));

if (import.meta.env.DEV) Object.assign(window, { __office: useStore, __registry: registry, __layout: getLayout, __progress: useProgress });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.search.includes('catlab') ? (
      <Suspense fallback={null}>
        <CatLab />
      </Suspense>
    ) : location.search.includes('plantlab') ? (
      <Suspense fallback={null}>
        <PlantLab />
      </Suspense>
    ) : location.search.includes('wardrobe') ? (
      <Suspense fallback={null}>
        <WardrobeLab />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
