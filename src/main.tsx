import '@fontsource-variable/baloo-2';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import './styles.fx.css';
import { initSettings } from './settings';
import { initRoomPeople } from './roomPeople';

// the settings and the head counts come from the server (SQLite): load them before any module reads one (the store reads them when it is created)
void Promise.all([initSettings(), initRoomPeople()]).then(() => import('./boot'));
