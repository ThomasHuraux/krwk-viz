import EventBus from '../EventBus.js';

// Per-track send amounts — hardcoded TR-909 style
// Kick stays dry (reverb muddies sub-bass), clap + OH get the most space
const REVERB_SEND = { kick: 0.0, snare: 0.28, clap: 0.60, hihat: 0.12, hihat_open: 0.42 };
const DELAY_SEND  = { kick: 0.0, snare: 0.15, clap: 0.45, hihat: 0.55, hihat_open: 0.40 };

const FXBus = {
  ctx:          null,
  reverbSend:   null,
  delaySend:    null,

  _reverbReturn:  null,
  _delayNode:     null,
  _delayFeedback: null,
  _delayReturn:   null,
  _sidechainGain: null,

  // Stored values — updated immediately on slider move, applied on init or on change
  reverbMix:    0,
  delayMix:     0,
  sidechainAmt: 0,
  delayBeats:   0.5,
  _bpm:         128,

  // Called once at boot — stores values even before AudioContext exists
  listen() {
    EventBus.on('fx:reverb', ({ mix }) => {
      this.reverbMix = mix;
      if (this._reverbReturn) this._reverbReturn.gain.setTargetAtTime(mix, this.ctx.currentTime, 0.02);
    });

    EventBus.on('fx:delay', ({ mix }) => {
      this.delayMix = mix;
      if (this._delayReturn) this._delayReturn.gain.setTargetAtTime(mix, this.ctx.currentTime, 0.02);
    });

    EventBus.on('fx:delay-time', ({ beats }) => {
      this.delayBeats = beats;
      if (this._delayNode) this._updateDelayTime();
    });

    EventBus.on('fx:sidechain', ({ amount }) => {
      this.sidechainAmt = amount;
    });

    EventBus.on('transport:bpm', ({ bpm }) => {
      this._bpm = bpm;
      if (this._delayNode) this._updateDelayTime();
    });

    EventBus.on('drum:trigger', ({ track, time }) => {
      if (track === 'kick' && this.sidechainAmt > 0 && this._sidechainGain) {
        this._duck(time);
      }
    });
  },

  // Called when AudioContext is ready — builds audio graph and applies stored values
  init(ctx, masterGain, bpm) {
    this.ctx  = ctx;
    this._bpm = bpm;

    // ── Sidechain duck ──
    this._sidechainGain = ctx.createGain();
    this._sidechainGain.gain.value = 1.0;
    this._sidechainGain.connect(masterGain);

    // ── Reverb ──
    this.reverbSend          = ctx.createGain();
    const convolver          = ctx.createConvolver();
    convolver.buffer         = this._buildIR(ctx, 1.8);
    this._reverbReturn       = ctx.createGain();
    this._reverbReturn.gain.value = this.reverbMix; // apply stored value

    this.reverbSend.connect(convolver);
    convolver.connect(this._reverbReturn);
    this._reverbReturn.connect(this._sidechainGain);

    // ── Delay ──
    this.delaySend               = ctx.createGain();
    this._delayNode              = ctx.createDelay(2.0);
    this._delayNode.delayTime.value = this._beatsToSeconds(this.delayBeats, bpm);
    this._delayFeedback          = ctx.createGain();
    this._delayFeedback.gain.value = 0.35;
    this._delayReturn            = ctx.createGain();
    this._delayReturn.gain.value = this.delayMix; // apply stored value

    // LP in feedback loop — natural decay of repeats (no HF buildup)
    this._feedbackLP           = ctx.createBiquadFilter();
    this._feedbackLP.type      = 'lowpass';
    this._feedbackLP.frequency.value = 7000;

    this.delaySend.connect(this._delayNode);
    this._delayNode.connect(this._feedbackLP);
    this._feedbackLP.connect(this._delayFeedback);
    this._delayFeedback.connect(this._delayNode);
    this._delayNode.connect(this._delayReturn);
    this._delayReturn.connect(this._sidechainGain);
  },

  // Called by DrumSynth on each trigger
  getSends(track) {
    const rv = this.ctx.createGain();
    const dl = this.ctx.createGain();
    rv.gain.value = REVERB_SEND[track] ?? 0;
    dl.gain.value = DELAY_SEND[track]  ?? 0;

    if (track === 'clap' && rv.gain.value > 0) {
      // 35 ms pre-delay before reverb — separates attack from tail, more perceived punch
      const preDelay = this.ctx.createDelay(0.1);
      preDelay.delayTime.value = 0.035;
      rv.connect(preDelay);
      preDelay.connect(this.reverbSend);
    } else {
      rv.connect(this.reverbSend);
    }

    dl.connect(this.delaySend);
    return { reverb: rv, delay: dl };
  },

  _updateDelayTime() {
    const t = this._beatsToSeconds(this.delayBeats, this._bpm);
    this._delayNode.delayTime.setTargetAtTime(t, this.ctx.currentTime, 0.01);
  },

  _duck(time) {
    const g     = this._sidechainGain.gain;
    const floor = 1 - this.sidechainAmt * 0.88;
    g.cancelScheduledValues(time);
    g.setValueAtTime(floor, time);
    g.setTargetAtTime(1.0, time + 0.008, 0.09);
  },

  _beatsToSeconds(beats, bpm) {
    return (60 / bpm) * beats;
  },

  _buildIR(ctx, decaySeconds) {
    const rate   = ctx.sampleRate;
    const length = Math.floor(rate * decaySeconds);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 1.5);
      }
    }
    return buffer;
  }
};

export default FXBus;
