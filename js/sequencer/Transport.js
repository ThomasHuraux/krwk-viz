import EventBus    from '../EventBus.js';
import AudioEngine  from '../audio/AudioEngine.js';
import PatternStore from './PatternStore.js';
import Humanizer    from './Humanizer.js';

const TRACKS = ['kick', 'snare', 'clap', 'hihat', 'hihat_open'];

const Transport = {
  isPlaying:    false,
  currentStep:  0,
  nextStepTime: 0,
  lookahead:    0.1,
  scheduleMs:   25,
  _timer:       null,

  start() {
    if (this.isPlaying) return;
    this.isPlaying    = true;
    this.currentStep  = 0;
    this.nextStepTime = AudioEngine.ctx.currentTime + 0.05;
    this._schedule();
    EventBus.emit('transport:start', {});
  },

  stop() {
    this.isPlaying = false;
    clearTimeout(this._timer);
    this._timer = null;
    EventBus.emit('transport:stop', { step: this.currentStep });
    this.currentStep = 0;
  },

  _schedule() {
    const ctx          = AudioEngine.ctx;
    const bpm          = PatternStore.getBPM();
    const stepDuration = 60 / bpm / 4; // 1/16th note

    while (this.nextStepTime < ctx.currentTime + this.lookahead) {
      this._triggerStep(this.currentStep, this.nextStepTime, stepDuration);

      // Advance to next step with swing compensation
      const nextStep = (this.currentStep + 1) % PatternStore.getSteps();

      // Swing: even→odd gap grows, odd→even gap shrinks (pair stays at 2×stepDuration)
      const swingDelta = Humanizer.swingAmount * stepDuration * 0.667;
      const gap = nextStep % 2 === 1
        ? stepDuration + swingDelta   // approaching an odd step — delay it
        : stepDuration - swingDelta;  // approaching an even step — pull it back

      this.nextStepTime += gap;
      this.currentStep   = nextStep;
    }

    if (this.isPlaying) {
      this._timer = setTimeout(() => this._schedule(), this.scheduleMs);
    }
  },

  _triggerStep(step, time, stepDuration) {
    // Apply queued pattern switch at cycle boundary
    if (step === 0) PatternStore.applyQueuedPattern();

    const pattern = PatternStore.getPattern();
    const steps   = PatternStore.getSteps();

    if (step >= steps) return;

    TRACKS.forEach(track => {
      if (pattern[track]?.[step]
          && !PatternStore.isMuted(track)
          && Humanizer.shouldPlay(track, step)) {
        AudioEngine.triggerDrum(track, time, step);
      }
    });

    EventBus.emit('transport:tick', { step, time, steps });
  }
};

export default Transport;
