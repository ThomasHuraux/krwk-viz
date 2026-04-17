import EventBus from '../EventBus.js';

const TRACKS = ['kick', 'snare', 'clap', 'hihat', 'hihat_open'];

const emptyTracks = (steps = 16) =>
  Object.fromEntries(TRACKS.map(t => [t, new Array(steps).fill(0)]));

const defaultTracks = () => ({
  kick:       [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
  snare:      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
  clap:       [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,1],
  hihat:      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  hihat_open: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
});

const PatternStore = {
  _bpm:           128,
  activePattern:  'A',
  nextPattern:    null,   // queued — applies at next cycle start (step 0)

  patterns: {
    A: { steps: 16, tracks: defaultTracks() },
    B: { steps: 16, tracks: emptyTracks()   },
    C: { steps: 16, tracks: emptyTracks()   },
    D: { steps: 16, tracks: emptyTracks()   },
  },

  muted: { ...Object.fromEntries(TRACKS.map(t => [t, false])), bass: false, synth: false },

  // ── Current pattern accessors ──
  get current()  { return this.patterns[this.activePattern]; },
  getPattern()   { return this.current.tracks; },
  getSteps()     { return this.current.steps; },
  getBPM()       { return this._bpm; },

  isActive(track, step) { return this.current.tracks[track]?.[step] === 1; },
  isMuted(track)        { return this.muted[track] === true; },

  // ── Step editing ──
  toggleStep(track, step) {
    this.current.tracks[track][step] ^= 1;
    EventBus.emit('pattern:update', { track, step, value: this.current.tracks[track][step] });
  },

  toggleMute(track) {
    this.muted[track] = !this.muted[track];
    EventBus.emit('track:mute', { track, muted: this.muted[track] });
  },

  // ── BPM ──
  setBPM(bpm) {
    this._bpm = Math.max(60, Math.min(200, bpm));
    EventBus.emit('transport:bpm', { bpm: this._bpm });
  },

  // ── Pattern management ──
  // Queue a switch — takes effect at next step 0
  queuePattern(id) {
    if (!this.patterns[id]) return;
    this.nextPattern = id;
    EventBus.emit('pattern:queued', { id });
  },

  // Called by Transport at step 0
  applyQueuedPattern() {
    if (!this.nextPattern) return;
    this.activePattern = this.nextPattern;
    this.nextPattern   = null;
    EventBus.emit('pattern:changed', { id: this.activePattern });
  },

  setPatternSteps(id, steps) {
    if (!this.patterns[id]) return;
    const old = this.patterns[id].steps;
    this.patterns[id].steps = steps;
    TRACKS.forEach(t => {
      const arr = this.patterns[id].tracks[t];
      this.patterns[id].tracks[t] = steps > old
        ? [...arr, ...new Array(steps - old).fill(0)]
        : arr.slice(0, steps);
    });
    EventBus.emit('pattern:length', { id, steps });
  },

  // ── Reset / Load ──
  reset() {
    this.patterns.A.tracks = defaultTracks();
    this.patterns.A.steps  = 16;
    ['B','C','D'].forEach(id => {
      this.patterns[id].tracks = emptyTracks();
      this.patterns[id].steps  = 16;
    });
    this.activePattern = 'A';
    this.nextPattern   = null;
    this.muted         = Object.fromEntries(TRACKS.map(t => [t, false]));
    EventBus.emit('pattern:reset', {});
  },

  loadPreset(preset) {
    const p = this.patterns[this.activePattern];
    p.tracks = {
      kick:       [...preset.tracks.kick],
      snare:      [...preset.tracks.snare],
      clap:       [...preset.tracks.clap],
      hihat:      [...preset.tracks.hihat],
      hihat_open: [...(preset.tracks.hihat_open ?? new Array(p.steps).fill(0))],
    };
    EventBus.emit('pattern:reset', {});
    EventBus.emit('preset:load', { id: preset.id });
  }
};

export default PatternStore;
