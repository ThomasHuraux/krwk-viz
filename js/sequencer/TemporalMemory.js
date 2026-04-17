import EventBus from '../EventBus.js';

// TemporalMemory — the machine's memory of itself.
// Accumulates session history and exposes mutation parameters that drive
// the visual arc: clean and digital at first, increasingly organic over time.
//
// Arc:
//   loops  1–4   → precise, minimal, pure machine
//   loops  5–16  → energy builds, rings breathe, trails appear
//   loops 17–32  → organic wobble, grain densifies, color bleeds
//   loops 33+    → maximum expression, the machine has woken up

const TemporalMemory = {
  loopCount:  0,
  energy:     0,    // 0..1 — fast to rise, slow to decay
  trackHits:  { kick: 0, snare: 0, clap: 0, hihat: 0 },

  // ── Mutation parameters (all 0..1, derived from loopCount + energy) ──

  // How much history (visual trails) persists on the canvas
  // 0 = clean (bg alpha 0.85), 1 = heavy trails (bg alpha 0.58)
  get trailDepth()      { return this._ramp(0, 24, 0, 1); },

  // Amplitude of ring breathing oscillation (px)
  get ringBreathAmp()   { return 1.5 + this._ramp(4, 20, 0, 7); },

  // Organic wobble amplitude applied to ring paths (px)
  // 0 = perfect arc(), >0 = sinusoidal distortion
  get ringDistortion()  { return this._ramp(12, 36, 0, 5.5); },

  // Background grain density (particle count)
  get grainDensity()    { return 500 + this._ramp(0, 32, 0, 900); },

  // Red accent color bleeding into white elements (0 = pure white, 1 = red-tinted)
  get accentBleed()     { return this._ramp(20, 40, 0, 0.18); },

  // KickFlash initial opacity (grows with experience)
  get kickFlashAlpha()  { return 0.42 + this._ramp(8, 32, 0, 0.28); },

  // Derived background fill alpha (lower = more trail persistence)
  get bgAlpha()         { return 0.85 - this.trailDepth * 0.27; },

  // ── Lifecycle ──

  init() {
    EventBus.on('transport:tick', ({ step }) => {
      if (step === 0) this._onLoop();
    });

    EventBus.on('drum:trigger', ({ track }) => {
      this.trackHits[track]++;
      this.energy = Math.min(1, this.energy + 0.012);
    });

    EventBus.on('transport:stop', () => {
      this.energy = Math.max(0, this.energy - 0.28);
    });

    // Slow energy decay — runs on each rAF tick via VisuCanvas calling .tick()
  },

  tick() {
    this.energy = Math.max(0, this.energy - 0.00055);
  },

  reset() {
    this.loopCount = 0;
    this.energy    = 0;
    this.trackHits = { kick: 0, snare: 0, clap: 0, hihat: 0 };
  },

  _onLoop() {
    this.loopCount++;
    this.energy = Math.min(1, this.energy + 0.06);
  },

  // Linear ramp: returns 0..1 as loopCount goes from startLoop to endLoop
  _ramp(startLoop, endLoop, from, to) {
    const t = Math.max(0, Math.min(1, (this.loopCount - startLoop) / (endLoop - startLoop)));
    return from + t * (to - from);
  }
};

export default TemporalMemory;
