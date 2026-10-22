// Visitors arrive occasionally (see VISITORS in config.js). Each has a weight
// (how often they come) and an effect:
//   coins  - gift coins: base * decoration multiplier, randomised a little
//   water  - waters every crop whose watering window is open, plus a few coins
//   hurry  - pollinates: every growing crop finishes `minutes` sooner
//   seed   - gifts one seed of the given tier

export const VISITOR_TYPES = [
  { id: 'bunny', name: 'Pip the Bunny', weight: 14, effect: 'coins', base: 10,
    lines: ['Your carrots smell amazing!', 'I only nibbled a tiny bit. Promise!'] },
  { id: 'hedgehog', name: 'Hazel the Hedgehog', weight: 12, effect: 'coins', base: 12,
    lines: ['What a cosy garden!', 'I found these shiny coins under a leaf.'] },
  { id: 'frog', name: 'Sir Ribbit', weight: 10, effect: 'water', base: 4,
    lines: ['Allow me to water your plants, good gardener.', 'Splendid soil! A splash for everyone.'] },
  { id: 'bee', name: 'Buzzy Bee', weight: 10, effect: 'hurry', minutes: 15, base: 0,
    lines: ['Bzz! I pollinated everything!', 'Your flowers are the best in town. Bzz!'] },
  { id: 'ladybug', name: 'Dot the Ladybug', weight: 12, effect: 'coins', base: 8,
    lines: ['Seven spots of good luck to you!', 'No aphids here. You are welcome!'] },
  { id: 'snail', name: 'Shelly the Snail', weight: 8, effect: 'seed', tier: 'sprout', base: 0,
    lines: ['I brought you a seed... it took a while.', 'Slow and steady grows the garden.'] },
  { id: 'fox', name: 'Rusty the Fox', weight: 6, effect: 'coins', base: 20,
    lines: ['I traded some berries in town for these.', 'Your garden is the talk of the forest!'] },
  { id: 'owl', name: 'Professor Hoot', weight: 6, effect: 'coins', base: 16,
    lines: ['Hoo! A remarkable collection indeed.', 'Knowledge is the best fertiliser. Hoo!'] },
  { id: 'butterfly', name: 'Flutter', weight: 8, effect: 'hurry', minutes: 10, base: 0,
    lines: ['Flit, flutter, bloom faster!', 'I danced over every flower for you.'] },
  { id: 'cat', name: 'Mochi the Cat', weight: 8, effect: 'coins', base: 14,
    lines: ['*purrs loudly in the sunshine*', 'Mrrp. (She left you some coins.)'] },
  { id: 'mole', name: 'Digby the Mole', weight: 4, effect: 'seed', tier: 'garden', base: 0,
    lines: ['Dug this up! Looks like a good one.', 'Oops, wrong garden. Have a seed!'] },
];

export const VISITOR_BY_ID = Object.fromEntries(VISITOR_TYPES.map((v) => [v.id, v]));
