// PulseVisu — Minimal spirograph: only the self-intersection points.
//
// The epitrochoid curve is computed at init; its self-intersections are
// extracted by brute-force O(N²) (one-shot computation, not every frame).
// On screen: only these points — a constellation that pulses at the BPM.
//
// On beat: jumps to max amplitude, contracts until the next beat.
// Red flash on all nodes + central pivot at peak.

import EventBus    from '../EventBus.js';
import PatternStore from '../sequencer/PatternStore.js';

function lcg(seed) {
  let s = (seed ^ 0xDEADBEEF) >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s >>> 0) / 0x100000000; };
}

const CONFIGS = [
  { p:1, q: 5, a:0.58 },
  { p:1, q: 7, a:0.55 },
  { p:1, q: 8, a:0.52 },
  { p:2, q: 7, a:0.57 },
  { p:2, q: 9, a:0.55 },
  { p:3, q:11, a:0.53 },
  { p:1, q:11, a:0.50 },
  { p:3, q:13, a:0.54 },
];

const TWO_PI = Math.PI * 2;

const PulseVisu = {
  canvas:  null,
  ctx:     null,
  _time:   0,
  _running: false,

  _beatFlash: 0,
  _beatPulse: 0,

  _human: 0,
  _swing: 0,

  _p: 1, _q: 5, _A: 0.58, _B: 0.42, _phi: 0,
  _intersections: [],   // [{nx, ny}] — normalized coords, computed at init

  init(canvas) {
    if (!canvas) return;
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d', { alpha: true });
    this._syncSize();
    this._initSeed(Math.floor(Math.random() * 9999));
    this._bindEvents();
    this._running = true;
    this._loop();
  },

  _syncSize() {
    const el = this.canvas;
    const w  = el.offsetWidth  | 0;
    const h  = el.offsetHeight | 0;
    if (w > 0 && h > 0 && (el.width !== w || el.height !== h)) {
      el.width  = w;
      el.height = h;
    }
  },

  // ── Seed + intersection computation ───────────────────────────────────────
  _initSeed(seed) {
    const r   = lcg(seed);
    const cfg = CONFIGS[Math.floor(r() * CONFIGS.length)];
    this._p   = cfg.p;
    this._q   = cfg.q;
    this._A   = cfg.a;
    this._B   = 1 - cfg.a;
    this._phi = r() * TWO_PI;
    this._computeIntersections();
  },

  // Brute-force O(N²) — executed once per seed, ~1-3 ms.
  // For each pair of points (i, j) at least minGap apart:
  //   if distance < threshold → self-intersection → midpoint stored.
  _computeIntersections() {
    const N      = 600;
    const p      = this._p;
    const q      = this._q;
    const A      = this._A;
    const B      = this._B;
    const phi    = this._phi;
    const THR2   = 0.038 * 0.038;   // squared threshold (normalized coords)
    const minGap = Math.max(8, Math.floor(N / q / 2));

    // 1. Sample the curve
    const xs = new Float32Array(N);
    const ys = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const t = (i / N) * TWO_PI;
      xs[i] = A * Math.cos(p * t) + B * Math.cos(q * t + phi);
      ys[i] = A * Math.sin(p * t) + B * Math.sin(q * t + phi);
    }

    // 2. Find close pairs (non-adjacent)
    const raw = [];
    for (let i = 0; i < N - minGap; i++) {
      for (let j = i + minGap; j < N; j++) {
        const dx = xs[i] - xs[j];
        const dy = ys[i] - ys[j];
        if (dx * dx + dy * dy < THR2) {
          raw.push([(xs[i] + xs[j]) * 0.5, (ys[i] + ys[j]) * 0.5]);
          j += Math.max(1, minGap >> 1);  // skip to avoid duplicates
        }
      }
    }

    // 3. Deduplication: merge points that are too close
    const DEDUP2 = 0.05 * 0.05;
    const unique = [];
    for (const c of raw) {
      if (!unique.some(u => (c[0]-u[0])**2 + (c[1]-u[1])**2 < DEDUP2)) {
        unique.push(c);
      }
    }

    this._intersections = unique;
  },

  // ── Events ──────────────────────────────────────────────────────────────────
  _bindEvents() {
    EventBus.on('transport:tick', ({ step }) => {
      if (step % 4 === 0) {
        this._beatFlash = 1.0;
        this._beatPulse = 1.0;
      }
    });
    EventBus.on('human:change', ({ value }) => { this._human = value; });
    EventBus.on('swing:change', ({ value }) => { this._swing = value; });
    EventBus.on('seed:change',  ({ seed })  => { this._initSeed(seed); });
    EventBus.on('transport:stop', () => {
      this._beatFlash = 0;
      this._beatPulse = 0;
    });
  },

  _loop() {
    if (!this._running) return;
    requestAnimationFrame(() => this._loop());
    this._time += 0.016;
    this._syncSize();
    this._draw();
  },

  // ── Draw: only the intersection points ───────────────────────────────────
  _draw() {
    const { ctx } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (!W || !H) return;

    const cx = W >> 1;
    const cy = H >> 1;

    // Decay
    this._beatFlash *= 0.82;
    const flash = this._beatFlash;

    const bpm        = PatternStore.getBPM();
    const beatFrames = 3600 / bpm;
    this._beatPulse *= Math.pow(0.04, 1 / beatFrames);
    const pulse = this._beatPulse;

    // Background — transparent to let VisuCanvas show through
    ctx.clearRect(0, 0, W, H);

    // Amplitude
    const minR = (0.10 + this._human * 0.18) * Math.min(W, H) * 0.46;
    const maxR = (0.80 + this._human * 0.14) * Math.min(W, H) * 0.46;
    const R    = minR + pulse * (maxR - minR);

    // Swing: slight rotation of the constellation on beat
    const rot = this._swing * pulse * (Math.PI / 14);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    // ── Intersection points ───────────────────────────────────────────────────
    const isBeat  = flash > 0.05;
    const dotSize = isBeat ? Math.max(2, Math.round(flash * 3)) : 2;

    // Pre-compute screen coordinates of each intersection
    const pts = this._intersections.map(([nx, ny]) => {
      const rx = nx * cos - ny * sin;
      const ry = nx * sin + ny * cos;
      return [(cx + rx * R) | 0, (cy + ry * R) | 0];
    });

    // ── Red needles (beat): lines from center to each point ──────────────────
    if (isBeat) {
      ctx.save();
      ctx.strokeStyle = `rgba(232, 0, 13, ${flash * 0.55})`;
      ctx.lineWidth   = 0.8;
      ctx.beginPath();
      for (const [px, py] of pts) {
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // ── Dots ──────────────────────────────────────────────────────────────────
    for (const [px, py] of pts) {
      if (isBeat) {
        ctx.fillStyle = `rgba(232, 0, 13, ${0.75 + flash * 0.25})`;
        ctx.fillRect(px - (dotSize >> 1), py - (dotSize >> 1), dotSize, dotSize);
      } else {
        ctx.fillStyle = `rgba(240, 240, 240, ${0.35 + this._human * 0.30})`;
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
    }

    // ── Central pivot ─────────────────────────────────────────────────────────
    ctx.fillStyle = isBeat
      ? `rgba(232, 0, 13, ${flash * 0.95})`
      : 'rgba(240, 240, 240, 0.22)';
    ctx.fillRect(cx - 1, cy - 1, 3, 3);
  }
};

export default PulseVisu;
