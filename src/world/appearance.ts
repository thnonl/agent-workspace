import { Rng } from '../util/rng';

export type Gender = 'male' | 'female' | 'nb';
export type HairStyle =
  | 'short' | 'bob' | 'ponytail' | 'buns' | 'spiky' | 'long' | 'afro' | 'twintails' | 'bald' | 'mohawk' | 'curly' | 'sidepart';
export type TopStyle = 'tee' | 'hoodie' | 'shirt' | 'sweater' | 'dress' | 'overalls' | 'suit' | 'jacket' | 'tank';
export type BottomStyle = 'pants' | 'shorts' | 'skirt' | 'none';
export type Accessory =
  | 'none' | 'glasses' | 'round-glasses' | 'headphones' | 'beanie' | 'cap' | 'bow' | 'headband' | 'bunny-ears' | 'cat-ears' | 'flower' | 'crown' | 'scarf';

export interface Appearance {
  gender: Gender;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  eye: string;
  top: TopStyle;
  topColor: string;
  topAccent: string;
  bottom: BottomStyle;
  bottomColor: string;
  shoes: string;
  accessory: Accessory;
  accessoryColor: string;
  backpack: string;
  scale: number;
  blush: string;
  freckles: boolean;
  isDirector: boolean;
}

// warm light-to-medium tones only: nobody looks dark or muddy next to the pastel office
const SKINS = ['#ffe8d8', '#ffdfc6', '#ffd3b6', '#f9c9a6', '#f2bc98', '#e9b08c', '#dfa47e'];
const HAIRS = [
  '#2b2233', '#3d2b28', '#5a3a26', '#8a5a2e', '#c98a3f', '#e8b95a', '#f7d774', '#ff7eb6', '#ff5f7e', '#7ec8ff',
  '#a58bff', '#6fe0b5', '#e2dcf2', '#ff9b54', '#4c5b9a',
];
const TOPS = [
  '#ff7a8a', '#ffb347', '#ffd166', '#8fd694', '#5ed3b0', '#6ec6ff', '#8fa3ff', '#b79bff', '#ff9ec4', '#ffffff',
  '#f4f1ea', '#ff6f59', '#3ec1d3', '#c1e77e', '#f9a8d4',
];
const BOTTOMS = ['#3f5a8a', '#2f3e5e', '#5b6c8f', '#6b5b95', '#7a6a58', '#c9b79c', '#4b4b5a', '#ff8fab', '#7bc5ae', '#f2c14e'];
const SHOES = ['#ffffff', '#ff5d73', '#3a3a4a', '#ffb347', '#6ec6ff', '#f4ecd8', '#8a6a4f'];
const BACKPACKS = ['#ff9f7a', '#8fa3ff', '#5ed3b0', '#ffd166', '#ff8fb1', '#b79bff', '#6ec6ff'];
const ACC_COLORS = ['#ff5d73', '#ffd166', '#6ec6ff', '#b79bff', '#5ed3b0', '#ff9ec4', '#ffffff'];
const SUITS = ['#3a3f5c', '#2f4858', '#4a3b52', '#5b3a3a', '#334e46', '#41434f', '#2c3e66'];

const MALE_HAIR: HairStyle[] = ['short', 'spiky', 'sidepart', 'mohawk', 'curly', 'afro', 'bald', 'short', 'sidepart'];
const FEMALE_HAIR: HairStyle[] = ['bob', 'ponytail', 'buns', 'long', 'twintails', 'curly', 'afro', 'sidepart', 'bob', 'long'];
const NB_HAIR: HairStyle[] = ['bob', 'short', 'spiky', 'curly', 'buns', 'sidepart', 'mohawk', 'ponytail', 'afro'];

export function makeAppearance(seed: number, opts: { director?: boolean } = {}): Appearance {
  const r = new Rng(seed ^ 0x51ed270b);
  const gender: Gender = r.weighted<Gender>([['male', 4], ['female', 4], ['nb', 1.4]]);
  const hairStyle = r.pick(gender === 'male' ? MALE_HAIR : gender === 'female' ? FEMALE_HAIR : NB_HAIR);
  const director = !!opts.director;

  let top: TopStyle;
  let bottom: BottomStyle;
  if (director) {
    top = 'suit';
    bottom = gender === 'female' && r.chance(0.5) ? 'skirt' : 'pants';
  } else {
    top = r.weighted<TopStyle>([
      ['tee', 3], ['hoodie', 2.4], ['shirt', 2], ['sweater', 2], ['dress', gender === 'female' ? 3 : gender === 'nb' ? 1 : 0.15],
      ['overalls', 1.4], ['jacket', 1.6], ['tank', 1],
    ]);
    bottom = top === 'dress' ? 'none' : r.weighted<BottomStyle>([['pants', 4], ['shorts', 2.4], ['skirt', gender === 'female' ? 3 : gender === 'nb' ? 1 : 0.2]]);
  }
  const accessory: Accessory = director
    ? r.weighted<Accessory>([['glasses', 3], ['round-glasses', 2], ['none', 2], ['crown', 0.8]])
    : r.weighted<Accessory>([
        ['none', 4], ['glasses', 2], ['round-glasses', 1.6], ['headphones', 1.6], ['beanie', 1.2], ['cap', 1.2], ['bow', gender === 'female' ? 2 : 0.3],
        ['headband', 1], ['bunny-ears', 0.5], ['cat-ears', 0.7], ['flower', gender === 'female' ? 1 : 0.2], ['scarf', 1],
      ]);
  // hats hide hair styles that need a lot of volume
  const bigHair = hairStyle === 'afro' || hairStyle === 'buns' || hairStyle === 'mohawk' || hairStyle === 'spiky';
  const acc: Accessory = bigHair && (accessory === 'beanie' || accessory === 'cap' || accessory === 'headband' || accessory === 'crown') ? 'glasses' : accessory;

  return {
    gender,
    skin: r.pick(SKINS),
    hair: r.pick(HAIRS),
    hairStyle,
    eye: r.pick(['#3b2a3f', '#2b3a55', '#4a2f27', '#2f4a3a', '#5a3d7a']),
    top,
    topColor: director ? r.pick(SUITS) : r.pick(TOPS),
    topAccent: r.pick(TOPS),
    bottom,
    bottomColor: r.pick(BOTTOMS),
    shoes: r.pick(SHOES),
    accessory: acc,
    accessoryColor: r.pick(ACC_COLORS),
    backpack: r.pick(BACKPACKS),
    scale: director ? 1.1 : r.range(0.94, 1.04),
    blush: r.pick(['#ff9fb0', '#ff8f9f', '#ffa9a0']),
    freckles: r.chance(0.18),
    isDirector: director,
  };
}
