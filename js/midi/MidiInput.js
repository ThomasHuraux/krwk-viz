import EventBus    from '../EventBus.js';
import SynthEngine from '../audio/SynthEngine.js';

const SHARP_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Octave 3→maj, 4→min, 5→7, 6→maj7 ; outside range: keep current quality
const OCTAVE_QUALITY = { 3: 'maj', 4: 'min', 5: '7', 6: 'maj7' };

function midiToNoteName(note) {
  return SHARP_NAMES[note % 12] + (Math.floor(note / 12) - 1);
}

const MidiInput = {
  _access:  null,
  _mode:    'chord',   // 'chord' | 'notes'

  async init() {
    if (!navigator.requestMIDIAccess) return false;
    try {
      this._access = await navigator.requestMIDIAccess({ sysex: false });
      this._bindPorts();
      this._access.onstatechange = () => this._bindPorts();
      return true;
    } catch {
      return false;
    }
  },

  _bindPorts() {
    for (const input of this._access.inputs.values()) {
      input.onmidimessage = e => this._onMessage(e);
    }
  },

  _onMessage(event) {
    const [status, note, velocity] = event.data;
    const type = status & 0xF0;
    if (type === 0x90 && velocity > 0) this._noteOn(note);
    else if (type === 0x80 || (type === 0x90 && velocity === 0)) this._noteOff(note);
  },

  _noteOn(note) {
    if (!SynthEngine.synth) return;

    if (this._mode === 'chord') {
      const root    = SHARP_NAMES[note % 12];
      const octave  = Math.floor(note / 12) - 1;
      const quality = OCTAVE_QUALITY[octave] ?? SynthEngine.quality;
      EventBus.emit('chord:change',  { root, quality });
      EventBus.emit('chord:preview', { root, quality });
    } else {
      SynthEngine.synth.triggerAttack(midiToNoteName(note));
    }
  },

  _noteOff(note) {
    if (this._mode !== 'notes' || !SynthEngine.synth) return;
    SynthEngine.synth.triggerRelease(midiToNoteName(note));
  },

  setMode(mode) {
    if (this._mode === mode) return;
    if (this._mode === 'notes' && SynthEngine.synth) SynthEngine.synth.releaseAll();
    this._mode = mode;
  },

  getMode()    { return this._mode; },
  getDevices() {
    if (!this._access) return [];
    return [...this._access.inputs.values()].map(i => ({ id: i.id, name: i.name }));
  },
};

export default MidiInput;
