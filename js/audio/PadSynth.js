// V2 — PadSynth scaffold
// Polyphonic FM synthesizer for chord layers and pads.
// Implementation pending Tone.js integration in V2.
//
// Expected usage:
//   const pad = new PadSynth(audioCtx, masterGain);
//   pad.trigger('C3', audioCtx.currentTime, '8n');

export default class PadSynth {
  constructor(audioCtx, destination) {
    this.audioCtx    = audioCtx;
    this.destination = destination;
    // V2: this.synth  = new Tone.PolySynth(Tone.FMSynth);
    // V2: this.filter = new Tone.Filter(800, 'lowpass');
    // V2: this.lfo    = new Tone.LFO('4n', 200, 1200);
    // V2: this.synth.chain(this.filter, destination);
  }

  trigger(note, time, duration) {
    // V2: this.synth.triggerAttackRelease(note, duration, time);
    void note; void time; void duration;
  }
}
