// Interface sprites: coin, seed packets, plot/grass tiles, icons.
import { INK } from './pixel.js';

const U = {
  o: INK, w: '#ffffff', W: '#e4dccf', k: INK,
  y: '#ffd23f', Y: '#d8901a', l: '#fff6b0',
  g: '#5dbb4c', G: '#2f7a3a', h: '#9be07a',
  r: '#e84855', R: '#a8283a', p: '#ffa6d2',
  b: '#a0643a', B: '#6a3f24', n: '#d39a5e',
  x: '#5ab8f0', X: '#2f7fc8', c: '#c8f0ff',
  s: '#a9a9bd', S: '#727090', v: '#a07ae8', V: '#5a3f99',
};
const pal = (o = {}) => ({ ...U, ...o });

const PACKET = [
  '................',
  '..oooooooooooo..',
  '..oWwWwWwWwWwo..',
  '..owwwwwwwwwwo..',
  '..oaaaaaaaaaao..',
  '..oaaaaaaaaaao..',
  '..oaaaaaaaaaao..',
  '..oaaaaaaaaaao..',
  '..oaaaaaaaaaao..',
  '..oaaaaaaaaaao..',
  '..oaaaaaaaaaao..',
  '..oAAAAAAAAAAo..',
  '..owwwwwwwwwwo..',
  '..owbwwbwwbwwo..',
  '..oooooooooooo..',
  '................',
];

// Symbol stamped on the packet's coloured panel (8x7 at x=4, y=4).
const SYMBOLS = {
  sprout: ['..oo.oo.', '.ohgogho', '.oggoggo', '..oogoo.', '....go..', '....go..', '...ooo..'],
  garden: ['...oo...', '..oppo..', '.opyypo.', '.opyypo.', '..oppo..', '...go...', '..ogo...'],
  heirloom: ['...oo...', '..obbo..', '.obBBbo.', '.onnnno.', '.onnnno.', '..onno..', '...oo...'],
  starlight: ['...oo...', '...yy...', 'oyyyyyyo', '.oyyyyo.', '..yyyy..', '.yyooyy.', '.o....o.'],
  moonlit: ['..ooo...', '.olll...', 'oll.....', 'oll...w.', 'oll.....', '.olll.w.', '..ooo...'],
};

function packet(id, a, A) {
  const rows = PACKET.map((r) => r.split(''));
  SYMBOLS[id].forEach((line, y) => line.split('').forEach((ch, x) => {
    if (ch !== '.') rows[4 + y][4 + x] = ch;
  }));
  return { rows: rows.map((r) => r.join('')), palette: pal({ a, A }) };
}

const SOIL_ROWS = [
  '.xxxxxxxxxxxxxx.',
  'xyyyyyyyyyyyyyyx',
  'xssssssssssssssx',
  'xSSSSSSSSSSSSSSx',
  'xyyyyyyyyyyyyyyx',
  'xsssspssssssssSx',
  'xSSSSSSSSSSSSSSx',
  'xyyyyyyyyyyyyyyx',
  'xssssssssssspssx',
  'xSSSSSSSSSSSSSSx',
  'xyyyyyyyyyyyyyyx',
  'xssspsssssssssSx',
  'xSSSSSSSSSSSSSSx',
  'xyyyyyyyyyyyyyyx',
  'xSSSSSSSSSSSSSSx',
  '.xxxxxxxxxxxxxx.',
];

const GRASS = { g: '#86cf5e', G: '#6ab84a', h: '#a6e07a', f: '#ffffff', y: '#ffd23f', p: '#ffa6d2' };

