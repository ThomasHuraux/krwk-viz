import EventBus       from '../EventBus.js';
import AudioEngine    from '../audio/AudioEngine.js';
import TemporalMemory from '../sequencer/TemporalMemory.js';
import PatternStore   from '../sequencer/PatternStore.js';
import SynthPattern, { SUBS, DURATION_CYCLE } from '../sequencer/SynthPattern.js';
import ArpSeq, { ARP_PRESETS } from '../sequencer/ArpSeq.js';
import BassPattern, { BASS_PATTERNS_META } from '../sequencer/BassPattern.js';
import Geometry, { TRACK_ORDER } from '../layout/Geometry.js';
import KickFlash   from './effects/KickFlash.js';
import SnareLines  from './effects/SnareLines.js';
import ClapRings   from './effects/ClapRings.js';
import HiHatGrain  from './effects/HiHatGrain.js';

// ── Tonnetz ───────────────────────────────────────────────────────────────────
// note(col,row) = (col×7 + row×4) % 12  →  C is at (4,2)
// Triangle ∆ (col,row)→(col+1,row)→(col,row+1)  :  root, root+7, root+4  = MAJ
// Triangle ▽ (col,row)→(col+1,row)→(col+1,row-1):  root, root+7, root+3  = MIN
const TN_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const TN_SEMI  = { C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11,
                   Db:1,Eb:3,Gb:6,Ab:8,Bb:10 };
const TN_VOI   = { maj:[0,4,7], min:[0,3,7], '7':[0,4,7,10], maj7:[0,4,7,11], sus2:[0,2,7] };

// ── Synth ring arc ───────────────────────────────────────────────────────────────────────────
// 300° arc whose opening (gap ±30° = 60°) points dynamically toward the bass ring.
// The gap follows atan2(bassRingCY-colorCY, bassRingCX-colorCX) in real time.
const ARC_GAP_HALF = Math.PI / 6;                     // 30° on each side of the gap
const ARC_SPAN     = Math.PI * 2 - 2 * ARC_GAP_HALF; // 300°
// Gap direction toward bass ring — recomputed on each call
function getArcStart() {
  return Math.atan2(
    Geometry.bassRingCY - Geometry.colorCY,
    Geometry.bassRingCX - Geometry.colorCX
  ) + ARC_GAP_HALF;
}
// Angle of the i-th element among N in the arc
function arcAngle(i, N) { return getArcStart() + ((i + 0.5) / N) * ARC_SPAN; }
const TN_COF   = { C:0,G:1,D:2,A:3,E:4,B:5,'F#':6,Db:7,Ab:8,Eb:9,Bb:10,F:11 };
function tnNote(col, row) { return ((col * 7 + row * 4) % 12 + 12) % 12; }

