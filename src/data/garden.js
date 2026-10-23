// Garden scene layout. The garden is one 80×112 art-pixel picture (5×7 tiles
// of 16px). Crop beds keep their tiles in the middle; decorations live in 23
// hand-placed "nooks" around them. Nook index i holds state.decorTiles[i].
// (x, y) is where the decoration's feet touch the ground, in art pixels.
//
// Zones decide where the game puts a new decoration automatically:
//   back   along the fence at the top       side   beside the crop beds
//   path   next to the stone path            corner the roomy front corners

export const SCENE_W = 80;
export const SCENE_H = 112;

export const NOOKS = [
  // along the fence
  { x: 8, y: 14, zone: 'back' },
  { x: 23, y: 13, zone: 'back' },
  { x: 40, y: 14, zone: 'back' },
  { x: 57, y: 13, zone: 'back' },
  { x: 72, y: 14, zone: 'back' },
  // beside the beds
  { x: 7, y: 31, zone: 'side' },
  { x: 73, y: 31, zone: 'side' },
  { x: 8, y: 47, zone: 'side' },
  { x: 72, y: 47, zone: 'side' },
  { x: 7, y: 63, zone: 'side' },
  { x: 73, y: 63, zone: 'side' },
  { x: 8, y: 79, zone: 'side' },
  { x: 72, y: 79, zone: 'side' },
  // along the path
  { x: 26, y: 92, zone: 'path' },
  { x: 54, y: 92, zone: 'path' },
  { x: 25, y: 107, zone: 'path' },
  { x: 55, y: 107, zone: 'path' },
  { x: 32, y: 99, zone: 'path' },
  { x: 48, y: 99, zone: 'path' },
  // front corners
  { x: 10, y: 95, zone: 'corner' },
  { x: 70, y: 95, zone: 'corner' },
  { x: 9, y: 109, zone: 'corner' },
  { x: 71, y: 109, zone: 'corner' },
];

// Fallback order when a decoration's favourite zone is full.
export const ZONE_FALLBACK = {
  back: ['back', 'side', 'corner', 'path'],
  side: ['side', 'corner', 'back', 'path'],
  path: ['path', 'corner', 'side', 'back'],
  corner: ['corner', 'path', 'side', 'back'],
};

// Matching sets: when every piece of a set is placed in the garden, the set
// adds its bonus to the decoration score (once per set).
export const DECOR_SETS = [
  { id: 'cottage', name: 'Cottage Corner', items: ['birdhouse', 'bench', 'flower-crate', 'garden-sign'], bonus: 12 },
  { id: 'farmyard', name: 'Farmyard', items: ['hay-bale', 'scarecrow', 'wheelbarrow', 'log-fence'], bonus: 12 },
  { id: 'homely', name: 'Homely Garden', items: ['picket-fence', 'clay-pot', 'watering-can', 'birdbath'], bonus: 10 },
  { id: 'zen', name: 'Zen Garden', items: ['stone-lantern', 'pebble-pile', 'stepping-stones', 'pond'], bonus: 18 },
  { id: 'fairy', name: 'Fairy Glade', items: ['mushroom-ring', 'fairy-ring', 'gnome', 'geode'], bonus: 25 },
  { id: 'estate', name: 'Grand Estate', items: ['fountain', 'topiary', 'flower-arch', 'golden-gnome'], bonus: 30 },
];
