# Little Garden 🌱

A cute pixel-art idle gardening and collection game. Plant mystery seeds, watch them grow over real hours (even while the app is closed), water them at checkpoints, harvest them for coins, and discover all **100 crops**, including **5 ultra-rares**. Decorate a persistent garden, earn randomized permanent bonuses, greet visiting critters, and share a showcase card of your garden.

It is a **Progressive Web App (PWA)**: plain HTML/CSS/JavaScript, with no build step and no dependencies. It runs in iPhone Safari, can be added to the Home Screen, works offline, and is hosted on GitHub Pages.

> **Honest note:** a PWA is not a native App Store app. Little Garden runs in Safari's web engine. You install it with **Share → Add to Home Screen**, not from the App Store. No native iOS build is included.

| Garden | Seeds | Collection | Showcase |
|---|---|---|---|
| ![Garden](docs/screenshots/garden-13.png) | ![Seeds](docs/screenshots/seeds.png) | ![Collection](docs/screenshots/collection.png) | ![Showcase](docs/screenshots/showcase.png) |

## How to play

1. **Buy seeds** in the Seed Shop. Seeds are the only consumable item and coins are the only currency.
2. **Tap an empty plot** and pick a seed. A short slot-machine reveal spins through silhouettes, colours, symbols and rarity names. It lands on your seed's **rarity and silhouette**. The crop's name and colours stay secret until it blooms.
3. **Wait**: crops take 1–16 real hours. Growth is calculated from saved timestamps, so it continues while the app is closed.
4. **Water** at the three checkpoints (a 💧 bubble appears on the plot). Each watering multiplies the harvest value and speeds up growth. If you miss a window, you only lose that window's bonus. Crops never wilt.
5. **Harvest** when the basket bubble appears. You earn coins, the crop is added to your Collection, and your records may update. The first harvest of each ultra-rare also gives you a unique decoration.
6. **Decorate**: buy decorations and place them on the grass. Your garden score goes up, and score thresholds award random permanent bonuses.
7. **Visitors** drop by from time to time. Tap them for coins, a free seed, a watering, or faster growth.

## Game rules (exact numbers)

Every tuning value lives in `src/data/config.js`. Crops are listed in `src/data/crops.js`, decorations in `src/data/decorations.js`, and visitors in `src/data/visitors.js`.

### Seed tiers and odds

The game rolls a rarity first, using the tier's odds, then picks a crop of that rarity.

| Seed | Price | Common | Uncommon | Rare | Epic | Legendary | Ultra |
|---|---|---|---|---|---|---|---|
| Sprout | 10 | 72.445% | 23% | 4% | 0.5% | 0.05% | 0.005% |
| Garden | 32 | 42% | 38% | 16% | 3.47% | 0.5% | 0.03% |
| Heirloom | 95 | 14% | 35% | 36% | 13.08% | 1.8% | 0.12% |
| Starlight | 210 | — | 18% | 45% | 30.6% | 6% | 0.4% |
| Moonlit | 380 | — | — | 34% | 50% | 15% | 1% |

* Pricier seeds have a better expected harvest and more profit per seed. The return per coin spent goes down as the price goes up, so cheap seeds are still useful, especially for finding the commons that Starlight and Moonlit seeds never roll. A unit test enforces this balance.
* Some magical crops can only come from Garden-tier seeds or better (`minTier`).
* No seed guarantees an ultra-rare, and the game has no pity timer.

### Discovery bonus (no pity)

Within the rolled rarity, each eligible crop you have **never harvested** gets **3× weight**. Crops you already found keep weight 1. Duplicates stay possible, and the rarity roll itself never changes. Each crop's Collection page shows its exact base odds per seed tier.

### Watering

Each crop has 3 checkpoints, at 0%, 30% and 60% of its planned grow time. A checkpoint's window stays open until the next one opens, or until harvest. Each watering applies **×1.15 harvest value** (so 1.15, 1.32 and 1.52 for 1, 2 and 3 waterings) and **×0.95 grow time**. Watering all three adds one extra item to the harvest.

### Determinism and saves

At planting time, the game derives the crop, quantity and value variance from the save's seed plus a planting counter, then stores the result in the save right away. Refreshing cannot reroll a seed. Bonus awards and visitor gifts are seeded the same way.

### Decoration score and bonuses

* Only **placed** decorations count. Base score by rarity: common 3, uncommon 6, rare 12, epic 24, legendary 45, ultra-rare trophy 80.
* Each extra placed copy of the same decoration counts **×0.6** of the previous copy.
* Thresholds: **10, 25, 45, 70, 100, 140, 190, 250, 320, 400, 500, 620, 760, 900**. They are measured against your best score ever, so each one pays out once. Moving or storing decorations cannot farm or reroll bonuses. Decorations cannot be sold, so coins cannot loop back out of them.
* Each threshold awards one random bonus type, picked from the types that are not yet maxed:

