import { Rng, hashString } from './util/rng';

/**
 * Names for the director and the staff. The user's own list is stored in localStorage and shared by
 * every room / every run; when it is used up, common English names are used instead.
 */
const NAMES_KEY = 'claude-office:names';
const ASSIGNED_KEY = 'claude-office:assigned';

export const FALLBACK_NAMES = [
  'Alex', 'Sam', 'Jamie', 'Taylor', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Avery', 'Quinn', 'Charlie', 'Emma', 'Liam', 'Olivia', 'Noah',
  'Sophia', 'Mason', 'Mia', 'Ethan', 'Ava', 'Lucas', 'Lily', 'Henry', 'Chloe', 'Jack', 'Grace', 'Ben', 'Zoe', 'Leo', 'Ruby', 'Oliver',
  'Hannah', 'Daniel', 'Nora', 'Owen', 'Ella', 'Jacob', 'Layla', 'Ryan', 'Maya', 'Nathan', 'Ivy', 'Adam', 'Clara', 'Max', 'Rose', 'Tom',
  'Anna', 'Eric', 'Julia',
];

export function parseNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    // composed form: a name with separate combining marks (NFD) would take its accents from a fallback font
    const n = raw.normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    out.push(n);
    if (out.length >= 300) break;
  }
  return out;
}

export function loadNames(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(NAMES_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.normalize('NFC')) : [];
  } catch {
    return [];
  }
}

export function saveNames(list: string[]) {
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(list));
  } catch {
    /* private mode – the list simply is not remembered */
  }
}

function loadAssigned(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(ASSIGNED_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Remember who got which name so a page refresh keeps everybody's name. */
export function rememberAssigned(key: string, name: string) {
  try {
    const all = loadAssigned();
    delete all[key];
    all[key] = name;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete all[k];
    localStorage.setItem(ASSIGNED_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

const recent = new Map<string, string[]>();

/**
 * Pick a name for a character. The user's list always comes first: a remembered name is only kept when
 * it is on that list (or when the list has no free name left for this room); otherwise a random free name
 * from the list, then a common English name, then "Name 2", "Name 3"…
 * `fresh` ignores the remembered name (used when the list has just been changed).
 */
export function pickName(roomId: string, agentKey: string, userNames: string[], taken: Set<string>, fresh = false): string {
  const isFree = (n: string) => !taken.has(n.toLowerCase());
  const onList = (n: string) => userNames.some((u) => u.toLowerCase() === n.toLowerCase());
  const saved = fresh ? undefined : loadAssigned()[agentKey];
  let name = saved && isFree(saved) && (onList(saved) || !userNames.some(isFree)) ? saved : '';
  if (!name) {
    const rng = new Rng(hashString(agentKey));
    const used = recent.get(roomId) ?? [];
    const pick = (pool: string[]) => {
      const fresh = pool.filter((n) => !used.includes(n));
      return rng.pick(fresh.length ? fresh : pool);
    };
    const mine = userNames.filter(isFree);
    if (mine.length) name = pick(mine);
    else {
      const fb = FALLBACK_NAMES.filter((n) => isFree(n) && !userNames.some((u) => u.toLowerCase() === n.toLowerCase()));
      if (fb.length) name = pick(fb);
      else {
        const base = rng.pick(FALLBACK_NAMES);
        let i = 2;
        while (!isFree(`${base} ${i}`)) i++;
        name = `${base} ${i}`;
      }
    }
    recent.set(roomId, [...used, name].slice(-Math.max(6, userNames.length)));
  }
  rememberAssigned(agentKey, name);
  return name;
}
