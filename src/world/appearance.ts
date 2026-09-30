import { Rng } from '../util/rng';

export type Gender = 'male' | 'female' | 'nb';
export type HairStyle =
  | 'short' | 'bob' | 'ponytail' | 'buns' | 'spiky' | 'long' | 'afro' | 'twintails' | 'bald' | 'mohawk' | 'curly' | 'sidepart';
export type TopStyle =
  | 'tee' | 'hoodie' | 'shirt' | 'sweater' | 'dress' | 'overalls' | 'suit' | 'jacket' | 'tank'
  | 'blazer' | 'vest' | 'cardigan' | 'polo' | 'coat' | 'stripe';
export type BottomStyle = 'pants' | 'shorts' | 'skirt' | 'none' | 'slacks' | 'joggers' | 'midi';
export type ShoeStyle = 'sneaker' | 'loafer' | 'boot' | 'mary-jane';
/** worn on the head instead of a hat: hair accessories, ear gear, ears */
export type Accessory =
  | 'none' | 'headphones' | 'earmuffs' | 'bow' | 'headband' | 'hairclip' | 'bunny-ears' | 'cat-ears' | 'flower' | 'crown';
export type Hat = 'none' | 'beanie' | 'cap' | 'beret' | 'fedora' | 'bucket' | 'tophat' | 'newsboy' | 'sunhat' | 'bowler';
export type Eyewear = 'none' | 'glasses' | 'round-glasses' | 'sunglasses' | 'cateye' | 'monocle';
export type Neckwear = 'none' | 'scarf' | 'tie' | 'bowtie' | 'ascot' | 'pearls' | 'kerchief' | 'lanyard';
export type Wrist = 'none' | 'watch' | 'bracelet' | 'wristband';
export type Earrings = 'none' | 'studs' | 'hoops' | 'drops';

export interface Appearance {
  gender: Gender;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  eye: string;
  top: TopStyle;
  topColor: string;
  topAccent: string;
  /** the shirt under a vest, blazer or suit */
  shirt: string;
  bottom: BottomStyle;
  bottomColor: string;
  shoes: string;
  shoeStyle: ShoeStyle;
  accessory: Accessory;
  accessoryColor: string;
  hat: Hat;
  hatColor: string;
  eyewear: Eyewear;
  neckwear: Neckwear;
  neckColor: string;
  wrist: Wrist;
  earrings: Earrings;
  /** a folded square in the breast pocket of a suit or blazer */
  pocketSquare: boolean;
  backpack: string;
  scale: number;
  blush: string;
  freckles: boolean;
  isDirector: boolean;
}

// light, warm tones only: nobody looks dark or muddy next to the pastel office
const SKINS = ['#fff1e6', '#ffe8d8', '#ffdfc6', '#ffd8bd', '#fcd0b0', '#f8c8a8', '#f4c09e'];
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
/** loafers and boots look like leather */
const LEATHER = ['#3a2a22', '#5a3a26', '#2b2233', '#8a5a3c', '#7a2f3a', '#1f2a3d'];
const BACKPACKS = ['#ff9f7a', '#8fa3ff', '#5ed3b0', '#ffd166', '#ff8fb1', '#b79bff', '#6ec6ff'];
const ACC_COLORS = ['#ff5d73', '#ffd166', '#6ec6ff', '#b79bff', '#5ed3b0', '#ff9ec4', '#ffffff'];
const SUITS = ['#3a3f5c', '#2f4858', '#4a3b52', '#5b3a3a', '#334e46', '#41434f', '#2c3e66'];
/** blazers, waistcoats and coats: tailored colours, a bit softer than the boardroom suits */
const TAILORED = ['#3a3f5c', '#2f4858', '#7a5a44', '#a08a70', '#5b6c8f', '#6b5b95', '#334e46', '#8f4a5a', '#c9b79c', '#41434f', '#d9a441'];
const SHIRTS = ['#ffffff', '#f4f1ea', '#dbe8ff', '#ffe3ec', '#e4f5e8', '#fff1c9'];
const HATS = ['#3a3f5c', '#7a5a44', '#c9b79c', '#5a5f6e', '#ffb3c6', '#e34c67', '#2f6b5a', '#f1d9a0', '#a58bff', '#6ec6ff', '#ffb347'];
const NECK_COLORS = ['#ff5d73', '#3a3f5c', '#ffd166', '#6ec6ff', '#8f4a5a', '#5ed3b0', '#b79bff', '#ff9ec4'];

const MALE_HAIR: HairStyle[] = ['short', 'spiky', 'sidepart', 'mohawk', 'curly', 'afro', 'bald', 'short', 'sidepart'];
const FEMALE_HAIR: HairStyle[] = ['bob', 'ponytail', 'buns', 'long', 'twintails', 'curly', 'afro', 'sidepart', 'bob', 'long'];
const NB_HAIR: HairStyle[] = ['bob', 'short', 'spiky', 'curly', 'buns', 'sidepart', 'mohawk', 'ponytail', 'afro'];

