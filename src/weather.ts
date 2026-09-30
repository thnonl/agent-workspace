/** The weather outside the windows: picked by the user or, in auto mode, made up from the date (the same all day long in 3-hour steps). */
export const WEATHERS = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'] as const;
export type Weather = (typeof WEATHERS)[number];
export const WEATHER_MODES = ['auto', ...WEATHERS] as const;
export type WeatherMode = (typeof WEATHER_MODES)[number];

/** how much of the daylight the weather takes away (0-1) */
export const OVERCAST: Record<Weather, number> = { clear: 0, cloudy: 0.45, rain: 0.72, storm: 0.92, snow: 0.55, fog: 0.5 };

export const WEATHER_LABEL: Record<Weather, string> = { clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', storm: 'Storm', snow: 'Snow', fog: 'Fog' };

/** small deterministic hash -> 0..1 */
function unit(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function autoWeather(date: Date, hour: number): Weather {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  const slot = Math.floor((((hour % 24) + 24) % 24) / 3);
  // weather lasts a few slots in a row: the value changes slowly from one slot to the next
  const r = unit(day * 8 + slot) * 0.6 + unit(day * 8 + Math.floor(slot / 2) + 4000) * 0.4;
  const winter = date.getMonth() === 11 || date.getMonth() <= 1;
  if (r < 0.5) return 'clear';
  if (r < 0.7) return 'cloudy';
  if (r < 0.88) return winter ? 'snow' : 'rain';
  if (r < 0.94) return winter ? 'snow' : 'storm';
  return 'fog';
}

export function resolveWeather(mode: WeatherMode, hour: number, date = new Date()): Weather {
  return mode === 'auto' ? autoWeather(date, hour) : mode;
}
