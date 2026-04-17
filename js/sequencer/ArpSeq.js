import EventBus    from '../EventBus.js';
import PatternStore from './PatternStore.js';

const SEMITONES   = { C:0,D:2,E:4,F:5,G:7,A:9,B:11,'C#':1,'D#':3,'F#':6,'G#':8,'A#':10,Db:1,Eb:3,Gb:6,Ab:8,Bb:10 };
const SHARP_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const VOICINGS    = { maj:[0,4,7], min:[0,3,7], '7':[0,4,7,10], maj7:[0,4,7,11], sus2:[0,2,7] };

// ── Presets ────────────────────────────────────────────────────────────────
// steps : indices into the 2-octave pool (0–7, wrapped if pool is shorter)
// speed : 1 = 1/16, 2 = 1/8, 4 = 1/4 (in transport steps)
// Patterns: ascending, descending, bounce, alternating, octave jump, binary motif
export const ARP_PRESETS = [
  { id: 'OFF',  steps: [],                    label: 'OFF',   speed: 2 },
  { id: 'UP4',  steps: [0,1,2,3],             label: 'UP·4',  speed: 2 },
  { id: 'UP8',  steps: [0,1,2,3,4,5,6,7],     label: 'UP·8',  speed: 1 },
  { id: 'DN4',  steps: [3,2,1,0],             label: 'DN·4',  speed: 2 },
  { id: 'DN8',  steps: [7,6,5,4,3,2,1,0],     label: 'DN·8',  speed: 1 },
  { id: 'UD8',  steps: [0,1,2,3,3,2,1,0],     label: 'UD·8',  speed: 1 },
  { id: 'ALT8', steps: [0,3,1,4,2,5,1,3],     label: 'ALT·8', speed: 1 },
  { id: 'OCT4', steps: [0,3,0,3],             label: 'OCT·4', speed: 2 },
  { id: 'BIN8', steps: [0,2,0,2,0,2,4,2],     label: 'BIN·8', speed: 1 },
];

// Ascending pool over 2 octaves from the tonic
function buildPool(root, quality) {
  const rs  = SEMITONES[root] ?? 0;
  const ivs = VOICINGS[quality] ?? VOICINGS.maj;
  const pool = [];
  for (let o = 0; o < 2; o++) {
    for (const iv of ivs) {
      const s = rs + iv;
      pool.push(`${SHARP_NAMES[s % 12]}${3 + o + Math.floor(s / 12)}`);
    }
  }
  return pool;
}

const ArpSeq = {
  activePreset:   0,    // index in ARP_PRESETS (0 = OFF)
  pendingPreset:  -1,   // -1 = nothing queued
  stepIndex:      0,    // position in the active pattern
  _pool:          [],   // notes from the current chord
  speedOverride:  2,    // 1=1/16  2=1/8  4=1/4 — overrides preset speed
  gateRatio:      0.80, // note duration: fraction of the step

  get isActive() { return this.activePreset > 0; },

  listen() {
    EventBus.on('chord:change',  ({ root, quality }) => { this._pool = buildPool(root, quality); });
    EventBus.on('chord:trigger', ({ root, quality }) => { if (root) this._pool = buildPool(root, quality); });
    EventBus.on('arp:speed', ({ steps }) => { this.speedOverride = steps; });
    EventBus.on('arp:gate',  ({ ratio }) => { this.gateRatio     = ratio; });

    EventBus.on('transport:tick', ({ step, time }) => {
      // Preset switch at drum loop boundary (step=0)
      if (step === 0) {
        if (this.pendingPreset >= 0) {
          this.activePreset  = this.pendingPreset;
          this.pendingPreset = -1;
          this.stepIndex     = 0;
          EventBus.emit('arp:active', { active: this.isActive });
        }
        this.stepIndex = 0; // resync au cycle drum
      }
      this._tick(step, time);
    });

    EventBus.on('transport:stop', () => { this.stepIndex = 0; });
  },

  // Queue a preset — takes effect at next step=0
  queuePreset(index) {
    if (index < 0 || index >= ARP_PRESETS.length) return;
    this.pendingPreset = index;
    EventBus.emit('arp:pending', { index });
    // If OFF requested, emit arp:active immediately to mute the synth
    if (index === 0) EventBus.emit('arp:active', { active: false });
  },

  _tick(step, time) {
    const preset = ARP_PRESETS[this.activePreset];
    if (!preset?.steps.length || !this._pool.length) return;

    const speed = this.speedOverride || preset.speed || 2;
    if (step % speed !== 0) return;

    const noteIdx = preset.steps[this.stepIndex % preset.steps.length];
    const note    = this._pool[noteIdx % this._pool.length];

    if (note) {
      const bpm = PatternStore.getBPM();
      const dur = (60 / bpm / 4) * speed * this.gateRatio;
      EventBus.emit('arp:note', { notes: [note], time, duration: dur });
      EventBus.emit('arp:step', { stepIndex: this.stepIndex, preset: this.activePreset });
    }

    this.stepIndex = (this.stepIndex + 1) % preset.steps.length;
  },
};

export default ArpSeq;
