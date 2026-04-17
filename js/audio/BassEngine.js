import EventBus     from '../EventBus.js';
import PatternStore  from '../sequencer/PatternStore.js';
import FXBus         from './FXBus.js';

// 303-style MonoSynth: sawtooth + resonant LP filter + envelope follower
// Auto-sidechain with the kick

const BassEngine = {
  synth:      null,
  ctx:        null,
  _gainOut:   null,
  _sideGain:  null,
  _distNode:  null,  // WaveShaper saturation 303
  _prevSlide: false,
  _muted:     false,
  _humanAmount: 0,

  // Live parameters (cutoff Hz, resonance Q, envMod octaves, decay s)
  cutoff:    600,
  resonance: 6,
  envMod:    3.5,
  decay:     0.12,

  listen() {
    EventBus.on('bass:note', ({ note, accent, slide, time }) => {
      if (!this.synth || this._muted) return;
      this._trigger(note, accent, slide, time);
    });
    EventBus.on('track:mute',  ({ track, muted }) => { if (track === 'bass') this._muted = muted; });
    EventBus.on('human:change', ({ value })       => { this._humanAmount = value; });
    EventBus.on('fx:dist',      ({ amount })       => { this.setDistortion(amount); });
    EventBus.on('bass:rest',       ()                => { this._prevSlide = false; });
    EventBus.on('bass:stop',       ()                => {
      if (this.synth) { this.synth.triggerRelease(); this._prevSlide = false; }
    });
    EventBus.on('transport:stop',  ()                => {
      if (this.synth) { this.synth.triggerRelease(); this._prevSlide = false; }
    });
    // Sidechain: kick pumps the bass
    EventBus.on('drum:trigger', ({ track }) => {
      if (track === 'kick') this._sidechain();
    });
    // Tweaking live
    EventBus.on('bass:param', ({ cutoff, resonance, envMod, decay }) => {
      if (cutoff    !== undefined) this.setCutoff(cutoff);
      if (resonance !== undefined) this.setResonance(resonance);
      if (envMod    !== undefined) this.setEnvMod(envMod);
      if (decay     !== undefined) this.setDecay(decay);
    });

    EventBus.on('mixer:volume', ({ track, value }) => {
      if (track === 'bass') this.setVolume(value);
    });
  },

  setDistortion(amount) {
    if (!this._distNode) return;
    this._distNode.curve = this._makeDistCurve(Math.max(0, Math.min(1, amount)));
  },

  _makeDistCurve(amount) {
    const n = 256;
    const curve = new Float32Array(n);
    const k = amount * 180; // 0 = bypass, 180 = heavy saturation
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = k < 0.001 ? x : (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
    }
    return curve;
  },

  setVolume(value) {
    if (!this._gainOut || !this.ctx) return;
    this._gainOut.gain.setTargetAtTime(0.85 * Math.max(0, Math.min(1, value)), this.ctx.currentTime, 0.01);
  },

  init(audioCtx, masterGain) {
    if (!window.Tone) return;
    this.ctx = audioCtx;
    const T  = window.Tone;

    // ── MonoSynth 303 ────────────────────────────────────────────────────────
    this.synth = new T.MonoSynth({
      oscillator: { type: 'sawtooth' },
      envelope: {
        attack:  0.001,
        decay:   0.08,
        sustain: 0.55,
        release: 0.06,
      },
      filter: {
        type:    'lowpass',
        Q:       this.resonance,
        rolloff: -24,
      },
      filterEnvelope: {
        attack:        0.001,
        decay:         this.decay,
        sustain:       0.0,
        release:       0.05,
        baseFrequency: this.cutoff * 0.25, // closed at 150 Hz — avoids collision with the sub kick (38–72 Hz)
        octaves:       this.envMod,
      },
    });
    this.synth.portamento = 0;

    // ── Signal chain ─────────────────────────────────────────────────────────
    // MonoSynth → distNode → gainOut → sideGain → master
    this._distNode = audioCtx.createWaveShaper();
    this._distNode.curve = this._makeDistCurve(0);
    this._distNode.oversample = '2x';

    this._gainOut  = audioCtx.createGain();
    this._sideGain = audioCtx.createGain();
    this._gainOut.gain.value  = 0.85;
    this._sideGain.gain.value = 1.0;
    this._gainOut.connect(this._sideGain);
    this._sideGain.connect(masterGain);

    // Sends FX (reverb + delay)
    if (FXBus.reverbSend) {
      const rev = audioCtx.createGain();
      rev.gain.value = 0.12;
      this._gainOut.connect(rev);
      rev.connect(FXBus.reverbSend);
    }
    if (FXBus.delaySend) {
      const dl = audioCtx.createGain();
      dl.gain.value = 0.18;
      this._gainOut.connect(dl);
      dl.connect(FXBus.delaySend);
    }

    // HP at 45 Hz — cuts near-DC and frees headroom for the kick's sub
    const bassHP           = audioCtx.createBiquadFilter();
    bassHP.type            = 'highpass';
    bassHP.frequency.value = 45;
    bassHP.Q.value         = 0.5;

    this.synth.connect(this._distNode);
    this._distNode.connect(bassHP);
    bassHP.connect(this._gainOut);
  },

  _trigger(note, accent, slide, time) {
    const now = this.ctx?.currentTime ?? 0;
    let   t   = time ?? now;

    // HUMAN — timing jitter (±18 ms max)
    if (this._humanAmount > 0) {
      t += (Math.random() - 0.5) * 0.036 * this._humanAmount;
    }

    // Portamento: slide from the previous step
    this.synth.portamento = this._prevSlide ? 0.06 : 0;

    // Accent: filter opens wider + full velocity
    this.synth.filterEnvelope.octaves = accent ? this.envMod + 2.0 : this.envMod;

    const bpm = PatternStore.getBPM();
    const dur = (60 / bpm / 4) * (slide ? 1.05 : 0.72);

    // HUMAN — velocity jitter (±25% max)
    const baseVel = accent ? 1.0 : 0.62;
    const vel = Math.max(0.1, Math.min(1.0,
      baseVel + (Math.random() - 0.5) * 0.5 * this._humanAmount
    ));

    this.synth.triggerAttackRelease(note, dur, t, vel);
    this._prevSlide = slide;
  },

  // Sidechain: fast duck on kick, progressive release
  _sidechain() {
    if (!this._sideGain || !this.ctx) return;
    const g   = this._sideGain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.10, now + 0.010); // hard duck
    g.linearRampToValueAtTime(1.0,  now + 0.120); // recovery
  },

  // ── Live tweaking ──────────────────────────────────────────────────────────
  setCutoff(hz) {
    this.cutoff = hz;
    if (!this.synth) return;
    this.synth.filterEnvelope.baseFrequency = hz * 0.25;
  },
  setResonance(q) {
    this.resonance = q;
    if (this.synth) this.synth.filter.Q.value = q;
  },
  setEnvMod(oct) {
    this.envMod = oct;
    if (this.synth) this.synth.filterEnvelope.octaves = oct;
  },
  setDecay(secs) {
    this.decay = secs;
    if (this.synth) {
      this.synth.filterEnvelope.decay = secs;
      this.synth.envelope.decay       = Math.min(secs * 0.5, 0.15);
    }
  },
};

export default BassEngine;
