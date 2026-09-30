import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/nunito';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import { useStore } from './store';
import * as registry from './sim/registry';
import { getLayout } from './world/layout';

const CatLab = lazy(() => import('./scene/CatLab').then((m) => ({ default: m.CatLab })));
const WardrobeLab = lazy(() => import('./scene/WardrobeLab').then((m) => ({ default: m.WardrobeLab })));

if (import.meta.env.DEV) Object.assign(window, { __office: useStore, __registry: registry, __layout: getLayout });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.search.includes('catlab') ? (
      <Suspense fallback={null}>
        <CatLab />
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
