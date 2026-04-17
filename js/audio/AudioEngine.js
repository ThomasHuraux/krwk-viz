import EventBus    from '../EventBus.js';
import DrumSynth   from './DrumSynth.js';
import FXBus       from './FXBus.js';
import PatternStore from '../sequencer/PatternStore.js';

// Tone.js is imported via importmap — available globally after index.html setup.
// We share our AudioContext with Tone so both can coexist on the same audio graph.

const AudioEngine = {
  ctx:        null,
  analyser:   null,
  masterGain: null,
  drumSynth:  null,

  async init() {
    this.ctx = new AudioContext();

    this.analyser         = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;

    this.masterGain            = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;

    // Master limiter — protects against clipping when all tracks play simultaneously
    this.masterLimiter                    = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value    = -3;
    this.masterLimiter.knee.value         = 2;
    this.masterLimiter.ratio.value        = 20;
    this.masterLimiter.attack.value       = 0.001;
    this.masterLimiter.release.value      = 0.08;

    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    FXBus.init(this.ctx, this.masterGain, PatternStore.getBPM());

    EventBus.on('master:change', ({ value }) => this.setMasterVolume(value));
    this.drumSynth = new DrumSynth(this.ctx, this.masterGain, FXBus);

    // Share AudioContext with Tone.js — ready for Sprint D synth
    // Tone is loaded via CDN script tag (not ESM import) to avoid CORS issues
    if (window.Tone) {
      await window.Tone.start();
      window.Tone.setContext(this.ctx);
    }

    return this.ctx;
  },

  getAnalyser()   { return this.analyser; },
  getMasterGain() { return this.masterGain; },

  triggerDrum(track, time, step = 0) {
    if (!this.drumSynth) return;
    this.drumSynth.trigger(track, time, step);
    EventBus.emit('drum:trigger', { track, time });
  },

  setMasterVolume(v) {
    if (!this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(
      Math.max(0, Math.min(1, v)),
      this.ctx.currentTime,
      0.01
    );
  }
};

export default AudioEngine;
