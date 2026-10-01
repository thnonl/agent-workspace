import '@fontsource-variable/baloo-2';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import './styles.fx.css';
import { initSettings } from './settings';

// the settings come from the server (SQLite): load them before any module reads one (the store reads them when it is created)
void initSettings().then(() => import('./boot'));
