import type { ReactNode } from 'react';

/**
 * The icons of the HUD: small line drawings on a 24×24 grid that take the colour of the text around them
 * (so they follow day / night on their own). Emoji are only used inside the 3D scene.
 */
const P = (d: string) => <path d={d} />;

const ICONS = {
  building: <>{P('M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16')}{P('M15 9h4a1 1 0 0 1 1 1v11')}{P('M2 21h20')}{P('M8 8h2M8 12h2M8 16h2')}</>,
  sun: <><circle cx="12" cy="12" r="4" />{P('M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4')}</>,
  sunset: <>{P('M2 18h20')}{P('M6 18a6 6 0 0 1 12 0')}{P('M12 6v3M4.9 11.9l1.4 1.4M19.1 11.9l-1.4 1.4M12 3l-2 2M12 3l2 2')}</>,
  moon: P('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'),
  users: <><circle cx="9" cy="7" r="4" />{P('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2')}{P('M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8')}</>,
  user: <><circle cx="12" cy="7" r="4" />{P('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2')}</>,
  crown: <>{P('M2 5l3.5 12h13L22 5l-6 6-4-7-4 7z')}{P('M5 21h14')}</>,
  cat: <>{P('M12 5c.7 0 1.4.1 2 .3 1.8-2 5-2.8 6.4-2.3 1.4.6-.4 7-.4 7 .6 1.1 1 2.2 1 3.4C21 17.9 17 21 12 21s-9-3.1-9-7.6c0-1.2.5-2.3 1-3.4 0 0-1.9-6.4-.5-7C4.9 2.4 8.2 3.2 10 5.2A9 9 0 0 1 12 5z')}{P('M8.5 13.5v.5M15.5 13.5v.5M11 16.5h2')}</>,
  volume: <>{P('M11 5 6 9H2v6h4l5 4z')}{P('M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14')}</>,
  'volume-x': <>{P('M11 5 6 9H2v6h4l5 4z')}{P('M22 9l-6 6M16 9l6 6')}</>,
  crosshair: <><circle cx="12" cy="12" r="7" />{P('M12 2v4M12 18v4M2 12h4M18 12h4')}</>,
  help: <><circle cx="12" cy="12" r="10" />{P('M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01')}</>,
  info: <><circle cx="12" cy="12" r="10" />{P('M12 16v-4M12 8h.01')}</>,
  briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" />{P('M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16')}</>,
  coffee: <>{P('M17 8h1a4 4 0 0 1 0 8h-1')}{P('M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z')}{P('M6 2v3M10 2v3M14 2v3')}</>,
  'list-checks': <>{P('M9 6h11M9 12h11M9 18h11')}{P('M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2')}</>,
  'file-text': <>{P('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z')}{P('M14 2v6h6M8 13h8M8 17h8')}</>,
  clock: <><circle cx="12" cy="12" r="10" />{P('M12 6v6l4 2')}</>,
  scroll: <>{P('M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4')}{P('M19 17V5a2 2 0 0 0-2-2H4')}{P('M15 8h-5M15 12h-5')}</>,
  archive: <><rect x="2" y="3" width="20" height="5" rx="1" />{P('M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4')}</>,
  'chevron-down': P('m6 9 6 6 6-6'),
  'chevron-left': P('m15 18-6-6 6-6'),
  'chevron-right': P('m9 18 6-6-6-6'),
  'chevron-up': P('m18 15-6-6-6 6'),
  menu: P('M4 6h16M4 12h16M4 18h16'),
  x: P('M18 6 6 18M6 6l12 12'),
  check: P('M20 6 9 17l-5-5'),
  'check-circle': <><circle cx="12" cy="12" r="10" />{P('m9 12 2 2 4-4')}</>,
  'x-circle': <><circle cx="12" cy="12" r="10" />{P('m15 9-6 6M9 9l6 6')}</>,
  alert: <>{P('m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3')}{P('M12 9v4M12 17h.01')}</>,
  lightbulb: <>{P('M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5')}{P('M9 18h6M10 22h4')}</>,
  message: P('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'),
  wrench: P('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z'),
  inbox: <>{P('M22 12h-6l-2 3h-4l-2-3H2')}{P('M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z')}</>,
  send: <>{P('M22 2 11 13')}{P('M22 2l-7 20-4-9-9-4z')}</>,
  layers: <>{P('m12 2 10 5-10 5L2 7z')}{P('M2 17l10 5 10-5M2 12l10 5 10-5')}</>,
  'book-open': <>{P('M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z')}{P('M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z')}</>,
  pencil: P('M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z'),
  terminal: <>{P('m4 17 6-6-6-6')}{P('M12 19h8')}</>,
  search: <><circle cx="11" cy="11" r="8" />{P('m21 21-4.3-4.3')}</>,
  globe: <><circle cx="12" cy="12" r="10" />{P('M2 12h20')}{P('M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z')}</>,
  plug: <>{P('M12 22v-5M9 8V2M15 8V2')}{P('M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z')}</>,
  hourglass: <>{P('M5 22h14M5 2h14')}{P('M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22')}{P('M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2')}</>,
  timer: <><circle cx="12" cy="14" r="8" />{P('M10 2h4M12 14l3-3')}</>,
  'wifi-off': <>{P('M2 2l20 20')}{P('M8.5 16.5a5 5 0 0 1 7 0')}{P('M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8a15 15 0 0 0-8.4-3.7M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2.9-2')}{P('M12 20h.01')}</>,
  play: <path d="M6 4l14 8-14 8z" />,
  pause: <>{P('M8 4v16M16 4v16')}</>,
  dot: <circle cx="12" cy="12" r="3" fill="currentColor" />,
  wave: P('M7 11V6a2 2 0 0 1 4 0v5M11 10V4a2 2 0 0 1 4 0v7M15 10V6a2 2 0 0 1 4 0v8a8 8 0 0 1-8 8h-1a6 6 0 0 1-5-3l-3-5a2 2 0 0 1 3-2l2 2'),
  settings: <>{P('M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z')}<circle cx="12" cy="12" r="3" /></>,
  music: <>{P('M9 18V5l12-2v13')}<circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  camera: <>{P('M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z')}<circle cx="12" cy="13" r="3" /></>,
  trophy: <>{P('M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16')}{P('M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22')}{P('M18 2H6v7a6 6 0 0 0 12 0V2z')}</>,
  maximize: P('M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3'),
  'cloud-rain': <>{P('M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2')}{P('M16 14v6M8 14v6M12 16v6')}</>,
  sparkles: <>{P('M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z')}{P('M19 3v4M17 5h4')}</>,
  pip: <><rect x="2" y="4" width="20" height="16" rx="2" /><rect x="12" y="12" width="8" height="6" rx="1" /></>,
  smartphone: <><rect x="6" y="2" width="12" height="20" rx="2" />{P('M11 18h2')}</>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />{P('M14 14h3v3M21 14v.01M14 21h3M21 18v3h-1M17 17v.01')}</>,
  download: <>{P('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4')}{P('M7 10l5 5 5-5M12 15V3')}</>,
  copy: <><rect x="8" y="8" width="14" height="14" rx="2" />{P('M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2')}</>,
  star: P('m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3-6.2 3.3L7 14.2 2 9.3l6.9-1z'),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`ico${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}
