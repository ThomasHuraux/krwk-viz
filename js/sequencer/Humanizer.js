import EventBus from '../EventBus.js';

// Humanizer — seed-based probabilistic gate.
//
// HUMAN 0%  → everything plays, machine-perfect
// HUMAN 100% → significant organic imperfection
//
// Architecture: a skip[track][step] matrix is pre-generated on each reseed.
// Same seed + same pattern = same organic groove every loop.
// shouldPlay(track, step) is deterministic and indexed by step.

const SENSITIVITY = {
  kick:       0.0,   // sacred — never affected
  snare:      0.2,
  clap:       0.7,
  hihat:      1.0,
  hihat_open: 1.0,
};

const MAX_STEPS = 32;

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const Humanizer = {
  humanAmount: 0,
  swingAmount: 0,
  _seed:       1234,
  _matrix:     {},   // _matrix[track][step] → random value 0..1

  init(seed) {
    this._seed = seed;
    this._buildMatrix();

    EventBus.on('human:change', ({ value }) => { this.humanAmount = value; });
    EventBus.on('swing:change', ({ value }) => { this.swingAmount = value; });
    EventBus.on('seed:change',  ({ seed: s }) => { this._seed = s; this._buildMatrix(); });
    // Advance seed each loop — groove evolves organically cycle after cycle
    EventBus.on('transport:tick', ({ step }) => { if (step === 0) this._advanceSeed(); });
    EventBus.on('transport:stop', () => this._buildMatrix());
  },

  // Does this track/step fire this loop?
  shouldPlay(track, step) {
    if (this.humanAmount <= 0) return true;
    const sensitivity = SENSITIVITY[track] ?? 1.0;
    if (sensitivity === 0) return true;
    // At HUMAN 100%, hihat misses ~70% of the time; clap ~70%; snare ~20%
    const threshold = this.humanAmount * sensitivity * 0.7;
    return (this._matrix[track]?.[step] ?? 0) > threshold;
  },

  // Swing offset for a given step
  swingOffset(step, stepDuration) {
    if (this.swingAmount <= 0) return 0;
    return step % 2 === 1 ? this.swingAmount * stepDuration * 0.667 : 0;
  },

  _advanceSeed() {
    // Derive next seed from current one — deterministic chain, infinite variation
    this._seed = (mulberry32(this._seed)() * 0xFFFFFFFF) >>> 0;
    this._buildMatrix();
  },

  _buildMatrix() {
    const prng = mulberry32(this._seed);
    Object.keys(SENSITIVITY).forEach(track => {
      this._matrix[track] = Array.from({ length: MAX_STEPS }, () => prng());
    });
  }
};

export default Humanizer;
