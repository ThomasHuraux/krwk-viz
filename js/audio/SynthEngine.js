import EventBus     from '../EventBus.js';
import PatternStore  from '../sequencer/PatternStore.js';
import SynthPattern  from '../sequencer/SynthPattern.js';
import FXBus         from './FXBus.js';

const SEMITONES = {
  C:0, D:2, E:4, F:5, G:7, A:9, B:11,
  'C#':1, 'D#':3, 'F#':6, 'G#':8, 'A#':10,
  Db:1, Eb:3, Gb:6, Ab:8, Bb:10,
};
const SHARP_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

const VOICINGS = {
  maj:  [0, 4, 7],
  min:  [0, 3, 7],
  '7':  [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7],
};

// Available tensions by quality (intervals in semitones above the root)
const TENSION_POOL = {
  maj:  [11, 14, 21],       // maj7, 9th, 13th
  min:  [10, 14, 17],       // b7, 9th, 11th
  '7':  [10, 14, 21],       // dom7, 9th, 13th
  maj7: [11, 14, 18],       // maj7, 9th, #11th
  sus2: [2,  9, 14],        // 2nd, 6th, 9th
};

// Voicing spread over 3 octaves with a random tension note
function buildPadNotes(root, quality) {
  const rs  = SEMITONES[root] ?? 0;
  const ivs = VOICINGS[quality] ?? VOICINGS.maj;

  // note(interval, baseOct): note above root in the base octave
  const n = (interval, baseOct) => {
    const total = rs + interval;
    return `${SHARP_NAMES[total % 12]}${baseOct + Math.floor(total / 12)}`;
  };

  const fifth   = ivs.find(i => i >= 6 && i <= 8) ?? 7;
  const third   = ivs[1] ?? 4;
  const pool    = TENSION_POOL[quality] ?? TENSION_POOL.maj;
  // Deterministic tension: indexed on the root — stable, coherent, no surprises
  const tension = pool[rs % pool.length];

  const midOct = 3;

  const notes = [
    n(0,      2),       // low root
    n(fifth,  2),       // low fifth — open low register
    n(0,      midOct),  // mid root
    n(third,  midOct),  // third
    n(fifth,  midOct),  // fifth
    n(tension, midOct), // harmonic color note
  ];

  // Deduplicate (e.g. if tension = 0 = root)
  return [...new Set(notes)];
}

