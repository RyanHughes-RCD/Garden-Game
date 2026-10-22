// Small synthesized sound effects (no audio files needed). The AudioContext is
// created lazily on the first user gesture, as iOS Safari requires.
let ctx = null;
let enabled = true;

export function setSoundEnabled(on) {
  enabled = on;
}

export function unlockAudio() {
  if (ctx || !enabled) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start(0);
  } catch {
    ctx = null;
  }
}

function tone(freq, start, dur, { type = 'square', vol = 0.06, slide = 0 } = {}) {
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  tap: () => tone(660, 0, 0.05, { vol: 0.03 }),
  buy: () => { tone(880, 0, 0.07); tone(1320, 0.06, 0.1); },
  plant: () => { tone(220, 0, 0.12, { type: 'triangle', vol: 0.12, slide: 200 }); },
  tick: () => tone(1200, 0, 0.02, { vol: 0.025 }),
  land: () => { tone(523, 0, 0.1); tone(784, 0.08, 0.18); },
  water: () => { for (let i = 0; i < 4; i++) tone(900 + i * 120, i * 0.06, 0.07, { type: 'sine', vol: 0.08, slide: -300 }); },
  harvest: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.14, { type: 'triangle', vol: 0.09 })); },
  discover: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.22, { vol: 0.06 })); },
  coin: () => { tone(988, 0, 0.06); tone(1319, 0.05, 0.12); },
  visitor: () => { tone(1568, 0, 0.06, { type: 'sine', vol: 0.08 }); tone(1760, 0.08, 0.08, { type: 'sine', vol: 0.08 }); tone(1568, 0.16, 0.06, { type: 'sine', vol: 0.08 }); },
  bonus: () => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.07, 0.2, { type: 'triangle', vol: 0.09 })); },
  error: () => tone(180, 0, 0.15, { vol: 0.05, slide: -60 }),
  place: () => { tone(330, 0, 0.08, { type: 'triangle', vol: 0.12 }); tone(495, 0.06, 0.1, { type: 'triangle', vol: 0.1 }); },
};

export function sfx(name) {
  if (!enabled || !ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    SOUNDS[name] && SOUNDS[name]();
  } catch {
    /* audio is optional */
  }
}