const VisuCanvas = {
  canvas: null,
  ctx:    null,
  width:  0,
  height: 0,
  time:   0,

  // BONES needle state
  playheadAngle:       -Math.PI / 2,
  targetPlayheadAngle: -Math.PI / 2,
  playheadFlash:       0,
  currentStep:         0,
  totalSteps:          16,

  // COLOR needle + chord state
  colorAngle:       Math.PI,   // arc center (west)
  targetColorAngle: Math.PI,
  colorVelocity:    0,
  currentChord:     { root: 'C', quality: 'maj' },
  chordFlash:       0,


  // Pivot pulse
  pivotScale: 1.0,

  // BONES — per-track ring pulse (fired at audio time via _spawnEffect)
  _ringPulse: { kick:0, snare:0, clap:0, hihat:0, hihat_open:0 },

  // Sprint F — Ghost patterns (BONES) + grid particles (HUMAN)
  _ghostPatterns: [],
  _particles:     [],
  _shockwaves:    [],   // ondes de choc des drum hits
  _humanAmount:   0,    // 0=ordre/grille  1=chaos/dispersion
  _beatImpulse:   0,    // fired on each beat (step%4===0)

  // COLOR ring + Tonnetz
  _arpNodeName:     null, // note name of the current arp cursor
  _hoveredChord:    null, // { root, quality } under cursor
  _arpStepIndex:    0,    // current step in the arp preset (for visualization)
  _arpPendingPreset: -1,  // pending preset

  // Bass ring
  _bassStepIndex:  -1,
  _bassStepData:   null,
  _bassPendingIdx: -1,

  effects: [],
  _pendingSteps:   [],
  _pendingEffects: [],

  // Phosphor palette (updated by theme:change)
  _phosphorColor: { r: 240, g: 240, b: 240 },

  // Waterfall spectrogram — offscreen canvas
  _wfCanvas: null,
  _wfCtx:    null,

  // Terrain 3D — FFT history buffer
  _terrainHistory: [],

  setPhosphorColor(c) { this._phosphorColor = { ...c }; },

  init(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;

    this._terrainHistory = Array.from({ length: 40 }, () => new Float32Array(80));
    this._resize();
    window.addEventListener('resize', () => {
      Geometry.update();
      this._resize();
    });

    EventBus.on('transport:tick', ({ step, time, steps }) => {
      this._pendingSteps.push({ step, time, steps: steps ?? 16 });
    });

    EventBus.on('drum:trigger', ({ track, time }) => {
      this._pendingEffects.push({ track, time });
    });

    EventBus.on('transport:stop', () => {
      this._pendingSteps   = [];
      this._pendingEffects = [];
      this._terrainHistory = Array.from({ length: 40 }, () => new Float32Array(80));
    });

    EventBus.on('human:change', ({ value }) => { this._humanAmount = value; });

    EventBus.on('theme:change', ({ palette }) => {
      const PALETTES = {
        amber: { r: 232, g: 148, b:  13 },
        green: { r:   0, g: 232, b: 122 },
        white: { r: 240, g: 240, b: 240 },
      };
      if (PALETTES[palette]) this.setPhosphorColor(PALETTES[palette]);
    });

    EventBus.on('chord:change', ({ root, quality }) => {
      this.currentChord = { root, quality };
      // Impulse toward root (does not replace the target step)
      const rootAngle = arcAngle(TN_COF[root] ?? 0, 12);
      let d = rootAngle - this.colorAngle;
      if (d >  Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.colorVelocity += d * 0.25;
    });

    EventBus.on('chord:trigger', ({ quality }) => {
      this.chordFlash = 1.0;
    });

    // Arp note — velocity impulse toward node (does not break step tracking)
    EventBus.on('arp:note', ({ notes }) => {
      if (!notes?.length) return;
      const name = notes[0].replace(/\d/, '');
      this._arpNodeName = name;
      const idx = TN_COF[name];
      if (idx !== undefined) {
        const arpAngle = -Math.PI / 2 + (idx / 12) * Math.PI * 2;
        let d = arpAngle - this.colorAngle;
        if (d >  Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        this.colorVelocity += d * 0.20; // pulls toward note without losing step
      }
    });

    // COLOR ring — interaction
    this.canvas.addEventListener('click',       e => this._colorRingClick(e));
    this.canvas.addEventListener('dblclick',    e => this._colorRingDblClick(e));
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.canvas.addEventListener('mouseleave',  () => { this._hoveredChord = null; });

    // Ghost patterns — capture on each new loop
    EventBus.on('transport:tick', ({ step }) => {
      if (step === 0) this._captureGhost();
    });

    // Arp step tracking
    EventBus.on('arp:step',    ({ stepIndex }) => { this._arpStepIndex     = stepIndex; });
    EventBus.on('arp:pending', ({ index })     => { this._arpPendingPreset = index; });

    // Bass step tracking
    EventBus.on('bass:step',    ({ stepIndex, stepData }) => {
      this._bassStepIndex = stepIndex;
      this._bassStepData  = stepData;
    });
    EventBus.on('bass:pending', ({ index }) => { this._bassPendingIdx = index; });
    EventBus.on('bass:pattern', ()          => { this._bassPendingIdx = -1; });

    // COLOR needle follows synth slot
    EventBus.on('synth:step', ({ index }) => {
      this.targetColorAngle = arcAngle(index, 8);
      this.chordFlash = 1.0;
    });

    // this._initParticles(); // disabled — perf

    this._loop();
  },

  _resize() {
    this.width  = this.canvas.width  = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
    Geometry.update();
    this._initWaterfall();
  },

  _initWaterfall() {
    const bonesW          = Math.floor(this.width * 0.42);
    this._wfCanvas        = document.createElement('canvas');
    this._wfCanvas.width  = bonesW;
    this._wfCanvas.height = this.height;
    this._wfCtx           = this._wfCanvas.getContext('2d');
    this._wfCtx.fillStyle = '#0A0A0A';
    this._wfCtx.fillRect(0, 0, bonesW, this.height);
  },

  _loop() {
    requestAnimationFrame(() => this._loop());
    this.time += 0.016;
    TemporalMemory.tick();
    this._processQueues();
    this._syncCSSVars();
    this._draw();
  },

  _processQueues() {
    const now = AudioEngine.ctx?.currentTime ?? -1;

    while (this._pendingSteps.length && this._pendingSteps[0].time <= now) {
      const { step, steps } = this._pendingSteps.shift();
      this.currentStep  = step;
      this.totalSteps   = steps;
      this.targetPlayheadAngle = -Math.PI / 2 + (step / steps) * Math.PI * 2;
      // COLOR needle driven by synth:step, not transport step
      this.playheadFlash = 1.0;
      // Pivot pulse + beat impulse on each beat
      if (step % 4 === 0) { this.pivotScale = 1.4; this._beatImpulse = 1.0; }
      EventBus.emit('ui:step', { step });
    }

    while (this._pendingEffects.length && this._pendingEffects[0].time <= now) {
      const { track } = this._pendingEffects.shift();
      this._spawnEffect(track);
    }
  },

  _syncCSSVars() {
    const e = TemporalMemory.energy;
    document.documentElement.style.setProperty('--energy',    e.toFixed(3));
    document.documentElement.style.setProperty('--intensity', TemporalMemory._ramp(0, 32, 0, 1).toFixed(3));
  },

  _spawnEffect(track) {
    const { bonesCX: cx, pivotY: cy } = Geometry;
    const radii = Geometry.bonesRadii;

    // Ring pulse — audio-accurate, synced via _pendingEffects queue
    if (this._ringPulse.hasOwnProperty(track)) this._ringPulse[track] = 1.0;

    switch (track) {
      case 'kick':       this.effects.push(new KickFlash(cx, cy, TemporalMemory.kickFlashAlpha)); break;
      case 'snare':      this.effects.push(new SnareLines(this.width, this.height)); break;
      case 'clap':       this.effects.push(new ClapRings(cx, cy, radii.clap)); break;
      // case 'hihat':      this.effects.push(new HiHatGrain(cx, cy, radii.hihat)); break;      // disabled — perf
      // case 'hihat_open': this.effects.push(new HiHatGrain(cx, cy, radii.hihat_open, true)); break; // disabled — perf
    }
    if (this.effects.length > 60) this.effects.splice(0, this.effects.length - 60);

    // Onde de choc — disabled (perf)
    // const speed    = track === 'kick' ? 9 : track === 'snare' ? 6 : 4;
    // const strength = track === 'kick' ? 1.0 : track === 'snare' ? 0.7 : 0.4;
    // this._shockwaves.push({ cx, cy: Geometry.pivotY, radius: 0, speed, strength });
    // if (this._shockwaves.length > 12) this._shockwaves.shift();
  },

  // ── Draw ──────────────────────────────────────────────────────────────────

  _draw() {
    const { ctx } = this;
    const mem     = TemporalMemory;

    // Layer 0 — semi-transparent fill (trail persistence)
    ctx.fillStyle = `rgba(10, 10, 10, ${mem.bgAlpha})`;
    ctx.fillRect(0, 0, this.width, this.height);

    this._drawWaterfall();
    this._drawTerrain();

    // Layer 1 — grid redrawn each frame (no trail)
    this._drawGrid();
    this._drawBonesGhosts();
    this._drawBonesRings();
    this._drawColorRing();
    this._drawBassRing();
    this._drawEffects();
    this._drawStepMarkers();
    this._drawOscilloscope();
    // this._drawHumanParticles(); // disabled — perf
    // this._drawGrain();          // disabled — perf
  },

  _drawWaterfall() {
    const analyser = AudioEngine.getAnalyser();
    if (!analyser || !this._wfCanvas || !this._wfCtx) return;

    const fft  = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(fft);
    const bins = fft.length;
    const W    = this._wfCanvas.width;
    const H    = this.height;
    const ctx  = this._wfCtx;

    // Scroll 1px left
    ctx.drawImage(this._wfCanvas, -1, 0);

    // Write new column at right edge
    const col = ctx.createImageData(1, H);
    const d   = col.data;
    const { r, g, b } = this._phosphorColor;

    for (let py = 0; py < H; py++) {
      const freqFrac = 1 - py / H;
      const binIdx   = Math.floor(Math.pow(freqFrac, 1.8) * (bins - 1));
      const dbVal    = fft[Math.min(binIdx, bins - 1)];
      const norm     = Math.max(0, Math.min(1, (dbVal + 90) / 90));
      const i        = py * 4;
      d[i]     = r * norm * norm;
      d[i + 1] = g * norm * norm;
      d[i + 2] = b * norm * norm;
      d[i + 3] = 255;
    }
    ctx.putImageData(col, W - 1, 0);

    // Composite onto main canvas — clipped to BONES zone only
    this.ctx.save();
    this.ctx.globalAlpha = 0.30;
    this.ctx.drawImage(this._wfCanvas, 0, 0);
    this.ctx.restore();
  },

  _drawTerrain() {
    const analyser = AudioEngine.getAnalyser();
    if (!analyser) return;

    const BINS  = 80;
    const DEPTH = 40;

    // Push new FFT frame into history
    const raw   = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(raw);
    const frame = new Float32Array(BINS);
    for (let b = 0; b < BINS; b++) {
      const src = Math.floor(b / BINS * raw.length * 0.6);
      frame[b]  = Math.max(0, (Math.max(-90, raw[src]) + 90) / 90);
    }
    this._terrainHistory.unshift(frame);
    if (this._terrainHistory.length > DEPTH) this._terrainHistory.pop();

    const { ctx } = this;

    // Clip to HUMAN zone (42%–58% of viewport width, below header, above bottom bar)
    const humanLeft  = this.width  * 0.42;
    const humanRight = this.width  * 0.58;
    const humanW     = humanRight - humanLeft;
    const topY       = 80;
    const botY       = this.height - 48;
    const H          = botY - topY;

    ctx.save();
    ctx.beginPath();
    ctx.rect(humanLeft, topY, humanW, H);
    ctx.clip();

    // Projection (relative to HUMAN zone)
    const FLOOR_Y = H * 0.78;
    const FOV_X   = humanW * 0.85;
    const FOV_Z   = H      * 0.60;
    const TILT    = 0.55;

    const project = (b, row, amp) => {
      const zFrac      = row / (DEPTH - 1);
      const xFrac      = b   / (BINS  - 1);
      const perspScale = 0.12 + zFrac * 0.88;
      return {
        x:     humanLeft + humanW * 0.5 + (xFrac - 0.5) * FOV_X * perspScale,
        y:     topY + FLOOR_Y - (1 - zFrac) * FOV_Z * TILT - amp * 160 * perspScale,
        zFrac,
      };
    };

    const { r, g, b: pb } = this._phosphorColor;
    const pal = (a) => `rgba(${r},${g},${pb},${a.toFixed(3)})`;

    // Painter's algorithm: back to front
    for (let row = DEPTH - 1; row >= 0; row--) {
      const hist = this._terrainHistory[row] ?? this._terrainHistory[this._terrainHistory.length - 1];
      const pts  = [];
      for (let b = 0; b < BINS; b++) pts.push(project(b, row, hist[b]));
      const { zFrac } = pts[0];
      const floorY    = topY + FLOOR_Y;

      // Occlusion fill
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let b = 1; b < BINS; b++) ctx.lineTo(pts[b].x, pts[b].y);
      ctx.lineTo(pts[BINS - 1].x, floorY + 10);
      ctx.lineTo(pts[0].x,        floorY + 10);
      ctx.closePath();
      ctx.fillStyle = `rgba(10,10,10,${(0.60 + zFrac * 0.38).toFixed(3)})`;
      ctx.fill();

      // Wireframe stroke
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let b = 1; b < BINS; b++) ctx.lineTo(pts[b].x, pts[b].y);

      if (row === 0) {
        // Front row — glow pass then sharp pass
        ctx.strokeStyle = pal(0.15);
        ctx.lineWidth   = 7;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let b = 1; b < BINS; b++) ctx.lineTo(pts[b].x, pts[b].y);
        ctx.strokeStyle = pal(0.90);
        ctx.lineWidth   = 1.5;
      } else {
        ctx.strokeStyle = pal(0.04 + zFrac * 0.52);
        ctx.lineWidth   = zFrac < 0.3 ? 0.4 : zFrac < 0.7 ? 0.7 : 1.2;
      }
      ctx.stroke();
    }

    // Axis labels
    ctx.font         = '9px "Courier New"';
    ctx.fillStyle    = pal(0.40);
    ctx.textBaseline = 'top';
    ctx.textAlign    = 'left';
    ctx.fillText('20Hz',   humanLeft + 6,       topY + FLOOR_Y + 4);
    ctx.textAlign    = 'right';
    ctx.fillText('20kHz',  humanRight - 6,      topY + FLOOR_Y + 4);

    ctx.restore();
  },

  // Orthogonal grid — full screen, #1A1A1A on #0A0A0A
  _drawGrid() {
    const { ctx } = this;
    const spacing = 40;
    ctx.strokeStyle = '#1A1A1A';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    for (let x = 0; x <= this.width; x += spacing) {
      ctx.moveTo(x, 0); ctx.lineTo(x, this.height);
    }
    for (let y = 0; y <= this.height; y += spacing) {
      ctx.moveTo(0, y); ctx.lineTo(this.width, y);
    }
    ctx.stroke();
  },

  // BONES concentric rings
  _drawBonesRings() {
    const { ctx, time }       = this;
    const { bonesCX: cx, pivotY: cy } = Geometry;
    const mem = TemporalMemory;

    TRACK_ORDER.forEach((track, i) => {
      // Decay ring pulse
      this._ringPulse[track] = (this._ringPulse[track] || 0) * 0.78;
      const pulse = this._ringPulse[track];

      // Wide breathing from the start (base 4 px), amplified by loops + pulse
      const breathe = Math.sin(time * 0.4 + i * 0.72) * (4 + mem.ringBreathAmp);
      const baseR   = Geometry.bonesRadii[track] + breathe + pulse * 6;
      const alpha   = 0.14 + mem.energy * 0.18 + (i === 0 ? 0.06 : 0) + pulse * 0.45;
      const lineW   = 0.5 + pulse * 2.0;

      ctx.beginPath();
      ctx.strokeStyle = `rgba(240, 240, 240, ${alpha})`;
      ctx.lineWidth   = lineW;

      if (mem.ringDistortion < 0.3) {
        ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
      } else {
        this._distortedRingPath(cx, cy, baseR, mem.ringDistortion, i * 1.1);
      }
      ctx.stroke();
    });

    // Center pulse — flat fill, no gradient
    const e = mem.energy;
    if (e > 0.04) {
      const pulse = 0.5 + Math.sin(time * 2.2) * 0.5;
      ctx.fillStyle = `rgba(232, 0, 13, ${e * 0.09 * pulse})`;
      ctx.beginPath();
      ctx.arc(cx, cy, Geometry.bonesRadii.kick * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  _distortedRingPath(cx, cy, baseR, distortion, phaseShift) {
    const { ctx, time } = this;
    const segments = 72;
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const angle  = -Math.PI / 2 + (i / segments) * Math.PI * 2;
      const wobble = distortion * (
        Math.sin(angle * 3 + time * 0.18 + phaseShift) * 0.65 +
        Math.sin(angle * 7 + time * 0.09 + phaseShift) * 0.35
      );
      const r = baseR + wobble;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  },

  // ── COLOR ring ────────────────────────────────────────────────────────────
  // Outer crown: 8 fixed slots (timeline), radial thickness = duration
  // Inner crown: circle of fifths (harmonic palette)

  _semiToCOF(s) { return (s * 7) % 12; },

  // Duration → radial fraction of the crown (visual thickness)
  _durFrac: { '16n': 0.22, '8n': 0.48, '4n': 0.74, '2n': 1.00 },

  _drawColorRing() {
    const { ctx } = this;
    const mem     = TemporalMemory;
    const { colorCX: cx, colorCY: cy } = Geometry;
    const arcStart = getArcStart();
    const arcEnd   = arcStart + ARC_SPAN;

    const outerR   = Geometry.colorRadii.hihat_open;
    const crownOut = outerR;           // slot outer edge
    const crownIn  = outerR * 0.82;   // slot inner edge
    const crownH   = crownOut - crownIn;
    const arpOut   = outerR * 0.79;   // arp ring outer edge
    const arpIn    = outerR * 0.63;   // arp ring inner edge
    const cofR     = outerR * 0.46;   // rayon du COF

    const NOTES_COF = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];
    const COF_SEMI  = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
    const nAngle    = i => arcAngle(i, 12);
    const nPos      = (i, r) => ({ x: cx + r * Math.cos(nAngle(i)),
                                    y: cy + r * Math.sin(nAngle(i)) });

    const chordSemis = this._chordSemis();
    const rootSemi   = TN_SEMI[this.currentChord.root] ?? 0;

    // ── Chord flash — flat fill at COF center ──
    if (this.chordFlash > 0.01) {
      this.chordFlash *= 0.80;
      ctx.fillStyle = `rgba(232,0,13,${this.chordFlash * 0.07})`;
      ctx.beginPath(); ctx.arc(cx, cy, cofR, 0, Math.PI * 2); ctx.fill();
    }

    // ── Outer crown: 8 slots in the arc ──
    const SLOT_N   = 8;
    const SLOT_ARC = ARC_SPAN / SLOT_N;
    const GAP      = 0.05; // rad
    const offsets  = SynthPattern.slotOffsets();
    const totalSubs = SynthPattern.totalSubs;

    for (let si = 0; si < SLOT_N; si++) {
      const a0       = arcStart + si * SLOT_ARC + GAP / 2;
      const a1       = a0 + SLOT_ARC - GAP;
      const aMid     = a0 + (SLOT_ARC - GAP) / 2;
      const slot     = SynthPattern.slots[si];
      const isEmpty  = slot.root === null;
      const isActive = si === SynthPattern.currentSlotIndex;
      const durOuter = crownIn + crownH * (this._durFrac[slot.duration] ?? 0.48);

      if (isEmpty) {
        // Empty slot — thin dashed arc
        ctx.beginPath(); ctx.arc(cx, cy, crownIn + crownH * 0.15, a0, a1);
        ctx.strokeStyle = 'rgba(240,240,240,0.12)';
        ctx.lineWidth = 1; ctx.setLineDash([3, 5]); ctx.stroke(); ctx.setLineDash([]);
        // "+" at center
        const px = cx + (crownIn + crownH * 0.5) * Math.cos(aMid);
        const py = cy + (crownIn + crownH * 0.5) * Math.sin(aMid);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '11px "Courier New",monospace';
        ctx.fillStyle = 'rgba(240,240,240,0.18)';
        ctx.fillText('+', px, py);
      } else {
        // Filled slot — solid sector, thickness = duration
        ctx.beginPath();
        ctx.arc(cx, cy, durOuter, a0, a1);
        ctx.arc(cx, cy, crownIn,  a1, a0, true);
        ctx.closePath();
        const fillA = isActive ? 0.55 : 0.22;
        ctx.fillStyle = isActive ? `rgba(232,0,13,${fillA})` : `rgba(240,240,240,${fillA})`;
        ctx.fill();

        // Outer edge
        ctx.beginPath(); ctx.arc(cx, cy, durOuter, a0, a1);
        ctx.strokeStyle = isActive ? 'rgba(232,0,13,0.90)' : 'rgba(240,240,240,0.65)';
        ctx.lineWidth = isActive ? 2 : 1.5; ctx.stroke();

        // Chord label — root + abbreviated quality
        const labelR = crownIn + (durOuter - crownIn) * 0.5;
        const lx = cx + labelR * Math.cos(aMid);
        const ly = cy + labelR * Math.sin(aMid);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `bold 10px "Courier New",monospace`;
        ctx.fillStyle = isActive ? 'rgba(255,255,255,0.95)' : 'rgba(240,240,240,0.85)';
        const qShort = slot.quality === 'maj' ? '' : slot.quality === 'min' ? 'm' : slot.quality;
        ctx.fillText(`${slot.root}${qShort}`, lx, ly);
      }
    }

    // ── Arpeggiator ring ──
    this._drawArpRing(cx, cy, arpIn, arpOut);

    // ── Crown boundary arc (inner, follows the gap) ──
    ctx.beginPath(); ctx.arc(cx, cy, crownIn, arcStart, arcEnd);
    ctx.strokeStyle = 'rgba(240,240,240,0.08)';
    ctx.lineWidth = 0.5; ctx.stroke();

    // ── Inner COF — chord polygon ──
    const chordCOF  = chordSemis.map(s => this._semiToCOF(s));
    const sortedCOF = [...chordCOF].sort((a, b) => a - b);
    if (sortedCOF.length >= 2) {
      ctx.beginPath();
      sortedCOF.forEach((i, k) => {
        const p = nPos(i, cofR);
        k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle   = `rgba(240,240,240,${0.05 + this.chordFlash * 0.06 + mem.energy * 0.03})`;
      ctx.strokeStyle = `rgba(240,240,240,${0.60 + this.chordFlash * 0.25})`;
      ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
    }

    // ── 12 COF nodes ──
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    NOTES_COF.forEach((note, i) => {
      const { x, y } = nPos(i, cofR);
      const semi    = COF_SEMI[i];
      const isChord = chordSemis.includes(semi);
      const isRoot  = semi === rootSemi;
      const isArp   = note === this._arpNodeName || TN_NAMES[semi] === this._arpNodeName;
      const isPen   = note === SynthPattern.pen.root;

      const r = isArp ? 11 : isRoot || isPen ? 10 : isChord ? 9 : 6;
      const alpha = isArp ? 1.0 : isRoot ? 0.95 : isPen ? 0.85 : isChord ? 0.75 : 0.28 + mem.energy * 0.08;

      // Active halo
      if (isRoot || isArp || isPen) {
        ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.fillStyle = isArp ? 'rgba(232,0,13,0.15)' : 'rgba(240,240,240,0.08)';
        ctx.fill();
      }
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = isArp ? '#E8000D' : `rgba(240,240,240,${alpha})`; ctx.fill();

      // Label outside the node
      const lx = cx + (cofR + 18) * Math.cos(nAngle(i));
      const ly = cy + (cofR + 18) * Math.sin(nAngle(i));
      ctx.font = `bold ${isRoot || isArp || isPen ? '13px' : '11px'} "Courier New",monospace`;
      ctx.fillStyle = isArp   ? 'rgba(232,0,13,1.0)'
                   : isRoot  ? 'rgba(240,240,240,1.0)'
                   : isPen   ? 'rgba(240,240,240,0.90)'
                   : isChord ? 'rgba(240,240,240,0.70)'
                             : `rgba(240,240,240,${0.28 + mem.energy * 0.08})`;
      ctx.fillText(note, lx, ly);
    });

    // ── Centre : root + quality pips ──
    const QUALITIES = ['maj', 'min', '7', 'maj7', 'sus2'];
    const qIdx  = QUALITIES.indexOf(this.currentChord.quality);
    const pipR  = 24;
    QUALITIES.forEach((q, i) => {
      const angle = -Math.PI / 2 + (i / QUALITIES.length) * Math.PI * 2;
      const px = cx + pipR * Math.cos(angle);
      const py = cy + pipR * Math.sin(angle);
      const isQ = i === qIdx;
      // Halo on active quality
      if (isQ) {
        ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232,0,13,0.15)'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(px, py, isQ ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = isQ ? '#E8000D' : `rgba(240,240,240,${0.22 + mem.energy * 0.10})`;
      ctx.fill();
      // Quality label below pip
      const lx2 = cx + (pipR + 13) * Math.cos(angle);
      const ly2 = cy + (pipR + 13) * Math.sin(angle);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${isQ ? 'bold ' : ''}9px "Courier New",monospace`;
      ctx.fillStyle = isQ ? 'rgba(232,0,13,1.0)' : `rgba(240,240,240,${0.28 + mem.energy * 0.08})`;
      ctx.fillText(q, lx2, ly2);
    });

    // Root at center
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold 18px "Courier New",monospace`;
    ctx.fillStyle = `rgba(240,240,240,${0.80 + mem.energy * 0.20})`;
    ctx.fillText(this.currentChord.root, cx, cy);
  },

  // ── Bass ring ─────────────────────────────────────────────────────────────

  _drawBassRing() {
    const { ctx } = this;
    const { bassRingCX: cx, bassRingCY: cy, bassRingR: R } = Geometry;
    if (!R || R < 10) return;

    const STEPS   = 16;
    const SECTOR  = Math.PI * 2 / STEPS;
    const GAP     = 0.05;
    const innerR  = R * 0.42;
    const ringH   = R - innerR;

    const pattern = BassPattern.currentSteps;
    const meta    = BassPattern.currentMeta;
    const col     = BassPattern.styleColor; // ex: 'rgba(255,160,40,'

    // Outer + inner circles
    ctx.beginPath(); ctx.arc(cx, cy, R,      0, Math.PI * 2);
    ctx.strokeStyle = `${col}0.15)`; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.strokeStyle = `${col}0.10)`; ctx.lineWidth = 0.5; ctx.stroke();

    const NOTE_MIN = -5, NOTE_RANGE = 19; // -5 to 14

    for (let i = 0; i < STEPS; i++) {
      const a0    = -Math.PI / 2 + i * SECTOR + GAP / 2;
      const a1    = a0 + SECTOR - GAP;
      const aMid  = (a0 + a1) / 2;
      const step  = pattern[i];
      const isCur = i === this._bassStepIndex;

      if (!step.a) {
        // Empty step — subtle tick
        ctx.beginPath();
        ctx.arc(cx, cy, innerR + 2, a0 + GAP, a1 - GAP);
        ctx.strokeStyle = 'rgba(240,240,240,0.04)';
        ctx.lineWidth = 0.5; ctx.stroke();
        continue;
      }

      // Bar height proportional to note pitch
      const noteH  = Math.max(0, Math.min(1, (step.n - NOTE_MIN) / NOTE_RANGE));
      const barR   = innerR + noteH * ringH * 0.82 + 3;

      // Filled sector
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(barR, R - 1), a0, a1);
      ctx.arc(cx, cy, innerR, a1, a0, true);
      ctx.closePath();
      const fillA = isCur ? 0.65 : step.ac ? 0.38 : 0.20;
      ctx.fillStyle = isCur
        ? 'rgba(232,0,13,0.65)'
        : step.ac ? `${col}${fillA})` : `rgba(200,200,200,${fillA})`;
      ctx.fill();

      // Outer arc
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(barR, R - 1), a0, a1);
      ctx.strokeStyle = isCur
        ? 'rgba(232,0,13,0.95)'
        : step.ac ? `${col}0.85)` : 'rgba(240,240,240,0.38)';
      ctx.lineWidth = isCur ? 2 : step.ac ? 1.5 : 1; ctx.stroke();

      // Slide: small dot at the junction with the next step
      if (step.sl) {
        const jAngle = a1 + GAP / 2;
        ctx.beginPath();
        ctx.arc(
          cx + (R - 4) * Math.cos(jAngle),
          cy + (R - 4) * Math.sin(jAngle),
          3, 0, Math.PI * 2
        );
        ctx.fillStyle = isCur ? 'rgba(232,0,13,0.90)' : `${col}0.70)`;
        ctx.fill();
      }
    }

    // Pending indicator: dashed arc on outer edge
    if (this._bassPendingIdx >= 0 && this._bassPendingIdx !== BassPattern.activePattern) {
      ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(240,240,240,0.30)';
      ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
    }

    // Center: pattern label + index
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold 10px "Courier New",monospace`;
    ctx.fillStyle = `${col}0.90)`;
    ctx.fillText(meta.label, cx, cy - 8);
    ctx.font = '9px "Courier New",monospace';
    ctx.fillStyle = 'rgba(240,240,240,0.35)';
    ctx.fillText(`${BassPattern.activePattern + 1} / 30`, cx, cy + 8);

    // Chain: dots on the outside
    const chain = BassPattern._chain;
    if (chain.length > 1) {
      chain.forEach((pi, i) => {
        const angle = -Math.PI / 2 + (i / chain.length) * Math.PI * 2;
        const px = cx + (R + 14) * Math.cos(angle);
        const py = cy + (R + 14) * Math.sin(angle);
        ctx.beginPath(); ctx.arc(px, py, pi === BassPattern.activePattern ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = pi === BassPattern.activePattern ? '#E8000D' : `${col}0.60)`;
        ctx.fill();
      });
    }
  },

  // Hit-test bass ring center (for pattern navigation)
  _hitTestBassCenter(mx, my) {
    const { bassRingCX: cx, bassRingCY: cy, bassRingR: R } = Geometry;
    if (!R) return false;
    const dx = mx - cx, dy = my - cy;
    return (dx * dx + dy * dy) < (R * 0.38) * (R * 0.38);
  },

  _chordSemis() {
    const root = TN_SEMI[this.currentChord.root] ?? 0;
    return (TN_VOI[this.currentChord.quality] ?? TN_VOI.maj).map(i => (root + i) % 12);
  },

  // ── Arp ring ──────────────────────────────────────────────────────────────

  _drawArpRing(cx, cy, innerR, outerR) {
    const { ctx } = this;
    const N       = ARP_PRESETS.length;
    const GAP     = 0.045;
    const SECTOR  = ARC_SPAN / N;
    const ringH   = outerR - innerR;
    const MAX_IDX = 7; // valeur max dans les patterns (index 7 = sommet)
    const arcStart = getArcStart();

    for (let pi = 0; pi < N; pi++) {
      const preset   = ARP_PRESETS[pi];
      const a0       = arcStart + pi * SECTOR + GAP / 2;
      const a1       = a0 + SECTOR - GAP;
      const aMid     = (a0 + a1) / 2;
      const isActive  = pi === ArpSeq.activePreset;
      const isPending = pi === ArpSeq.pendingPreset || pi === this._arpPendingPreset;

      // Sector background
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, a0, a1);
      ctx.arc(cx, cy, innerR, a1, a0, true);
      ctx.closePath();
      const bgAlpha = isActive ? 0.18 : isPending ? 0.10 : 0.04;
      ctx.fillStyle = isActive
        ? `rgba(232,0,13,${bgAlpha})`
        : `rgba(240,240,240,${bgAlpha})`;
      ctx.fill();

      // Sector outer edge
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, a0, a1);
      ctx.strokeStyle = isActive
        ? `rgba(232,0,13,0.80)`
        : isPending
          ? `rgba(240,240,240,0.50)`
          : `rgba(240,240,240,0.20)`;
      ctx.lineWidth = isActive ? 1.5 : 1; ctx.stroke();

      // Melodic contour bars (one per preset step)
      if (preset.steps.length > 0) {
        const nSteps  = preset.steps.length;
        const angSpan = SECTOR - GAP;
        for (let si = 0; si < nSteps; si++) {
          const frac    = (si + 0.5) / nSteps;
          const barAngle = a0 + frac * angSpan;
          const noteH   = preset.steps[si] / MAX_IDX;
          const barOuter = innerR + noteH * ringH * 0.82 + 2;

          // Active step (playhead) = red
          const isCurrentStep = isActive && si === this._arpStepIndex % nSteps;
          ctx.beginPath();
          ctx.moveTo(cx + (innerR + 2) * Math.cos(barAngle),
                     cy + (innerR + 2) * Math.sin(barAngle));
          ctx.lineTo(cx + barOuter * Math.cos(barAngle),
                     cy + barOuter * Math.sin(barAngle));
          ctx.strokeStyle = isCurrentStep
            ? 'rgba(232,0,13,0.95)'
            : isActive
              ? 'rgba(240,240,240,0.75)'
              : 'rgba(240,240,240,0.28)';
          ctx.lineWidth = isCurrentStep ? 2 : 1; ctx.stroke();
        }
      }

      // Label
      const lx = cx + (innerR + ringH * 0.42) * Math.cos(aMid);
      const ly = cy + (innerR + ringH * 0.42) * Math.sin(aMid);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(aMid + Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${isActive ? '9' : '8'}px "Courier New",monospace`;
      ctx.fillStyle = isActive
        ? 'rgba(232,0,13,1.0)'
        : isPending
          ? 'rgba(240,240,240,0.80)'
          : 'rgba(240,240,240,0.38)';
      ctx.fillText(preset.label, 0, 0);
      ctx.restore();

      // Separator between sectors
      ctx.beginPath();
      ctx.moveTo(cx + innerR * Math.cos(a0), cy + innerR * Math.sin(a0));
      ctx.lineTo(cx + outerR * Math.cos(a0), cy + outerR * Math.sin(a0));
      ctx.strokeStyle = 'rgba(240,240,240,0.08)';
      ctx.lineWidth = 0.5; ctx.stroke();
    }
  },

  // ── Hit tests ──

  // Arp sector (0 to N-1) under cursor, or -1
  _hitTestArpSector(mx, my) {
    const { colorCX: cx, colorCY: cy } = Geometry;
    const outerR = Geometry.colorRadii.hihat_open;
    const ringIn  = outerR * 0.63;
    const ringOut = outerR * 0.79;
    const dx = mx - cx, dy = my - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < ringIn || dist > ringOut) return -1;

    const N = ARP_PRESETS.length;
    const GAP = 0.045;
    const SECTOR = ARC_SPAN / N;
    const arcStart = getArcStart();
    let relAngle = Math.atan2(dy, dx) - arcStart;
    while (relAngle < 0) relAngle += Math.PI * 2;
    for (let i = 0; i < N; i++) {
      const r0 = i * SECTOR + GAP / 2;
      const r1 = r0 + SECTOR - GAP;
      if (relAngle >= r0 && relAngle <= r1) return i;
    }
    return -1;
  },

  // Slot (0-7) under cursor, or -1
  _hitTestSlot(mx, my) {
    const { colorCX: cx, colorCY: cy } = Geometry;
    const outerR = Geometry.colorRadii.hihat_open;
    const crownIn = outerR * 0.80;
    const dx = mx - cx, dy = my - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < crownIn || dist > outerR) return -1;

    const SLOT_N   = 8;
    const SLOT_ARC = ARC_SPAN / SLOT_N;
    const GAP = 0.05;
    const arcStart = getArcStart();
    let relAngle = Math.atan2(dy, dx) - arcStart;
    while (relAngle < 0) relAngle += Math.PI * 2;
    for (let i = 0; i < SLOT_N; i++) {
      const r0 = i * SLOT_ARC + GAP / 2;
      const r1 = r0 + SLOT_ARC - GAP;
      if (relAngle >= r0 && relAngle <= r1) return i;
    }
    return -1;
  },

  // Quality pip (0-4) under cursor, or -1
  _hitTestQualityPip(mx, my) {
    const { colorCX: cx, colorCY: cy } = Geometry;
    const QUALITIES = ['maj', 'min', '7', 'maj7', 'sus2'];
    const pipR = 24;
    for (let i = 0; i < QUALITIES.length; i++) {
      const angle = -Math.PI / 2 + (i / QUALITIES.length) * Math.PI * 2;
      const px = cx + pipR * Math.cos(angle);
      const py = cy + pipR * Math.sin(angle);
      const dx = mx - px, dy = my - py;
      if (dx * dx + dy * dy < 16 * 16) return i;
    }
    return -1;
  },

  // COF node (0-11) under cursor, or -1
  _hitTestCOFNode(mx, my) {
    const { colorCX: cx, colorCY: cy } = Geometry;
    const cofR = Geometry.colorRadii.hihat_open * 0.46;
    for (let i = 0; i < 12; i++) {
      const angle = arcAngle(i, 12);
      const nx = cx + cofR * Math.cos(angle);
      const ny = cy + cofR * Math.sin(angle);
      if ((mx - nx) ** 2 + (my - ny) ** 2 < 30 * 30) return i;
    }
    return -1;
  },

  _selectQuality(index) {
    const QUALITIES = ['maj', 'min', '7', 'maj7', 'sus2'];
    const q = QUALITIES[index];
    if (!q) return;
    EventBus.emit('chord:change',  { root: this.currentChord.root, quality: q });
    EventBus.emit('chord:preview', { root: this.currentChord.root, quality: q });
  },

  // ── Handlers ──

  _colorRingClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const NOTES_COF = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];

    // Bass ring → prev / next pattern (left click = next, right click = prev)
    if (this._hitTestBassCenter(mx, my)) {
      mx < Geometry.bassRingCX ? BassPattern.prevPattern() : BassPattern.nextPattern();
      return;
    }

    // Center → direct quality selection by pip
    const qPip = this._hitTestQualityPip(mx, my);
    if (qPip >= 0) { this._selectQuality(qPip); return; }

    // Arp ring → select preset
    const arpIdx = this._hitTestArpSector(mx, my);
    if (arpIdx >= 0) { ArpSeq.queuePreset(arpIdx); return; }

    // COF node → select + play chord immediately
    const cofIdx = this._hitTestCOFNode(mx, my);
    if (cofIdx >= 0) {
      EventBus.emit('chord:change', { root: NOTES_COF[cofIdx], quality: this.currentChord.quality });
      EventBus.emit('chord:preview', { root: NOTES_COF[cofIdx], quality: this.currentChord.quality });
      return;
    }

    // Slot: empty → place pen; filled → select as pen
    const slotIdx = this._hitTestSlot(mx, my);
    if (slotIdx < 0) return;
    const slot = SynthPattern.slots[slotIdx];
    if (slot.root === null) SynthPattern.fillSlot(slotIdx);
    else EventBus.emit('chord:change', { root: slot.root, quality: slot.quality });
  },

  _colorRingDblClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    // Double-click bass center = toggle chain
    if (this._hitTestBassCenter(mx, my)) {
      BassPattern.toggleChain(BassPattern.activePattern);
      return;
    }

    const slotIdx = this._hitTestSlot(mx, my);
    if (slotIdx >= 0 && SynthPattern.slots[slotIdx].root !== null) {
      SynthPattern.clearSlot(slotIdx);
    }
  },

  _drawEffects() {
    this.effects = this.effects.filter(e => {
      e.update();
      e.draw(this.ctx);
      return !e.dead;
    });
  },

  // Quarter-note tick marks at steps 1, 5, 9, 13
  _drawStepMarkers() {
    const { ctx }                     = this;
    const { bonesCX: cx, pivotY: cy } = Geometry;
    const outerR    = Geometry.bonesRadii.hihat_open;
    const tickInner = outerR + 6;
    const tickOuter = outerR + 14;
    const numR      = outerR + 24;

    ctx.strokeStyle  = 'rgba(240, 240, 240, 0.2)';
    ctx.fillStyle    = 'rgba(240, 240, 240, 0.2)';
    ctx.lineWidth    = 1;
    ctx.font         = '7px "Courier New", monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    [0, 4, 8, 12].forEach(step => {
      const angle = -Math.PI / 2 + (step / 16) * Math.PI * 2;
      const cos   = Math.cos(angle);
      const sin   = Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(cx + tickInner * cos, cy + tickInner * sin);
      ctx.lineTo(cx + tickOuter * cos, cy + tickOuter * sin);
      ctx.stroke();

      ctx.fillText(step + 1, cx + numR * cos, cy + numR * sin);
    });
  },

  // Circular oscilloscope — inner ring waveform
  _drawOscilloscope() {
    const analyser = AudioEngine.getAnalyser();
    if (!analyser) return;

    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);

    const { ctx }    = this;
    const { r, g, b: pb } = this._phosphorColor;
    const pal = (a) => `rgba(${r},${g},${pb},${a.toFixed(3)})`;

    // Zone: HUMAN column, band below terrain (82%–100% of zone height)
    const humanLeft  = this.width  * 0.42;
    const humanRight = this.width  * 0.58;
    const humanW     = humanRight - humanLeft;
    const topY       = 80;
    const botY       = this.height - 48;
    const zoneH      = botY - topY;
    const scopeTop   = topY  + zoneH * 0.82;
    const scopeBot   = botY  - 8;
    const scopeH     = scopeBot - scopeTop;
    const scopeMidY  = scopeTop + scopeH * 0.5;

    if (scopeH < 20) return; // not enough space

    ctx.save();
    ctx.beginPath();
    ctx.rect(humanLeft, scopeTop, humanW, scopeH);
    ctx.clip();

    // Background grid — 10 cols × 4 rows
    ctx.strokeStyle = pal(0.06);
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    for (let c = 0; c <= 10; c++) {
      const x = humanLeft + (c / 10) * humanW;
      ctx.moveTo(x, scopeTop); ctx.lineTo(x, scopeBot);
    }
    for (let row = 0; row <= 4; row++) {
      const y = scopeTop + (row / 4) * scopeH;
      ctx.moveTo(humanLeft, y); ctx.lineTo(humanRight, y);
    }
    ctx.stroke();

    // Trigger — find first rising zero-crossing
    let trigIdx = 0;
    for (let i = 1; i < buf.length / 2; i++) {
      if (buf[i - 1] < 0 && buf[i] >= 0) { trigIdx = i; break; }
    }

    // Sample window: 2 screen cycles worth of samples
    const sampleCount = Math.min(Math.floor(buf.length * 0.25), buf.length - trigIdx);

    // Two-pass phosphor stroke: glow + sharp
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = 0; i < sampleCount; i++) {
        const x  = humanLeft + (i / (sampleCount - 1)) * humanW;
        const y  = scopeMidY - buf[trigIdx + i] * (scopeH * 0.42);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      if (pass === 0) {
        ctx.strokeStyle = pal(0.12);
        ctx.lineWidth   = 8;
      } else {
        ctx.strokeStyle = pal(0.90);
        ctx.lineWidth   = 1.5;
      }
      ctx.stroke();
    }

    // Labels — TRIG (top-left) and CH1 (bottom-left)
    ctx.font         = '8px "Courier New"';
    ctx.fillStyle    = pal(0.40);
    ctx.textBaseline = 'top';
    ctx.textAlign    = 'left';
    ctx.fillText('TRIG', humanLeft + 4, scopeTop + 3);
    ctx.textBaseline = 'bottom';
    ctx.fillText('CH1',  humanLeft + 4, scopeBot - 3);

    ctx.restore();
  },

  // ── Ghost patterns (BONES) ────────────────────────────────────────────────

  _captureGhost() {
    if (TemporalMemory.loopCount < 1) return;
    const pattern = PatternStore.getPattern();
    const steps   = PatternStore.getSteps();
    const snap    = {};
    TRACK_ORDER.forEach(t => { snap[t] = [...(pattern[t] || [])]; });
    this._ghostPatterns.push({ tracks: snap, steps });
    if (this._ghostPatterns.length > 3) this._ghostPatterns.shift();
  },

  _drawBonesGhosts() {
    if (!this._ghostPatterns.length) return;
    const { ctx }                     = this;
    const { bonesCX: cx, pivotY: cy } = Geometry;

    this._ghostPatterns.forEach((ghost, gi) => {
      // Oldest ghost = faintest
      const opacity = 0.035 * (gi + 1) / this._ghostPatterns.length;
      TRACK_ORDER.forEach(track => {
        const r = Geometry.bonesRadii[track];
        for (let step = 0; step < ghost.steps; step++) {
          if (!ghost.tracks[track]?.[step]) continue;
          const angle = -Math.PI / 2 + (step / ghost.steps) * Math.PI * 2;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          ctx.fillStyle = `rgba(240, 240, 240, ${opacity})`;
          ctx.fillRect((x - 2) | 0, (y - 2) | 0, 4, 4);
        }
      });
    });
  },

  // ── Brownian particles (HUMAN) ────────────────────────────────────────────

  _initParticles() {
    const cols = 10, rows = 9; // 90 particles in a 10×9 grid
    this._particles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const homeX = (c + 0.5) / cols * (window.innerWidth  || 1200);
        const homeY = (r + 0.5) / rows * (window.innerHeight || 800);
        this._particles.push({ x: homeX, y: homeY, vx: 0, vy: 0, homeX, homeY });
      }
    }

    // New seed → reset particles to their home position
    EventBus.on('seed:change', () => {
      this._particles.forEach(p => {
        p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0;
      });
    });
  },

  _drawHumanParticles() {
    const { ctx } = this;
    const mem = TemporalMemory;
    const h   = this._humanAmount;
    const t   = this.time;

    // Advance and prune shockwaves
    this._shockwaves = this._shockwaves.filter(s => {
      s.radius   += s.speed;
      s.strength *= 0.87;
      return s.strength > 0.015;
    });

    // Background wave amplitude — grows with energy and loop count
    const waveAmp = 3 + mem.energy * 14 + Math.min(TemporalMemory.loopCount * 0.4, 8);

    for (let i = 0; i < this._particles.length; i++) {
      const p = this._particles[i];

      // Permanent sinusoidal wave across the grid
      const wx = Math.sin(p.homeY * 0.016 + t * 0.75) * waveAmp;
      const wy = Math.cos(p.homeX * 0.016 + t * 0.55) * waveAmp;
      const tx = p.homeX + wx;
      const ty = p.homeY + wy;

      // Spring toward wavy position (loosens with human)
      const spring = 0.05 + (1 - h) * 0.04;
      p.vx += (tx - p.x) * spring;
      p.vy += (ty - p.y) * spring;

      // Ondes de choc des drum hits
      for (const s of this._shockwaves) {
        const dx   = p.x - s.cx;
        const dy   = p.y - s.cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const band = 50;
        const diff = Math.abs(dist - s.radius);
        if (diff < band) {
          const f = (1 - diff / band) * s.strength * 5;
          p.vx += (dx / dist) * f;
          p.vy += (dy / dist) * f;
        }
      }

      // Human chaos — additional noise
      p.vx += (Math.random() - 0.5) * (0.04 + h * 0.9);
      p.vy += (Math.random() - 0.5) * (0.04 + h * 0.9);

      p.vx *= 0.88;
      p.vy *= 0.88;
      p.x  += p.vx;
      p.y  += p.vy;

      const alpha = 0.45 + mem.energy * 0.30;
      ctx.fillStyle = `rgba(240, 240, 240, ${alpha})`;
      ctx.fillRect(p.x | 0, p.y | 0, 2, 2);
    }

    this._beatImpulse *= 0.72;
  },

  // Grain — permanent low-level texture
  _drawGrain() {
    const { ctx } = this;
    const mem     = TemporalMemory;
    const count   = Math.floor(mem.grainDensity);

    ctx.fillStyle = 'rgba(240, 240, 240, 0.022)';
    for (let i = 0; i < count; i++) {
      ctx.fillRect(Math.random() * this.width | 0, Math.random() * this.height | 0, 1, 1);
    }

    if (mem.accentBleed > 0.02) {
      ctx.fillStyle = `rgba(232, 0, 13, ${mem.accentBleed * 0.04})`;
      const rc = Math.floor(count * 0.15);
      for (let i = 0; i < rc; i++) {
        ctx.fillRect(Math.random() * this.width | 0, Math.random() * this.height | 0, 1, 1);
      }
    }
  }
};

export default VisuCanvas;