const SynthEngine = {
  synth:      null,
  ctx:        null,
  root:       'C',
  quality:    'maj',
  _arpActive: false,
  _prevNotes: [],   // notes currently held (for legato)
  _muted:       false,
  _humanAmount: 0,

  listen() {
    EventBus.on('chord:change', ({ root, quality }) => {
      this.root    = root;
      this.quality = quality;
    });

    EventBus.on('arp:active', ({ active }) => { this._arpActive = active; });

    // Arpeggiator — no releaseAll, just trigger the requested note
    EventBus.on('arp:note', ({ notes, time, duration }) => {
      if (!this.synth || this._muted) return;
      this.synth.triggerAttackRelease(notes, duration, time);
    });

    // Immediate preview on COF click — only when arp is OFF
    EventBus.on('chord:preview', ({ root, quality }) => {
      if (!this.synth || this._arpActive) return;
      const notes = buildPadNotes(root, quality);
      const bpm   = PatternStore.getBPM();
      const dur   = (60 / bpm / 4) * 4 * 0.90;
      this._playLegato(notes, null, dur);
    });

    // Synth pattern step
    EventBus.on('synth:step', ({ step, time, duration }) => {
      if (!this.synth || this._muted) return;
      this.root    = step.root;
      this.quality = step.quality;
      if (!this._arpActive) this._triggerChord(time, duration);
      EventBus.emit('chord:trigger', { root: step.root, quality: step.quality,
        notes: buildPadNotes(step.root, step.quality) });
    });

    // Fallback when no slot is filled
    EventBus.on('transport:tick', ({ step, time }) => {
      if (step === 0 && this.synth && !this._arpActive
          && SynthPattern.slots.every(sl => sl.root === null)) {
        this._triggerChord(time);
      }
    });

    EventBus.on('transport:stop', () => {
      if (this.synth) { this.synth.releaseAll(); this._prevNotes = []; }
    });

    EventBus.on('mixer:volume', ({ track, value }) => {
      if (track === 'synth') this.setVolume(value);
    });
    EventBus.on('human:change', ({ value }) => { this._humanAmount = value; });
    EventBus.on('track:mute', ({ track, muted }) => {
      if (track === 'synth') {
        this._muted = muted;
        if (muted && this.synth) { this.synth.releaseAll(); this._prevNotes = []; }
      }
    });
  },

  setVolume(value) {
    if (!this._gainOut) return;
    this._gainOut.gain.setTargetAtTime(0.30 * Math.max(0, Math.min(1, value)), this.ctx.currentTime, 0.01);
  },

  init(audioCtx, masterGain) {
    if (!window.Tone) return;
    this.ctx = audioCtx;
    const T  = window.Tone;

    // ── Oscillator: pure sawtooth ─────────────────────────────────────────
    // Rich in harmonics, stable, no detuning.
    // Envelope: sharp attack (20 ms), short decay (120 ms), high sustain.
    this.synth = new T.PolySynth(T.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope:   { attack: 0.02, decay: 0.12, sustain: 0.70, release: 1.2 },
    });

    // ── Moderately resonant low-pass filter ───────────────────────────────
    // Cutoff ~950 Hz — cuts harsh saw harmonics while keeping mid presence.
    // Q=2.8 → slight resonance, focused and nasal timbre.
    // No filter envelope: fixed frequency = maximum stability.
    this.filter = new T.Filter({ type: 'lowpass', frequency: 950, Q: 2.8, rolloff: -12 });

    // ── Output gain ────────────────────────────────────────────────────────
    this._gainOut = audioCtx.createGain();
    this._gainOut.gain.value = 0.30;
    this._gainOut.connect(masterGain);

    // Sends FX
    if (FXBus.reverbSend) {
      const rev = audioCtx.createGain();
      rev.gain.value = 0.45;
      this._gainOut.connect(rev);
      rev.connect(FXBus.reverbSend);
    }
    if (FXBus.delaySend) {
      const dl = audioCtx.createGain();
      dl.gain.value = 0.30;
      this._gainOut.connect(dl);
      dl.connect(FXBus.delaySend);
    }

    // Chain: PolySynth → Filter → GainOut → master
    this.synth.connect(this.filter);
    this.filter.connect(this._gainOut);
  },

  _triggerChord(time, stepDuration) {
    const notes = buildPadNotes(this.root, this.quality);
    const bpm   = PatternStore.getBPM();

    let dur;
    if (stepDuration) {
      const subSecs = 60 / bpm / 4;
      const subMap  = { '16n': 1, '8n': 2, '4n': 4, '2n': 8 };
      dur = subSecs * (subMap[stepDuration] ?? 2);
    } else {
      dur = (60 / bpm / 4) * PatternStore.getSteps();
    }

    this._playLegato(notes, time, dur);
    EventBus.emit('chord:trigger', { root: this.root, quality: this.quality, notes });
  },

  // Legato: attacks new notes, then releases old ones after a short overlap
  _playLegato(notes, time, dur) {
    const now = this.ctx?.currentTime ?? 0;
    const t   = time ?? now;
    const OVERLAP = 0.040;  // 40 ms — reduced overlap window (120 ms was too dense)

    // HUMAN — micro-detune between voices (±35 cents max)
    if (this._humanAmount > 0) {
      this.synth.set({ detune: (Math.random() - 0.5) * 70 * this._humanAmount });
    }

    // Subtle filter bloom on chord change
    // NO dip — filter starts from its current position (~950 Hz) and rises slightly.
    // Dip to 280 Hz = massive burst on a filter shared by 6-12 simultaneous voices → forbidden.
    if (this.filter?.frequency) {
      this.filter.frequency.cancelScheduledValues(t);
      this.filter.frequency.setValueAtTime(950, t);
      this.filter.frequency.linearRampToValueAtTime(1080, t + 0.020);
      this.filter.frequency.setTargetAtTime(950, t + 0.020, 0.35);
    }

    this.synth.triggerAttack(notes, t);

    // Release previous notes: 40 ms (120 ms was too much overlap — 12 simultaneous voices)
    if (this._prevNotes.length) {
      this.synth.triggerRelease(this._prevNotes, t + OVERLAP);
    }

    // Schedule release of new notes at end of step
    this.synth.triggerRelease(notes, t + dur);

    this._prevNotes = notes;
  },
};

export default SynthEngine;
