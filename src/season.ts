/** Festive decorations: Halloween, Christmas and Tết (Vietnamese Lunar New Year) are picked from the date. */
export const SEASONS = ['none', 'halloween', 'xmas', 'tet'] as const;
export type Season = (typeof SEASONS)[number];
export const SEASON_MODES = ['auto', 'off', 'halloween', 'xmas', 'tet'] as const;
export type SeasonMode = (typeof SEASON_MODES)[number];

export const SEASON_LABEL: Record<Season, string> = { none: 'No decorations', halloween: 'Halloween', xmas: 'Christmas', tet: 'Tết' };

/** first day of Tết (month is 1-based) */
const TET: [number, number, number][] = [
  [2026, 2, 17], [2027, 2, 6], [2028, 1, 26], [2029, 2, 13], [2030, 2, 3], [2031, 1, 23], [2032, 2, 11], [2033, 1, 31], [2034, 2, 19], [2035, 2, 8],
];

const DAY = 86_400_000;
const dayNo = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / DAY);

export function seasonFor(date: Date): Season {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const today = dayNo(y, m, d);
  for (const [ty, tm, td] of TET) {
    const tet = dayNo(ty, tm, td);
    if (today >= tet - 9 && today <= tet + 7) return 'tet';
  }
  if ((m === 10 && d >= 20) || (m === 11 && d === 1)) return 'halloween';
  if ((m === 12 && d >= 12) || (m === 1 && d <= 2)) return 'xmas';
  return 'none';
}

export function resolveSeason(mode: SeasonMode, date = new Date()): Season {
  return mode === 'auto' ? seasonFor(date) : mode === 'off' ? 'none' : mode;
}
