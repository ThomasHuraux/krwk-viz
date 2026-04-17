import EventBus    from '../EventBus.js';
import PatternStore from './PatternStore.js';

// Shared note-building — same logic as SynthEngine
const SEMITONES   = { C:0,D:2,E:4,F:5,G:7,A:9,B:11,'C#':1,'D#':3,'F#':6,'G#':8,'A#':10,Db:1,Eb:3,Gb:6,Ab:8,Bb:10 };
const SHARP_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const VOICINGS    = { maj:[0,4,7], min:[0,3,7], '7':[0,4,7,10], maj7:[0,4,7,11], sus2:[0,2,7] };

function buildNotes(root, quality) {
  const rootSemi = SEMITONES[root] ?? 0;
  const intervals = VOICINGS[quality] ?? VOICINGS.maj;
  // Two octaves: oct 3 ascending then oct 4 ascending
  return [
    ...intervals.map(i => {
      const total = rootSemi + i;
      return `${SHARP_NAMES[total % 12]}${3 + Math.floor(total / 12)}`;
    }),
    ...intervals.map(i => {
      const total = rootSemi + i + 12;
      return `${SHARP_NAMES[total % 12]}${3 + Math.floor(total / 12)}`;
    }),
  ];
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const Arpeggiator = {
  mode:         'off',
  speed:        2,
  _notes:       [],
  _index:       0,
  _dir:         1,
  _seed:        1234,
  _prng:        null,
  _humanAmount: 0,   // 0..1 — drives chaos injection

  listen() {
    EventBus.on('arp:mode',     ({ mode })  => { this.mode  = mode;  this._reset(); EventBus.emit('arp:active', { active: mode !== 'off' }); });
    EventBus.on('arp:speed',    ({ steps }) => { this.speed = steps; });
    EventBus.on('human:change', ({ value }) => { this._humanAmount = value; });

    EventBus.on('chord:change', ({ root, quality }) => {
      this._notes = buildNotes(root, quality);
      this._reset();
    });

    // chord:trigger gives the exact notes SynthEngine built
    EventBus.on('chord:trigger', ({ notes }) => {
      this._notes = notes;
      this._reset();
    });

    EventBus.on('seed:change', ({ seed }) => {
      this._seed = seed;
      this._prng = mulberry32(seed);
    });

    EventBus.on('transport:tick', ({ step, time }) => {
      if (this.mode === 'off') return;
      if (step % this.speed !== 0) return;
      this._fire(time);
    });

    EventBus.on('transport:stop', () => this._reset());
  },

  _reset() {
    this._index = 0;
    this._dir   = 1;
    this._prng  = mulberry32(this._seed);
  },

  _fire(time) {
    if (!this._notes.length) return;

    const h = this._humanAmount;

    // Human skip — silence this step entirely
    if (h > 0 && Math.random() < h * 0.28) return;

    const bpm         = PatternStore.getBPM();
    const stepDur     = 60 / bpm / 4;
    const noteDur     = stepDur * this.speed * 0.78;
    let   noteOrNotes = this._next();

    // Human random substitution — replace chosen note with a random chord tone
    if (h > 0 && !Array.isArray(noteOrNotes) && Math.random() < h * 0.20) {
      const r = this._prng ? this._prng() : Math.random();
      noteOrNotes = this._notes[Math.floor(r * this._notes.length)];
    }

    EventBus.emit('arp:note', {
      notes:    Array.isArray(noteOrNotes) ? noteOrNotes : [noteOrNotes],
      time,
      duration: noteDur,
    });
  },

  _next() {
    const n = this._notes.length;
    if (!n) return this._notes[0];

    switch (this.mode) {
      case 'pulse':
        // Full chord strike at arp rate
        return [...this._notes];

      case 'rise':
        return this._notes[this._index++ % n];

      case 'fall':
        return this._notes[(n - 1) - (this._index++ % n)];

      case 'bounce': {
        const note = this._notes[Math.max(0, Math.min(n - 1, this._index))];
        if (n > 1) {
          this._index += this._dir;
          if (this._index >= n) { this._index = n - 2; this._dir = -1; }
          if (this._index < 0)  { this._index = 1;     this._dir =  1; }
        }
        return note;
      }

      case 'scatter': {
        const r = this._prng ? this._prng() : Math.random();
        return this._notes[Math.floor(r * n)];
      }

      default:
        return this._notes[0];
    }
  },
};

export default Arpeggiator;
