import { getSetting, setSetting } from './settings';

/** Small persisted preferences (stored by the server in SQLite, see settings.ts). */
const PREFIX = 'agent-workspace.';

export function loadPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = getSetting(PREFIX + key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadFlag(key: string, fallback: boolean): boolean {
  try {
    const v = getSetting(PREFIX + key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: string | boolean) {
  try {
    setSetting(PREFIX + key, typeof value === 'boolean' ? (value ? '1' : '0') : value);
  } catch {
    /* private mode */
  }
}

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(getSetting(PREFIX + key) ?? 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown) {
  try {
    setSetting(PREFIX + key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

export const QUALITIES = ['low', 'medium', 'high'] as const;
export type Quality = (typeof QUALITIES)[number];