| Bonus | Per stack | Max stacks | Max effect |
|---|---|---|---|
| Thrifty Gardener | seeds 4% cheaper | 5 | 20% |
| Green Thumb | crops grow 5% faster | 5 | 25% |
| Lucky Soil | rare-and-up odds ×1.08 (renormalised) | 5 | ×1.40 |
| Market Darling | harvests +5% coins | 5 | +25% |
| Welcoming Garden | visitors 20% more often | 4 | +80% |

  If every type is maxed, a threshold pays 500 coins instead. Each extra copy of a decoration costs 50% more than the last, which gives late-game coins somewhere to go.

### Visitors

One visitor at a time arrives every 25–70 minutes. Visitors come more often with the Welcoming Garden bonus and with a higher decoration score (up to +50%). If you're away, at most one visitor waits for you, so idle time can't stack visitors up. There are 11 visitor types. Rewards scale gently with decoration score, capped at ×4.

## Run it locally

You need [Node.js](https://nodejs.org) 18 or newer, but only for the dev server and the tests. The game itself has no dependencies.

```bash
npm start            # serves the game at http://localhost:8080/
npm test             # unit tests: rules, balance, saves, PWA files, sprites
npm run e2e          # full browser playthrough with Playwright (if installed)
npm run assets       # regenerate PWA icons + sprite sheets from the pixel data
npm run screenshots  # regenerate docs/screenshots from a simulated save
```

Any static file server works too, for example `python3 -m http.server`. Open the page over `http://localhost` or HTTPS so the service worker can register.

To test on your iPhone on the same Wi-Fi, run `npm start` and open `http://<your-computer-ip>:8080/` in Safari. Offline mode and Add to Home Screen need HTTPS, so use GitHub Pages for the full experience.

## Publish on GitHub Pages

The game uses only relative paths, so it works under a repository subpath such as `https://<user>.github.io/Garden-Game/`.

**Option A: GitHub Actions (included)**
1. Push the repository to GitHub, with the code on the `main` branch.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Each push to `main` runs the tests and then deploys (`.github/workflows/pages.yml`). Your URL appears in the workflow run and in Settings → Pages.

**Option B: Deploy from a branch**
1. Go to **Settings → Pages → Source** and choose **Deploy from a branch**.
2. Pick your branch and the `/ (root)` folder, then save. The site is static, and the `.nojekyll` file is already in place.

When you change any game file, bump `VERSION` in `sw.js` so installed copies pick up the update. If you add a file under `src/`, also add it to the `ASSETS` list in `sw.js`. A test checks that you did.

## Add it to your iPhone Home Screen

1. Open your GitHub Pages URL in **Safari**. It must be Safari for the full install.
2. Tap the **Share** button (the square with an arrow).
3. Scroll down and tap **Add to Home Screen**, then tap **Add**.
4. Launch **Little Garden** from the Home Screen. It opens full-screen, works offline after the first load, and respects the notch and the Home Indicator.

### Good to know (PWA limitations)

* Progress is saved in the browser's local storage on that device. A Home Screen app keeps storage separate from the Safari tab, so a game started in a Safari tab won't carry over to the Home Screen icon. Use **Records → Backup save** to copy a save code and paste it into the other copy to restore it.
* iOS may clear website data for sites that haven't been used for weeks, and that includes Home Screen web apps. Make occasional backups with **Records → Backup save**.
* The game has no push notifications and no cloud sync. Timers still run correctly while the app is closed, because growth is computed from timestamps when you come back.
* **Showcase → Share** uses the iOS share sheet when it's available. Otherwise, press and hold the image to save it to Photos.

## Project structure

```
index.html              App shell (safe-area aware, iOS PWA meta tags)
manifest.webmanifest    PWA manifest (relative start_url/scope)
sw.js                   Offline service worker (precache + versioned cache)
src/
  main.js               Boot, navigation, timer loop, service worker registration
  styles.css            Mobile-first styles and animations
  core/                 Pure game logic: rng.js (seeded RNG), state.js (save/migrate), game.js (rules)
  data/                 config.js (all tuning), crops.js (100 crops), decorations.js, visitors.js
  art/                  Pixel-art templates + palettes; sprites.js builds every sprite from data
  ui/                   Screens (garden, seeds, collection, decor, records, showcase) and modals
assets/fonts/           Pixelify Sans (OFL), bundled for offline use
assets/sprites/         Generated sprite sheets (reference)
icons/                  Generated PWA icons
tests/                  node:test unit tests
tools/                  Dev server, PNG encoder, asset/screenshot generators, e2e playthrough
```

### The pixel-art system

All art is real pixel art defined as data. Each sprite is a grid of characters mapped to a small palette (`src/art/*Art.js`). At runtime the game draws every sprite onto a canvas with nearest-neighbour scaling, and the Node tools use the same data to export the PNG icons and sprite sheets. The 100 crops share about 40 hand-drawn silhouette templates. Each crop gets its own palette and effect, and the 5 ultra-rares have unique templates. Every crop has 4 growth stages, plus its mature sprite.

To **add or rebalance a crop**, edit its row in `src/data/crops.js`. The tests check that there are still exactly 100 crops, that 5 of them are ultra-rare, that each one looks distinct, and that every tier's odds are consistent.

## License

Code: MIT (see `LICENSE`). Font: Pixelify Sans, SIL Open Font License 1.1 (`assets/fonts/OFL.txt`).
