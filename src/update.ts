import { create } from 'zustand';
import { useStore } from './store';

/** What /api/version answers (server/update.mjs). */
export interface UpdateInfo {
  name: string;
  current: string;
  latest: string | null;
  newer: boolean;
  /** how the host started this copy: 'npx' | 'checkout' | 'npm' */
  kind: string;
  /** to type on the host, in order, after stopping the server */
  commands: string[];
  /** the host's computer name */
  host: string;
  /** this page runs on the host itself */
  local: boolean;
}

interface UpdateState {
  info: UpdateInfo | null;
  open: boolean;
  setOpen(open: boolean): void;
}

const SEEN_KEY = 'claude-office:update-seen';
const POLL_MS = 60 * 60 * 1000;

/**
 * The Android app gets its own updates (an APK from GitHub) and only shows the page: the npm note is for browsers. The
 * note opens by itself once per new version; the top bar button opens it again.
 */
export const inAndroidApp = typeof navigator !== 'undefined' && navigator.userAgent.includes('AgentWorkspaceApp');

export const useUpdate = create<UpdateState>((set, get) => ({
  info: null,
  open: false,
  setOpen(open) {
    if (open === get().open) return;
    const latest = get().info?.latest;
    if (!open && latest) {
      try {
        localStorage.setItem(SEEN_KEY, latest);
      } catch {
        /* private mode: the note comes back next time, no harm */
      }
    }
    set({ open });
  },
}));

function seen(version: string) {
  try {
    return localStorage.getItem(SEEN_KEY) === version;
  } catch {
    return false;
  }
}

async function poll() {
  try {
    const r = await fetch('/api/version', { cache: 'no-store' });
    if (!r.ok) return;
    const info = (await r.json()) as UpdateInfo;
    useUpdate.setState({ info });
    const s = useStore.getState();
    // (not over the screensaver or into the small floating window: the next poll tries again)
    if (info.newer && info.latest && !seen(info.latest) && !s.cinema && !s.pip) useUpdate.getState().setOpen(true);
  } catch {
    /* server gone or offline: try again next time */
  }
}

/** Asks the server now and every hour (the server itself asks npm at most every 6 h). Returns the stop function. */
export function startUpdateCheck(): () => void {
  if (inAndroidApp) return () => {};
  void poll();
  const id = window.setInterval(() => void poll(), POLL_MS);
  return () => window.clearInterval(id);
}
