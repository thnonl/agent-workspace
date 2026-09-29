export type FloorKind = 'wood' | 'checker' | 'carpet' | 'tiles' | 'carpetTile';

export interface RoomTheme {
  name: string;
  wall: string;
  trim: string;
  stripe: string;
  floor: string;
  floor2: string;
  floorKind: FloorKind;
  base: string;
  accent: string;
  accent2: string;
  accent3: string;
  desk: string;
  deskTop: string;
  chair: string;
  rug: string;
  curtain: string;
  sky: [string, string];
  light: string;
}

export const THEMES: RoomTheme[] = [
  {
    name: 'Peach Cream',
    wall: '#ffe1d0', trim: '#fff6ee', stripe: '#ffc4a8',
    floor: '#ecc79f', floor2: '#dfb389', floorKind: 'wood', base: '#c9977a',
    accent: '#ff7a8a', accent2: '#7bd3c2', accent3: '#ffd166',
    desk: '#ffb98f', deskTop: '#fff0dc', chair: '#7bd3c2', rug: '#ffb8c6', curtain: '#ff9aa8',
    sky: ['#ffe9f0', '#ffd0b5'], light: '#fff1e2',
  },
  {
    name: 'Mint Garden',
    wall: '#d3f3e3', trim: '#f4fff9', stripe: '#a9e6c9',
    floor: '#f7f2e0', floor2: '#dfead0', floorKind: 'checker', base: '#8cc7ad',
    accent: '#ff9fb7', accent2: '#ffd166', accent3: '#8fd3ff',
    desk: '#9adfc0', deskTop: '#fbf6e6', chair: '#ff9fb7', rug: '#b7e7d2', curtain: '#8fd3ff',
    sky: ['#e2fcef', '#cdeeff'], light: '#f4fff6',
  },
  {
    name: 'Lavender Loft',
    wall: '#e4d9ff', trim: '#faf7ff', stripe: '#c9b8fa',
    floor: '#cfc0f4', floor2: '#c2b1ee', floorKind: 'carpetTile', base: '#9f8bd6',
    accent: '#ffc857', accent2: '#ff8fb1', accent3: '#7fe0c8',
    desk: '#b9a5f2', deskTop: '#f6f1ff', chair: '#ffc857', rug: '#ffd9e6', curtain: '#ff8fb1',
    sky: ['#f0e7ff', '#ffe2f0'], light: '#f7f0ff',
  },
  {
    name: 'Sky Studio',
    wall: '#d2ecff', trim: '#f6fbff', stripe: '#a8d8f8',
    floor: '#dfe6ee', floor2: '#cfd9e6', floorKind: 'carpetTile', base: '#8fbde0',
    accent: '#ff8c7a', accent2: '#ffd65a', accent3: '#b79bff',
    desk: '#8fc9f5', deskTop: '#fff4e0', chair: '#ff8c7a', rug: '#c8e6ff', curtain: '#ffd65a',
    sky: ['#def3ff', '#fff0da'], light: '#f4faff',
  },
  {
    name: 'Bubblegum',
    wall: '#ffd6e8', trim: '#fff6fa', stripe: '#ffb3d1',
    floor: '#fff5fa', floor2: '#ffdfee', floorKind: 'tiles', base: '#e996b9',
    accent: '#4fc3d9', accent2: '#ffe066', accent3: '#a78bfa',
    desk: '#ff9ec4', deskTop: '#fff9fc', chair: '#4fc3d9', rug: '#ffc2dc', curtain: '#4fc3d9',
    sky: ['#ffe9f4', '#e0f4ff'], light: '#fff2f8',
  },
  {
    name: 'Lemon Soda',
    wall: '#fff3b8', trim: '#fffbe0', stripe: '#ffe27a',
    floor: '#ebd1a2', floor2: '#dfc191', floorKind: 'wood', base: '#d2b25a',
    accent: '#6dd3a8', accent2: '#ff8fa3', accent3: '#7cc4ff',
    desk: '#ffd95e', deskTop: '#fffbe8', chair: '#6dd3a8', rug: '#c5f0dc', curtain: '#ff8fa3',
    sky: ['#fff8d0', '#dcf6ea'], light: '#fffbe6',
  },
  {
    name: 'Ocean Teal',
    wall: '#c7f0ee', trim: '#f2fffe', stripe: '#8fdcd8',
    floor: '#c9dcd9', floor2: '#b9d0cd', floorKind: 'carpetTile', base: '#6fbfba',
    accent: '#ff7c7c', accent2: '#ffc94d', accent3: '#c3a6ff',
    desk: '#66cfc8', deskTop: '#fff6e6', chair: '#ff7c7c', rug: '#a9e8e4', curtain: '#ffc94d',
    sky: ['#d8f6f4', '#e7edff'], light: '#f2fffd',
  },
  {
    name: 'Sunset Apricot',
    wall: '#ffd5b8', trim: '#fff2e6', stripe: '#ffb78a',
    floor: '#fae6d0', floor2: '#efcca8', floorKind: 'checker', base: '#d99a6e',
    accent: '#9b8cff', accent2: '#5ed3b0', accent3: '#ff7a8a',
    desk: '#ffa877', deskTop: '#fff3e4', chair: '#9b8cff', rug: '#ffc7dd', curtain: '#9b8cff',
    sky: ['#ffdec8', '#ffc6dd'], light: '#fff0e2',
  },
  {
    name: 'Matcha Latte',
    wall: '#ddebc3', trim: '#f8fff0', stripe: '#bfdc94',
    floor: '#e3caa1', floor2: '#d6b98c', floorKind: 'wood', base: '#9fbe6f',
    accent: '#ff9f7a', accent2: '#8fd3ff', accent3: '#ffd166',
    desk: '#a8d67c', deskTop: '#fbf4e2', chair: '#ff9f7a', rug: '#f4d9b8', curtain: '#ff9f7a',
    sky: ['#eaf7d6', '#d4efff'], light: '#f8fff0',
  },
];

export function themeFor(index: number): RoomTheme {
  return THEMES[((index % THEMES.length) + THEMES.length) % THEMES.length];
}