const FORMAL_TOPS: readonly TopStyle[] = ['suit', 'vest', 'blazer', 'shirt'];
/** the tops a tie, bow tie or ascot goes with */
const TIE_TOPS: readonly TopStyle[] = ['suit', 'vest', 'blazer', 'shirt', 'cardigan'];

export function makeAppearance(seed: number, opts: { director?: boolean } = {}): Appearance {
  // (the first stream keeps the draws of the original look – skin, hair, eyes… – in place; everything added later comes from `w`)
  const r = new Rng(seed ^ 0x51ed270b);
  const w = new Rng(seed ^ 0x2c1b3c6d);
  const gender: Gender = r.weighted<Gender>([['male', 4], ['female', 4], ['nb', 1.4]]);
  const hairStyle = r.pick(gender === 'male' ? MALE_HAIR : gender === 'female' ? FEMALE_HAIR : NB_HAIR);
  const director = !!opts.director;
  const fem = gender === 'female';
  const nb = gender === 'nb';

  let top: TopStyle;
  let bottom: BottomStyle;
  if (director) {
    top = w.weighted<TopStyle>([['suit', 5], ['vest', 1.4], ['blazer', 1.6], ['coat', 0.5]]);
    bottom = fem && w.chance(0.5) ? (w.chance(0.4) ? 'midi' : 'skirt') : w.chance(0.7) ? 'slacks' : 'pants';
  } else {
    top = r.weighted<TopStyle>([
      ['tee', 3], ['hoodie', 2.4], ['shirt', 2], ['sweater', 2], ['dress', fem ? 3 : nb ? 1 : 0.15],
      ['overalls', 1.4], ['jacket', 1.6], ['tank', 1],
    ]);
    // (the extra tops take a share of the old ones: the same draw picks among them)
    if (top === 'tee' && w.chance(0.3)) top = 'stripe';
    else if (top === 'tee' && w.chance(0.3)) top = 'polo';
    else if (top === 'shirt' && w.chance(0.5)) top = w.pick(['vest', 'blazer']);
    else if (top === 'sweater' && w.chance(0.4)) top = 'cardigan';
    else if (top === 'jacket' && w.chance(0.4)) top = w.pick(['blazer', 'coat']);
    else if (top === 'hoodie' && w.chance(0.15)) top = 'cardigan';
    bottom = top === 'dress' ? 'none' : r.weighted<BottomStyle>([['pants', 4], ['shorts', 2.4], ['skirt', fem ? 3 : nb ? 1 : 0.2]]);
    if (bottom === 'pants') {
      if (FORMAL_TOPS.includes(top) && w.chance(0.65)) bottom = 'slacks';
      else if (w.chance(0.2)) bottom = 'joggers';
    } else if (bottom === 'skirt' && w.chance(0.35)) bottom = 'midi';
  }
  // (kept as a draw of its own so the streams stay in step; the value only matters for the head accessory)
  const headAcc = r.weighted<Accessory>([
    ['none', 4], ['headphones', 1.6], ['bow', fem ? 2 : 0.3], ['headband', 1], ['bunny-ears', 0.5], ['cat-ears', 0.7], ['flower', fem ? 1 : 0.2],
    ['earmuffs', 0.6], ['hairclip', fem ? 1.2 : 0.3],
  ]);

  // hats need room: hair with a lot of volume goes bare (or wears a small accessory instead)
  const bigHair = hairStyle === 'afro' || hairStyle === 'buns' || hairStyle === 'mohawk' || hairStyle === 'spiky' || hairStyle === 'curly';
  let hat: Hat = director
    ? w.weighted<Hat>([['none', 8], ['bowler', 1], ['fedora', 1], ['tophat', 0.7]])
    : w.weighted<Hat>([
        ['none', 9], ['beanie', 1.2], ['cap', 1.3], ['beret', fem ? 1.4 : 0.4], ['fedora', 0.9], ['bucket', 1], ['tophat', 0.25], ['newsboy', 0.8],
        ['sunhat', fem ? 1 : 0.2], ['bowler', 0.4],
      ]);
  if (bigHair && hat !== 'beret') hat = 'none';
  let accessory: Accessory = director ? w.weighted<Accessory>([['none', 6], ['crown', 0.8]]) : headAcc;
  // one thing on top of the head (headphones and earmuffs still fit under nothing but a bare head)
  if (hat !== 'none' && accessory !== 'none' && accessory !== 'hairclip') accessory = 'none';
  if (bigHair && (accessory === 'crown' || accessory === 'headband')) accessory = 'none';

  const eyewear: Eyewear = director
    ? w.weighted<Eyewear>([['glasses', 3], ['round-glasses', 2], ['none', 2], ['monocle', 0.5], ['cateye', fem ? 0.8 : 0]])
    : w.weighted<Eyewear>([
        ['none', 6], ['glasses', 2], ['round-glasses', 1.6], ['sunglasses', 1], ['cateye', fem ? 1.2 : 0.2], ['monocle', 0.15],
      ]);

  let neckwear: Neckwear;
  if (TIE_TOPS.includes(top) && top !== 'cardigan') {
    neckwear = w.weighted<Neckwear>([['tie', 5], ['bowtie', 2], ['ascot', 1], ['none', director ? 0.3 : 2], ['lanyard', director ? 0 : 1], ['pearls', fem ? 1 : 0.1]]);
    if (top === 'suit' && neckwear === 'lanyard') neckwear = 'tie';
  } else if (top === 'dress' || top === 'sweater' || top === 'cardigan' || top === 'tee' || top === 'stripe') {
    neckwear = w.weighted<Neckwear>([['none', 6], ['scarf', 1.6], ['pearls', fem ? 1.6 : 0.15], ['kerchief', 0.8], ['lanyard', 1.4], ['bowtie', top === 'cardigan' ? 0.6 : 0]]);
  } else {
    neckwear = w.weighted<Neckwear>([['none', 6], ['scarf', 1.6], ['kerchief', 0.7], ['lanyard', 1.2]]);
  }
  if (top === 'coat' && neckwear === 'none' && w.chance(0.5)) neckwear = 'scarf';
  if (top === 'tank' && neckwear === 'scarf') neckwear = 'kerchief';

  const wrist: Wrist = w.weighted<Wrist>([['none', 6], ['watch', 2], ['bracelet', fem ? 1.4 : 0.4], ['wristband', 0.8]]);
  const earrings: Earrings = w.weighted<Earrings>([['none', fem ? 3 : nb ? 5 : 12], ['studs', 1.5], ['hoops', fem ? 1.4 : 0.3], ['drops', fem ? 1 : 0.1]]);
  const shoeStyle: ShoeStyle = FORMAL_TOPS.includes(top) || top === 'coat' || bottom === 'slacks'
    ? w.weighted<ShoeStyle>([['loafer', 4], ['boot', 1.4], ['mary-jane', fem ? 1.2 : 0], ['sneaker', 1]])
    : bottom === 'skirt' || bottom === 'midi' || top === 'dress'
      ? w.weighted<ShoeStyle>([['mary-jane', 3], ['sneaker', 3], ['boot', 2], ['loafer', 1.5]])
      : w.weighted<ShoeStyle>([['sneaker', 6], ['boot', 1.4], ['loafer', 1]]);
  const pocketSquare = (top === 'suit' || top === 'blazer') && w.chance(director ? 0.55 : 0.4);
  const tailored = top === 'blazer' || top === 'vest' || top === 'coat';

  const skin = r.pick(SKINS);
  const hairColor = r.pick(HAIRS);
  const eye = r.pick(['#3b2a3f', '#2b3a55', '#4a2f27', '#2f4a3a', '#5a3d7a']);
  // (draw order of the original look: top colour, accent, bottom, shoes, accessory colour, backpack, scale, blush, freckles)
  const baseTop = director ? r.pick(SUITS) : r.pick(TOPS);
  const topColor = tailored && !(director && top === 'suit') ? w.pick(director ? SUITS : TAILORED) : baseTop;
  const topAccent = r.pick(TOPS);
  const bottomColor = r.pick(BOTTOMS);
  const shoes = r.pick(SHOES);
  const accessoryColor = r.pick(ACC_COLORS);
  const backpack = r.pick(BACKPACKS);
  const scale = director ? 1.1 : r.range(0.94, 1.04);
  const blush = r.pick(['#ff9fb0', '#ff8f9f', '#ffa9a0']);
  const freckles = r.chance(0.18);

  // tailored trousers go with the jacket or vest (and never a bright denim blue next to a wine-red blazer)
  const slacksColor = bottom === 'slacks' ? (top === 'suit' || top === 'blazer' || top === 'vest' ? shadeTowards(topColor, w.chance(0.5)) : w.pick(SUITS)) : bottomColor;

  return {
    gender,
    skin,
    hair: hairColor,
    hairStyle,
    eye,
    top,
    topColor,
    topAccent,
    shirt: w.pick(SHIRTS),
    bottom,
    bottomColor: slacksColor,
    shoes: shoeStyle === 'loafer' || shoeStyle === 'boot' ? w.pick(LEATHER) : shoeStyle === 'mary-jane' ? w.pick(['#ff5d73', '#3a3a4a', '#ffd166', '#b79bff', '#ffffff']) : shoes,
    shoeStyle,
    accessory,
    accessoryColor,
    hat,
    hatColor: hat === 'sunhat' ? '#f1d9a0' : w.pick(HATS),
    eyewear,
    neckwear,
    neckColor: w.pick(NECK_COLORS),
    wrist,
    earrings,
    pocketSquare,
    backpack,
    scale,
    blush,
    freckles,
    isDirector: director,
  };
}

/** the trouser colour of a tailored set: the jacket's own colour, or a neighbouring one (returns a hex string) */
function shadeTowards(hex: string, same: boolean): string {
  if (same) return hex;
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * 0.72)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
