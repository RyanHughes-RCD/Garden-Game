// Placeable decorations. Score is the base decoration-score contribution of the
// first placed copy; further copies of the same item fall off (see config.js).
// `trophy: true` items cannot be bought: they are awarded once by the first
// harvest of an ultra-rare crop.

export const DECOR_SCORE = { common: 3, uncommon: 6, rare: 12, epic: 24, legendary: 45, ultra: 80 };

const ROWS = [
  // id, name, rarity, price, description
  ['picket-fence', 'Picket Fence', 'common', 40, 'Neat white pickets.'],
  ['log-fence', 'Log Fence', 'common', 45, 'Rustic and sturdy.'],
  ['stepping-stones', 'Stepping Stones', 'common', 50, 'Hop, skip, jump.'],
  ['clay-pot', 'Clay Pot', 'common', 60, 'Terracotta with a tiny sprout.'],
  ['pebble-pile', 'Pebble Pile', 'common', 40, 'Smooth river pebbles.'],
  ['hay-bale', 'Hay Bale', 'common', 70, 'A comfy seat for crows.'],
  ['garden-sign', 'Garden Sign', 'common', 55, 'It says "Welcome!"'],
  ['watering-can', 'Old Watering Can', 'common', 65, 'Retired after years of service.'],
  ['flower-crate', 'Flower Crate', 'common', 80, 'Overflowing with blooms.'],

  ['birdhouse', 'Birdhouse', 'uncommon', 150, 'Bluebirds welcome.'],
  ['lamp-post', 'Lamp Post', 'uncommon', 180, 'A warm glow at dusk.'],
  ['bench', 'Garden Bench', 'uncommon', 220, 'For sitting and admiring.'],
  ['wheelbarrow', 'Wheelbarrow', 'uncommon', 200, 'Full of fresh soil.'],
  ['beehive', 'Beehive', 'uncommon', 240, 'Buzzing with busy bees.'],
  ['scarecrow', 'Scarecrow', 'uncommon', 230, 'More friendly than scary.'],
  ['glazed-pot', 'Glazed Pot', 'uncommon', 140, 'A glossy blue planter.'],
  ['mushroom-ring', 'Mushroom Ring', 'uncommon', 170, 'Do not step inside...'],
  ['birdbath', 'Birdbath', 'uncommon', 250, 'Splish splash.'],

  ['gnome', 'Garden Gnome', 'rare', 450, 'Guards the carrots at night.'],
  ['sundial', 'Sundial', 'rare', 500, 'Tells time on sunny days only.'],
  ['pond', 'Little Pond', 'rare', 600, 'Home to a single happy fish.'],
  ['stone-lantern', 'Stone Lantern', 'rare', 520, 'A peaceful light.'],
  ['topiary', 'Topiary Bush', 'rare', 550, 'Trimmed into a perfect sphere.'],
  ['flower-arch', 'Flower Arch', 'rare', 700, 'Roses climb all over it.'],
  ['well', 'Wishing Well', 'rare', 650, 'Toss a coin, make a wish.'],
  ['bunny-statue', 'Bunny Statue', 'rare', 480, 'Forever mid-hop.'],

  ['fountain', 'Fountain', 'epic', 1400, 'Sparkling water, day and night.'],
  ['windmill', 'Windmill', 'epic', 1600, 'Turns lazily in the breeze.'],
  ['cherry-tree', 'Cherry Tree', 'epic', 1500, 'Petals drift down like snow.'],
  ['fairy-ring', 'Fairy Ring', 'epic', 1300, 'Glowing toadstools in a circle.'],
  ['golden-gnome', 'Golden Gnome', 'epic', 1800, 'The gnome of all gnomes.'],
  ['geode', 'Crystal Geode', 'epic', 1700, 'Shimmers in every colour.'],

  ['rainbow-arch', 'Rainbow Arch', 'legendary', 4000, 'A permanent rainbow.'],
  ['star-lamp', 'Star Lamp', 'legendary', 3800, 'Holds a captured star.'],
  ['dragon-statue', 'Dragon Statue', 'legendary', 5000, 'A friendly stone dragon.'],
  ['moon-gate', 'Moon Gate', 'legendary', 4500, 'A round gate to somewhere magical.'],

  ['trophy-rainbow', 'Rainbow Lotus Pond', 'ultra', 0, 'Awarded for harvesting a Rainbow Lotus.'],
  ['trophy-phoenix', 'Phoenix Brazier', 'ultra', 0, 'Awarded for harvesting a Phoenix Bloom.'],
  ['trophy-starfall', 'Starfall Shrine', 'ultra', 0, 'Awarded for harvesting a Starfall Sapling.'],
  ['trophy-dragon', 'Dragon Eye Idol', 'ultra', 0, 'Awarded for harvesting a Dragon\'s Eye Orchid.'],
  ['trophy-dawn', 'Dawn Pedestal', 'ultra', 0, 'Awarded for harvesting a Crown of Dawn.'],
];

export const DECORATIONS = ROWS.map(([id, name, rarity, price, desc]) => ({
  id, name, rarity, price, desc,
  score: DECOR_SCORE[rarity],
  trophy: rarity === 'ultra',
}));

export const DECOR_BY_ID = Object.fromEntries(DECORATIONS.map((d) => [d.id, d]));
