/**
 * BlipBloup — Offline House Renderer v2
 * Structure 32 bars : intro → groove → tension → break → drop → outro
 * Toutes les recommandations d'ingé son appliquées.
 */

import { OfflineAudioContext } from 'node-web-audio-api';
import { writeFileSync }        from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// GLOBALS
// ─────────────────────────────────────────────────────────────────────────────
const BPM         = 128;
const BARS        = 32;
const STEPS       = 16;
const SAMPLE_RATE = 44100;
const STEP_DUR    = 60 / BPM / 4;
const BAR_DUR     = STEP_DUR * STEPS;
const TOTAL_DUR   = BAR_DUR * BARS + 2.5;   // queue reverb/delay

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function noteToFreq(note) {
  const flat = { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#' };
  const m = note.match(/^([A-G][b#]?)(\d)$/);
  if (!m) return 440;
  const name = flat[m[1]] ?? m[1];
  const semi = NOTE_NAMES.indexOf(name);
  const midi = (parseInt(m[2]) + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function whiteNoise(ctx, dur) {
  const len  = Math.ceil(ctx.sampleRate * dur);
  const buf  = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function buildKickLimitCurve() {
  const n = 512, c = new Float32Array(n), knee = 0.75;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1, t = Math.abs(x);
    const y = t <= knee ? t : knee + (1 - knee) * (1 - Math.exp(-((t - knee) / (1 - knee)) * 3.5));
    c[i] = x < 0 ? -y : y;
  }
  return c;
}

const KICK_LIMIT = buildKickLimitCurve();

// ─────────────────────────────────────────────────────────────────────────────
// DRUM SYNTH
// ─────────────────────────────────────────────────────────────────────────────
function kick(ctx, dst, T) {
  const clickSrc  = ctx.createBufferSource();
  clickSrc.buffer = whiteNoise(ctx, 0.006);
  const clickFlt  = ctx.createBiquadFilter();
  clickFlt.type   = 'bandpass'; clickFlt.frequency.value = 2400; clickFlt.Q.value = 0.8;
  const clickEnv  = ctx.createGain();
  clickEnv.gain.setValueAtTime(0, T);
  clickEnv.gain.linearRampToValueAtTime(0.75, T + 0.0005);
  clickEnv.gain.exponentialRampToValueAtTime(0.001, T + 0.006);
  clickSrc.connect(clickFlt); clickFlt.connect(clickEnv);

  const bodyOsc = ctx.createOscillator();
  bodyOsc.type  = 'sawtooth';
  bodyOsc.frequency.setValueAtTime(420, T);
  bodyOsc.frequency.exponentialRampToValueAtTime(50, T + 0.030);
  const bodyEnv = ctx.createGain();
  bodyEnv.gain.setValueAtTime(0, T);
  bodyEnv.gain.linearRampToValueAtTime(0.80, T + 0.0005);
  bodyEnv.gain.exponentialRampToValueAtTime(0.001, T + 0.100);
  bodyEnv.gain.setValueAtTime(0, T + 0.100);
  const bodyLP = ctx.createBiquadFilter();
  bodyLP.type  = 'lowpass'; bodyLP.frequency.value = 160; bodyLP.Q.value = 0.5;
  bodyOsc.connect(bodyEnv); bodyEnv.connect(bodyLP);

  const subOsc = ctx.createOscillator();
  subOsc.type  = 'sine';
  subOsc.frequency.setValueAtTime(72, T);
  subOsc.frequency.exponentialRampToValueAtTime(38, T + 0.020);
  const subEnv = ctx.createGain();
  subEnv.gain.setValueAtTime(0, T);
  subEnv.gain.linearRampToValueAtTime(0.85, T + 0.0005);
  subEnv.gain.exponentialRampToValueAtTime(0.001, T + 0.150);
  subEnv.gain.setValueAtTime(0, T + 0.150);
  subOsc.connect(subEnv);

  const mix = ctx.createGain(); mix.gain.value = 1.0;
  const lim = ctx.createWaveShaper(); lim.curve = KICK_LIMIT; lim.oversample = '2x';
  clickEnv.connect(mix); bodyLP.connect(mix); subEnv.connect(mix);
  mix.connect(lim); lim.connect(dst);

  const END = T + 0.155;
  clickSrc.start(T);
  bodyOsc.start(T); bodyOsc.stop(END);
  subOsc.start(T);  subOsc.stop(END);
}

function snare(ctx, dst, T, vel = 1.0) {
  const osc = ctx.createOscillator(), oscGain = ctx.createGain();
  osc.frequency.value = 200;
  oscGain.gain.setValueAtTime(0.55 * vel, T);
  oscGain.gain.exponentialRampToValueAtTime(0.001, T + 0.08);
  osc.connect(oscGain); oscGain.connect(dst);
  osc.start(T); osc.stop(T + 0.08);

  const noise = ctx.createBufferSource();
  noise.buffer = whiteNoise(ctx, 0.16);
  const noiseHP = ctx.createBiquadFilter();
  noiseHP.type  = 'highpass'; noiseHP.frequency.value = 280; noiseHP.Q.value = 1.0;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.80 * vel, T);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, T + 0.16);
  noise.connect(noiseHP); noiseHP.connect(noiseGain); noiseGain.connect(dst);
  noise.start(T);
}

function clap(ctx, dst, T) {
  [0, 0.010, 0.020].forEach(offset => {
    const t = T + offset;
    const n = ctx.createBufferSource();
    n.buffer = whiteNoise(ctx, 0.10);
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass'; flt.frequency.value = 1600; flt.Q.value = 1.0;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.80, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
    n.connect(flt); flt.connect(gain); gain.connect(dst);
    n.start(t);
  });
}

// Groove hihat — vélocités variables + 16ths ponctuels
// velPattern : 16 entrées [0..1] ou null = silence
function hihat(ctx, dst, T, open = false, vel = 1.0) {
  const dur  = open ? 0.35 : 0.060;
  const noise = ctx.createBufferSource();
  noise.buffer = whiteNoise(ctx, dur);
  const flt = ctx.createBiquadFilter();
  flt.type  = 'highpass'; flt.frequency.value = open ? 5500 : 7000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime((open ? 0.40 : 0.48) * vel, T);
  gain.gain.exponentialRampToValueAtTime(0.001, T + dur);
  noise.connect(flt); flt.connect(gain); gain.connect(dst);
  noise.start(T);
}

// ─────────────────────────────────────────────────────────────────────────────
// BASS SYNTH
// ─────────────────────────────────────────────────────────────────────────────
function bass(ctx, dst, note, accent, T, stepDur, cutoffHz = 600) {
  const freq  = noteToFreq(note);
  const dur   = stepDur * (accent ? 0.85 : 0.68);
  const baseF = cutoffHz * 0.25;
  const peakF = accent ? cutoffHz * 3.0 : cutoffHz * 1.5;

  const osc   = ctx.createOscillator();
  osc.type    = 'sawtooth';
  osc.frequency.setValueAtTime(freq, T);

  const flt   = ctx.createBiquadFilter();
  flt.type    = 'lowpass'; flt.Q.value = 6;
  flt.frequency.setValueAtTime(baseF, T);
  flt.frequency.linearRampToValueAtTime(peakF, T + 0.002);
  flt.frequency.exponentialRampToValueAtTime(baseF + 30, T + 0.14);

  const ampEnv = ctx.createGain();
  ampEnv.gain.setValueAtTime(0, T);
  ampEnv.gain.linearRampToValueAtTime(accent ? 0.82 : 0.60, T + 0.002);
  ampEnv.gain.setValueAtTime(accent ? 0.82 : 0.60, T + dur * 0.72);
  ampEnv.gain.linearRampToValueAtTime(0, T + dur);

  const hp = ctx.createBiquadFilter();
  hp.type  = 'highpass'; hp.frequency.value = 45; hp.Q.value = 0.5;

  osc.connect(flt); flt.connect(ampEnv); ampEnv.connect(hp); hp.connect(dst);
  osc.start(T); osc.stop(T + dur + 0.05);
}

// ─────────────────────────────────────────────────────────────────────────────
// PAD SYNTH — filter envelope (300→1200Hz)
// ─────────────────────────────────────────────────────────────────────────────
function pad(ctx, dst, notes, T, dur) {
  notes.forEach((note, i) => {
    const freq = noteToFreq(note);
    const osc  = ctx.createOscillator();
    osc.type   = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value    = (i - notes.length / 2) * 6;

    // Filter envelope — P3
    const flt  = ctx.createBiquadFilter();
    flt.type   = 'lowpass'; flt.Q.value = 2.4;
    flt.frequency.setValueAtTime(300, T);
    flt.frequency.linearRampToValueAtTime(1200, T + 0.025);
    flt.frequency.exponentialRampToValueAtTime(650, T + 0.18);
    flt.frequency.setTargetAtTime(400, T + 0.18, 0.4);

    const env  = ctx.createGain();
    const vel  = 0.065;
    env.gain.setValueAtTime(0, T);
    env.gain.linearRampToValueAtTime(vel, T + 0.025);
    env.gain.setValueAtTime(vel * 0.80, T + dur - 0.06);
    env.gain.linearRampToValueAtTime(0, T + dur);

    osc.connect(flt); flt.connect(env); env.connect(dst);
    osc.start(T); osc.stop(T + dur + 0.15);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// STAB SYNTH — piano/chord stab percussif, mid-forward (500Hz–2kHz) — P1
// ─────────────────────────────────────────────────────────────────────────────
function stab(ctx, dst, notes, T, vel = 1.0) {
  notes.forEach((note, i) => {
    const freq = noteToFreq(note);

    // Double oscillateur légèrement désaccordé = épaisseur
    [0, 7].forEach(detuneC => {
      const osc  = ctx.createOscillator();
      osc.type   = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value    = detuneC + (i % 2 === 0 ? 3 : -3);

      // BP centré sur les mids 1.6kHz — comble le trou spectral
      const flt  = ctx.createBiquadFilter();
      flt.type   = 'bandpass'; flt.frequency.value = 1600; flt.Q.value = 0.55;

      // Attaque percussive 5ms, decay 90ms
      const env  = ctx.createGain();
      env.gain.setValueAtTime(0, T);
      env.gain.linearRampToValueAtTime(0.14 * vel, T + 0.005);
      env.gain.exponentialRampToValueAtTime(0.001, T + 0.090);

      osc.connect(flt); flt.connect(env); env.connect(dst);
      osc.start(T); osc.stop(T + 0.12);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDUPS — snare rolls et sweep noise
// ─────────────────────────────────────────────────────────────────────────────
function snareRoll(ctx, dst, barStart, numBars) {
  const totalSteps = numBars * STEPS;
  for (let s = 0; s < totalSteps; s++) {
    const T    = barStart + s * STEP_DUR;
    const prog = s / totalSteps;          // 0→1 sur la durée du roll
    const vel  = 0.25 + prog * 0.70;      // crescendo
    // Tous les 2 steps au début, tous les steps à la fin
    const density = Math.floor(2 - prog); // 2→1 (progressif)
    if (s % Math.max(1, density) === 0) {
      snare(ctx, dst, T, vel);
    }
  }
}

// Sweep noise passe-haut ascendant (tension atmosphérique)
function sweepNoise(ctx, dst, T, dur) {
  const noise  = ctx.createBufferSource();
  noise.buffer = whiteNoise(ctx, dur);
  const flt    = ctx.createBiquadFilter();
  flt.type     = 'highpass';
  flt.frequency.setValueAtTime(8000, T);
  flt.frequency.exponentialRampToValueAtTime(400, T + dur);  // descend = rising tension
  const gain   = ctx.createGain();
  gain.gain.setValueAtTime(0, T);
  gain.gain.linearRampToValueAtTime(0.30, T + dur * 0.6);
  gain.gain.linearRampToValueAtTime(0.001, T + dur);
  noise.connect(flt); flt.connect(gain); gain.connect(dst);
  noise.start(T);
}

// ─────────────────────────────────────────────────────────────────────────────
// PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

// Groove hihat — vélocités sur 16 steps (P4)
// Format: index → [closed_vel | null, open_vel | null]
const HAT_GROOVE = [
  // Step : [CH vel, OH vel]
  /* 0  */ [0.90, null],
  /* 1  */ [0.28, null],
  /* 2  */ [0.55, 0.70],   // OH downbeat off
  /* 3  */ [0.20, null],
  /* 4  */ [0.82, null],
  /* 5  */ [0.30, null],
  /* 6  */ [0.60, null],
  /* 7  */ [null, null],
  /* 8  */ [0.88, null],
  /* 9  */ [0.28, null],
  /* 10 */ [0.52, 0.65],   // OH
  /* 11 */ [null, null],
  /* 12 */ [0.80, null],
  /* 13 */ [0.35, null],
  /* 14 */ [0.58, null],
  /* 15 */ [0.22, null],
];

// Bassline 2-bars (A=steps 0–15, B=steps 16–31)
const BASS_A = [
  [0,  'C2',  true ],
  [1,  'C2',  false],
  [2,  'Eb2', false],
  [4,  'G2',  true ],
  [5,  'G2',  false],
  [6,  'Bb2', false],
  [8,  'C3',  true ],
  [9,  'Bb2', false],
  [10, 'G2',  false],
  [12, 'F2',  true ],
  [13, 'Eb2', false],
  [14, 'F2',  false],
  [15, 'G2',  false],
];
const BASS_B = [
  [0,  'Eb2', true ],
  [1,  'Eb2', false],
  [2,  'G2',  false],
  [4,  'Bb2', true ],
  [5,  'Ab2', false],
  [6,  'G2',  false],
  [8,  'G2',  true ],
  [9,  'F2',  false],
  [10, 'Eb2', false],
  [12, 'C2',  true ],
  [13, 'D2',  false],
  [14, 'Eb2', false],
  [15, 'G2',  false],
];

// Pads — 2-bar chord loop
// Cm : C Eb G Bb | Fm : F Ab C Eb | Gm7 : G Bb D F | Ebmaj : Eb G Bb D
const PADS_A = [
  { step: 0,  notes: ['C3','Eb3','G3','Bb3'], dur: 8 },
  { step: 8,  notes: ['F3','Ab3','C4','Eb4'], dur: 8 },
];
const PADS_B = [
  { step: 0,  notes: ['G3','Bb3','D4','F4'],  dur: 8 },
  { step: 8,  notes: ['Eb3','G3','Bb3','D4'], dur: 8 },
];

// Stabs — chord stab percussif sur beats 1,2,3,4 (steps 0,4,8,12)
const STABS_A = [
  { step: 0,  notes: ['C4','Eb4','G4'],  vel: 1.0 },
  { step: 4,  notes: ['C4','Eb4','G4'],  vel: 0.65 },
  { step: 8,  notes: ['F4','Ab4','C5'],  vel: 1.0 },
  { step: 12, notes: ['F4','Ab4','C5'],  vel: 0.65 },
];
const STABS_B = [
  { step: 0,  notes: ['G4','Bb4','D5'],  vel: 1.0 },
  { step: 4,  notes: ['G4','Bb4','D5'],  vel: 0.65 },
  { step: 8,  notes: ['Eb4','G4','Bb4'], vel: 1.0 },
  { step: 12, notes: ['Eb4','G4','Bb4'], vel: 0.65 },
];

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURE 32 BARS
// ─────────────────────────────────────────────────────────────────────────────
// Chaque bar a des flags : kick,snare,clap,hats,bass,pad,stab,kickCutoff
// kickCutoff : fréquence cutoff de la basse (automation pour builds)
const STRUCTURE = (() => {
  const def = (overrides) => ({
    kick: true, snare: true, clap: true, hats: true,
    bass: true, pad: false,  stab: false, cutoff: 600,
    ...overrides
  });
  const bars = [];
  for (let i = 0; i < 32; i++) {
    if (i < 4) {
      // Intro — kick seul + CH stripped
      bars.push(def({ snare: false, clap: false, bass: false, pad: false,
        hats: true, stab: false, cutoff: 600 }));
    } else if (i < 8) {
      // Groove in — kick + grosse caisse + basse
      bars.push(def({ pad: false, stab: false, cutoff: 600 }));
    } else if (i < 12) {
      // Full groove — + pads
      bars.push(def({ pad: true, stab: false, cutoff: 600 }));
    } else if (i < 16) {
      // Tension — tous + stabs, cutoff monte progressivement
      const prog    = (i - 12) / 4;
      bars.push(def({ pad: true, stab: true, cutoff: 600 + prog * 600 }));
    } else if (i < 18) {
      // Break — plus de kick, pads longs, basse seule
      bars.push(def({ kick: false, snare: false, clap: false, hats: false,
        bass: true, pad: true, stab: false, cutoff: 400 }));
    } else if (i < 20) {
      // Build — snare roll (géré séparément), sweep, pads
      bars.push(def({ kick: false, snare: false, clap: false, hats: false,
        bass: true, pad: true, stab: false, cutoff: 400 }));
    } else if (i < 24) {
      // Drop — énergie maximale, stabs sur chaque beat
      bars.push(def({ pad: true, stab: true, cutoff: 900 }));
    } else if (i < 28) {
      // Groove out — full mais stabs diminuent
      const hasStab = i < 26;
      bars.push(def({ pad: true, stab: hasStab, cutoff: 700 }));
    } else {
      // Outro — strip back
      bars.push(def({ pad: false, stab: false, cutoff: 500 }));
    }
  }
  return bars;
})();

// ─────────────────────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────────────────────
async function render() {
  const ctx = new OfflineAudioContext(2, Math.ceil(TOTAL_DUR * SAMPLE_RATE), SAMPLE_RATE);

  // ── Master chain ───────────────────────────────────────────────────────────
  const masterGain = ctx.createGain(); masterGain.gain.value = 0.50;
  const dcBlock    = ctx.createBiquadFilter();
  dcBlock.type     = 'highpass'; dcBlock.frequency.value = 10; dcBlock.Q.value = 0.5;
  const masterLim  = ctx.createDynamicsCompressor();
  masterLim.threshold.value = -2; masterLim.knee.value = 1;
  masterLim.ratio.value     = 20; masterLim.attack.value = 0.0005;
  masterLim.release.value   = 0.08;
  // Makeup gain +8 dB pour cibler -9 LUFS (P0)
  const makeupGain = ctx.createGain(); makeupGain.gain.value = Math.pow(10, 8 / 20);
  masterGain.connect(dcBlock); dcBlock.connect(masterLim);
  masterLim.connect(makeupGain); makeupGain.connect(ctx.destination);

  // ── Reverb ─────────────────────────────────────────────────────────────────
  const reverbSend   = ctx.createGain(); reverbSend.gain.value = 1.0;
  const convolver    = ctx.createConvolver();
  convolver.buffer   = buildIR(ctx, 2.2);
  const reverbReturn = ctx.createGain(); reverbReturn.gain.value = 0.20;
  reverbSend.connect(convolver); convolver.connect(reverbReturn); reverbReturn.connect(masterGain);

  // ── Delay 8th note + LP feedback (P4) ─────────────────────────────────────
  const delaySend     = ctx.createGain();
  const delayNode     = ctx.createDelay(2.0);
  delayNode.delayTime.value = 60 / BPM / 2;
  const delayFbk      = ctx.createGain(); delayFbk.gain.value = 0.28;
  const delayFbkLP    = ctx.createBiquadFilter();
  delayFbkLP.type     = 'lowpass'; delayFbkLP.frequency.value = 7000;
  const delayReturn   = ctx.createGain(); delayReturn.gain.value = 0.16;
  delaySend.connect(delayNode);
  delayNode.connect(delayFbkLP); delayFbkLP.connect(delayFbk);
  delayFbk.connect(delayNode);
  delayNode.connect(delayReturn); delayReturn.connect(masterGain);

  // ── Pre-delay pour clap (P2) — 35ms avant le reverb send ──────────────────
  const clapPreDelay = ctx.createDelay(0.1);
  clapPreDelay.delayTime.value = 0.035;
  clapPreDelay.connect(reverbSend);

  // ── Bus instruments ────────────────────────────────────────────────────────
  const mkBus = (dryGain, rvSend = 0, dlSend = 0, rvNode = reverbSend) => {
    const g = ctx.createGain(); g.gain.value = dryGain;
    g.connect(masterGain);
    if (rvSend > 0) { const r = ctx.createGain(); r.gain.value = rvSend; g.connect(r); r.connect(rvNode); }
    if (dlSend > 0) { const d = ctx.createGain(); d.gain.value = dlSend; g.connect(d); d.connect(delaySend); }
    return g;
  };

  const busKick  = mkBus(0.85, 0.00, 0.00);
  const busSnare = mkBus(0.75, 0.26, 0.08);
  const busClap  = mkBus(0.65, 0.00, 0.32, clapPreDelay);  // reverb via pre-delay
  const busCH    = mkBus(0.70, 0.06, 0.42);
  const busOH    = mkBus(0.55, 0.38, 0.30);
  const busBass  = mkBus(0.70, 0.08, 0.12);
  const busSynth = mkBus(0.44, 0.38, 0.20);
  const busStab  = mkBus(0.50, 0.28, 0.35);
  const busBuild = mkBus(0.55, 0.60, 0.00);  // sweep noise + snare rolls

  // Sidechain basse → duck au kick
  const bassSG = ctx.createGain(); bassSG.gain.value = 1.0;
  bassSG.connect(busBass);

  // ── Séquençage ─────────────────────────────────────────────────────────────
  for (let bar = 0; bar < BARS; bar++) {
    const barT  = bar * BAR_DUR;
    const cfg   = STRUCTURE[bar];
    const bassP = bar % 2 === 0 ? BASS_A : BASS_B;
    const padP  = bar % 2 === 0 ? PADS_A : PADS_B;
    const stabP = bar % 2 === 0 ? STABS_A : STABS_B;

    // ── Drums step-by-step ───────────────────────────────────────────────────
    for (let step = 0; step < STEPS; step++) {
      const T = barT + step * STEP_DUR;

      if (cfg.kick  && [0,4,8,12].includes(step)) {
        kick(ctx, busKick, T);
        // Sidechain basse
        const g = bassSG.gain;
        g.setValueAtTime(1.0,  T);
        g.linearRampToValueAtTime(0.12, T + 0.010);
        g.linearRampToValueAtTime(1.0,  T + 0.130);
      }
      if (cfg.snare && [4,12].includes(step)) snare(ctx, busSnare, T);
      if (cfg.clap  && [4,12].includes(step)) clap(ctx, busClap, T + 0.001);

      if (cfg.hats) {
        const [chVel, ohVel] = HAT_GROOVE[step];
        if (chVel != null) hihat(ctx, busCH, T, false, chVel);
        if (ohVel != null) hihat(ctx, busOH, T, true,  ohVel);
      }
    }

    // ── Basse ────────────────────────────────────────────────────────────────
    if (cfg.bass) {
      bassP.forEach(([step, note, accent]) => {
        const T = barT + step * STEP_DUR;
        bass(ctx, bassSG, note, accent, T, STEP_DUR, cfg.cutoff);
      });
    }

    // ── Pads ─────────────────────────────────────────────────────────────────
    if (cfg.pad) {
      padP.forEach(({ step, notes, dur }) => {
        const T = barT + step * STEP_DUR;
        pad(ctx, busSynth, notes, T, dur * STEP_DUR);
      });
    }

    // ── Stabs ────────────────────────────────────────────────────────────────
    if (cfg.stab) {
      stabP.forEach(({ step, notes, vel }) => {
        const T = barT + step * STEP_DUR;
        stab(ctx, busStab, notes, T, vel);
      });
    }
  }

  // ── Build spéciaux : snare rolls + sweep (bars 18–19) ─────────────────────
  snareRoll(ctx, busBuild, BARS_T(18), 2);
  sweepNoise(ctx, busBuild, BARS_T(18), BAR_DUR * 2);

  console.log(`Rendering ${BARS} bars @ ${BPM} BPM — ${(TOTAL_DUR).toFixed(1)}s…`);
  const buffer = await ctx.startRendering();
  console.log('Done.');
  return buffer;
}

function BARS_T(bar) { return bar * BAR_DUR; }

// ─────────────────────────────────────────────────────────────────────────────
// REVERB IR
// ─────────────────────────────────────────────────────────────────────────────
function buildIR(ctx, decay) {
  const len = Math.floor(ctx.sampleRate * decay);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // Pre-delay gap 8ms pour early reflections
    const preSamples = Math.floor(0.008 * ctx.sampleRate);
    for (let i = 0; i < len; i++) {
      const env = i < preSamples ? 0 : Math.pow(1 - (i - preSamples) / (len - preSamples), 1.5);
      d[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// WAV 24-bit ENCODER
// ─────────────────────────────────────────────────────────────────────────────
function encodeWAV24(buffer) {
  const nCh = 2, sr = buffer.sampleRate, n = buffer.length;
  const bps = 3, dataSize = n * nCh * bps, fileSize = 44 + dataSize;
  const out = Buffer.alloc(fileSize);
  let o = 0;
  const w16 = v => { out.writeUInt16LE(v, o); o += 2; };
  const w32 = v => { out.writeUInt32LE(v, o); o += 4; };
  const ws  = s => { for (const c of s) out.writeUInt8(c.charCodeAt(0), o++); };
  ws('RIFF'); w32(fileSize - 8); ws('WAVE');
  ws('fmt '); w32(16); w16(1); w16(nCh); w32(sr);
  w32(sr * nCh * bps); w16(nCh * bps); w16(24);
  ws('data'); w32(dataSize);
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0);
  const MAX = (1 << 23) - 1;
  for (let i = 0; i < n; i++) {
    for (const ch of [L, R]) {
      const v = Math.round(Math.max(-1, Math.min(1, ch[i])) * MAX);
      out[o++] = v & 0xFF; out[o++] = (v >> 8) & 0xFF; out[o++] = (v >> 16) & 0xFF;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYSE SIGNAL
// ─────────────────────────────────────────────────────────────────────────────
function analyze(buffer) {
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0);
  const N = buffer.length, sr = buffer.sampleRate;
  let pkL = 0, pkR = 0, ssL = 0, ssR = 0, clips = 0, dcL = 0, dcR = 0;
  for (let i = 0; i < N; i++) {
    if (Math.abs(L[i]) > pkL) pkL = Math.abs(L[i]);
    if (Math.abs(R[i]) > pkR) pkR = Math.abs(R[i]);
    ssL += L[i] * L[i]; ssR += R[i] * R[i];
    if (Math.abs(L[i]) >= 0.9999 || Math.abs(R[i]) >= 0.9999) clips++;
    dcL += L[i]; dcR += R[i];
  }
  const rmsL = Math.sqrt(ssL / N), rmsR = Math.sqrt(ssR / N);
  const dB = v => v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-∞';

  // FFT spectral analysis
  const WIN = 4096, HWIN = WIN / 2, nW = Math.floor(N / WIN);
  const mag = new Float64Array(HWIN);
  for (let w = 0; w < nW; w++) {
    const off = w * WIN;
    for (let k = 0; k < HWIN; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < WIN; n++) {
        const s = (L[off + n] + R[off + n]) * 0.5;
        const win = 0.5 * (1 - Math.cos(2 * Math.PI * n / WIN));
        const a = -2 * Math.PI * k * n / WIN;
        re += s * win * Math.cos(a); im += s * win * Math.sin(a);
      }
      mag[k] += Math.sqrt(re * re + im * im) / nW;
    }
  }
  const band = (fL, fH) => {
    const kL = Math.round(fL / (sr / WIN)), kH = Math.round(fH / (sr / WIN));
    let e = 0;
    for (let k = kL; k <= Math.min(kH, HWIN - 1); k++) e += mag[k];
    return e / Math.max(1, kH - kL + 1);
  };
  const toDB = v => v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-∞';

  // LUFS simplifié
  const lufs = (20 * Math.log10(rmsL) + 0.9).toFixed(1);

  // Crest factor
  const crestL = (20 * Math.log10(pkL / rmsL)).toFixed(1);

  return { dur: (N / sr).toFixed(2), pkL: dB(pkL), pkR: dB(pkR),
    rmsL: dB(rmsL), rmsR: dB(rmsR), lufs, clips, crestL,
    dc: (Math.abs(dcL / N)).toFixed(6),
    sub:     toDB(band(20,   80)),
    bass:    toDB(band(80,  250)),
    lowMid:  toDB(band(250, 500)),
    mid:     toDB(band(500, 2000)),
    highMid: toDB(band(2000,6000)),
    air:     toDB(band(6000,16000)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  const buffer  = await render();
  const stats   = analyze(buffer);
  const wav     = encodeWAV24(buffer);
  const outPath = '/Users/thx/workspace/BlipBloup/scripts/blipbloup-house.wav';
  writeFileSync(outPath, wav);
  console.log(`\nWAV 24-bit → ${outPath} (${(wav.length/1024/1024).toFixed(1)} MB)`);

  const bar = (val, min, max) => {
    const n = Math.round(Math.max(0, (parseFloat(val) - min) / (max - min)) * 28);
    return '█'.repeat(n) + '░'.repeat(28 - n);
  };

  console.log(`
╔══════════════════════════════════════════════════════╗
║       ANALYSE SIGNAL — blipbloup-house.wav           ║
╠══════════════════════════════════════════════════════╣
║  Durée           : ${stats.dur}s / ${BARS} bars @ ${BPM} BPM             ║
║  Peak L/R        : ${stats.pkL} / ${stats.pkR} dBFS               ║
║  RMS L/R         : ${stats.rmsL} / ${stats.rmsR} dBFS               ║
║  LUFS intégré ≈  : ${stats.lufs} LUFS                           ║
║  Crest factor    : ${stats.crestL} dB                            ║
║  Clips           : ${stats.clips}                                   ║
║  DC offset       : ${stats.dc}                              ║
╠══════════════════════════════════════════════════════╣
║  SPECTRE (énergie moyenne par bande)                 ║
║  Sub  20–80Hz    ${bar(stats.sub,    -50, 0)}  ${stats.sub} dB  ║
║  Bass 80–250Hz   ${bar(stats.bass,   -50, 0)}  ${stats.bass} dB  ║
║  LMid 250–500Hz  ${bar(stats.lowMid, -50, 0)}  ${stats.lowMid} dB  ║
║  Mid  500–2kHz   ${bar(stats.mid,    -50, 0)}  ${stats.mid} dB  ║
║  HMid 2–6kHz     ${bar(stats.highMid,-50, 0)}  ${stats.highMid} dB  ║
║  Air  6–16kHz    ${bar(stats.air,    -50, 0)}  ${stats.air} dB  ║
╚══════════════════════════════════════════════════════╝`);
})();