export const UI_TEMPLATES = {
  coin: { w: 11, mirror: true, palette: pal(), px: [[2, 3, 'l'], [2, 4, 'l'], [3, 2, 'l']], rows: [
    '...ooo', '.ooyyy', '.oyyYY', 'oyyYyy', 'oyyYyy', 'oyyYyy', 'oyyYyy', 'oyyYYY', '.oyyyy', '.ooYYY', '...ooo',
  ] },

  'packet-sprout': packet('sprout', '#8ad06a', '#5a9a3a'),
  'packet-garden': packet('garden', '#ff9ac0', '#d0608a'),
  'packet-heirloom': packet('heirloom', '#f0b060', '#b0702a'),
  'packet-starlight': packet('starlight', '#6fa8ff', '#3a68c8'),
  'packet-moonlit': packet('moonlit', '#7a5ad0', '#4a3a98'),

  soil: { rows: SOIL_ROWS, palette: { x: '#4a2a1e', y: '#a8744a', s: '#8a5a3a', S: '#6e4430', p: '#b8a090' } },
  'soil-wet': { rows: SOIL_ROWS, palette: { x: '#3a2018', y: '#7e5236', s: '#62402c', S: '#4c2e20', p: '#8a90a8' } },
  'soil-locked': { rows: SOIL_ROWS.map((r, y) => (y % 5 === 2 ? r.replace(/s{3}/, 'gGg') : r)), palette: { x: '#5a4a3a', y: '#9a8a6a', s: '#8a7a5a', S: '#7a6a4a', p: '#a09a8a', g: '#6ab84a', G: '#4a8a3a' } },

  grass1: { palette: GRASS, rows: [
    'gggggggggggggggg', 'ggggggGggggggggg', 'gggggGhGgggggggg', 'gggggggggggggggg',
    'gggggggggggGgggg', 'ggGgggggggGhGggg', 'gGhGgggggggggggg', 'gggggggggggggggg',
    'gggggggGgggggggg', 'ggggggGhGggggggg', 'gggggggggggggGgg', 'gggggggggggggGhG',
    'ggggGggggggggggg', 'gggGhGgggggggggg', 'gggggggggggggggg', 'gggggggggggggggg',
  ] },
  grass2: { palette: GRASS, rows: [
    'gggggggggggggggg', 'gggggggggggggggg', 'ggggggggggGggggg', 'gggfggggggGhGggg',
    'ggfyfggggggggggg', 'gggfgggggggggggg', 'ggggGggggggggggg', 'gggGhGgggggggggg',
    'gggggggggggggggg', 'gggggggggggggpgg', 'gggggggggggggggg', 'ggggggGggggggggg',
    'gggggGhGgggggggg', 'gggggggggggggggg', 'gggggggggGgggggg', 'ggggggggGhGggggg',
  ] },
  grass3: { palette: GRASS, rows: [
    'gggggggggggggggg', 'ggggGggggggggggg', 'gggGhGgggggggggg', 'gggggggggggggggg',
    'gggggggggggggggg', 'gggggggggGgggggg', 'ggggggggGhGggggg', 'gggggggggggggggg',
    'gGgggggggggggggg', 'GhGggggggggggGgg', 'gggggggggggggGhG', 'gggggggggggggggg',
    'gggggggggggggggg', 'ggggggGggggggggg', 'gggggGhGgggggggg', 'gggggggggggggggg',
  ] },

  star: { w: 11, mirror: true, palette: pal(), rows: [
    '.....o', '....oy', '....oy', 'ooooyy', 'oyyyyl', '.oyyyy', '..oyyy', '..oyyy', '.oyyoo', '.ooo..',
  ] },
  'star-empty': { w: 11, mirror: true, palette: pal({ y: '#cfc6d8', l: '#e8e2ee' }), rows: [
    '.....o', '....oy', '....oy', 'ooooyy', 'oyyyyl', '.oyyyy', '..oyyy', '..oyyy', '.oyyoo', '.ooo..',
  ] },
  drop: { w: 9, mirror: true, palette: pal(), px: [[3, 4, 'c'], [3, 5, 'c'], [2, 6, 'c']], rows: [
    '....o', '...ox', '...ox', '..oxx', '.oxxx', '.oxxx', 'oxxxx', 'oxxxx', 'oxxxX', '.oxXX', '..ooo',
  ] },
  clock: { w: 11, mirror: true, palette: pal(), px: [[5, 2, 'k'], [5, 3, 'k'], [5, 4, 'k'], [6, 5, 'k'], [7, 5, 'k']], rows: [
    '...ooo', '.oowww', '.owwww', 'owwwww', 'owwwww', 'owwwww', 'owwwww', 'owwwww', '.owwww', '.ooWWW', '...ooo',
  ] },
  lock: { w: 11, mirror: true, palette: pal(), rows: [
    '...ooo', '..o...', '..o...', '.ooooo', '.oyyyy', '.oyyyk', '.oyyyk', '.oYYYY', '.ooooo',
  ] },
  heart: { w: 9, mirror: true, palette: pal(), px: [[2, 2, 'w']], rows: [
    '.oo..', 'orro.', 'orrrr', 'orrrr', '.orrr', '..orr', '...or', '....o',
  ] },
  sparkle: { w: 7, mirror: true, palette: pal(), rows: [
    '...y', '...y', '..yl', 'yyll', '..yl', '...y', '...y',
  ] },
  check: { w: 10, palette: pal(), rows: [
    '........oo', '.......ogo', '......ogo.', 'oo...ogo..', 'ogo.ogo...', '.ogogo....', '..ogo.....', '...o......',
  ] },
  close: { w: 9, mirror: true, palette: pal({ x: '#ffffff' }), rows: [
    'oo...', 'oxo..', '.oxo.', '..oxo', '...ox', '..oxo', '.oxo.', 'oxo..', 'oo...',
  ] },
  camera: { w: 13, palette: pal(), rows: [
    '....oooo.....', '.oooowwoooo..', 'oWWWWWWWWWWWo', 'oWWWooooWWWWo', 'oWWoxxxXoWWWo', 'oWWoxcxXoWrWo',
    'oWWoxxxXoWWWo', 'oWWWooooWWWWo', 'oWWWWWWWWWWWo', '.ooooooooooo.',
  ] },
  sound: { w: 12, palette: pal(), rows: [
    '....oo......', '...owo..o...', 'oooowo...o..', 'owwwwo.o..o.', 'owwwwo..o.o.', 'owwwwo..o.o.',
    'owwwwo.o..o.', 'oooowo...o..', '...owo..o...', '....oo......',
  ] },
  mute: { w: 12, palette: pal(), rows: [
    '....oo......', '...owo......', 'oooowo.r...r', 'owwwwo..r.r.', 'owwwwo...r..', 'owwwwo..r.r.',
    'owwwwo.r...r', 'oooowo......', '...owo......', '....oo......',
  ] },
  seed: { w: 7, mirror: true, palette: pal(), px: [[2, 2, 'n']], rows: [
    '..oo', '.obb', 'obbb', 'obbb', 'oBbb', '.oBB', '..oo',
  ] },

  'nav-garden': { w: 14, mirror: true, palette: pal(), rows: [
    '.......', '.oo..oo', 'ohgo.og', 'oggo.og', '.ogoook', '..ooggk', '....oog', '.....og',
    '.oooooo', 'obbbbbb', 'oBBBBBB', '.oooooo',
  ] },
  'nav-seeds': { w: 14, palette: pal({ a: '#8ad06a', A: '#5a9a3a' }), rows: [
    '..oooooooooo..', '..oWwWwWwWwo..', '..oaaaaaaaao..', '..oaaagoaaao..', '..oaagggoaao..', '..oaaagaaaao..',
    '..oaaagaaaao..', '..oAAAAAAAAo..', '..owwwwwwwwo..', '..owbwwbwbwo..', '..oooooooooo..', '..............',
  ] },
  'nav-book': { w: 14, palette: pal({ a: '#e8604a', A: '#a8382a' }), rows: [
    '..oooooooooo..', '.oaaaaaaaaaao.', '.oaAaaaaaaAao.', '.oaaaoooaaaao.', '.oaaoyyyoaaao.', '.oaaoyyyoaaao.',
    '.oaaaoooaaaao.', '.oaAaaaaaaAao.', '.oaaaaaaaaaao.', '.owwwwwwwwwwo.', '.oWWWWWWWWWWo.', '..oooooooooo..',
  ] },
  'nav-decor': { w: 14, mirror: true, palette: pal(), rows: [
    '......o', '.....or', '.....or', '....orr', '...orrr', '..ooooo', '...owwk', '..owwwr', '..owwww', '..oxxww', '..oxxxx', '...oooo',
  ] },
  'nav-records': { w: 14, mirror: true, palette: pal(), rows: [
    '.oooooo', 'oyoyyyy', 'oyoyylY', 'oyoyyyy', '.ooyyyy', '...oyyy', '....oyY', '.....oy', '.....oy', '...oooo', '...oYYY', '...oooo',
  ] },

  'watering-can': { palette: pal(), rows: [
    '................',
    '................',
    '.......ooooo....',
    '......os...so...',
    '.....os.....so..',
    'oo...ooooooooo..',
    'oxxo.oxxxxxxxXo.',
    '.oxxooxcxxxxxXoo',
    '..oxxoxcxxxxxXoo',
    '...oxoxxxxxxxXo.',
    '....ooxxxxxxxXo.',
    '.....oXXXXXXXXo.',
    '.....oooooooooo.',
    '................',
    '................',
    '................',
  ] },

  basket: { palette: pal(), rows: [
    '................',
    '.....oooooo.....',
    '....o......o....',
    '...o........o...',
    '...o.oo.oo..o...',
    '..oorrooyyoooo..',
    '.onnnnnnnnnnnno.',
    '.obnbnbnbnbnbno.',
    '..onnnnnnnnnno..',
    '..obnbnbnbnbno..',
    '...onnnnnnnno...',
    '...oBBBBBBBBo...',
    '....oooooooo....',
    '................',
    '................',
    '................',
  ] },
};

export const PACKET_FOR_TIER = {
  sprout: 'packet-sprout', garden: 'packet-garden', heirloom: 'packet-heirloom', starlight: 'packet-starlight', moonlit: 'packet-moonlit',
};
