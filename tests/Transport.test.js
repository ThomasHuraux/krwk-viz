import { describe, it, expect, vi, beforeEach } from 'vitest';

// All mocks must be declared before imports
vi.mock('../js/EventBus.js', () => ({
  default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() }
}));

vi.mock('../js/audio/AudioEngine.js', () => ({
  default: { ctx: { currentTime: 0 }, triggerDrum: vi.fn() }
}));

vi.mock('../js/sequencer/PatternStore.js', () => ({
  default: {
    getBPM:               () => 128,
    getSteps:             () => 16,
    isMuted:              vi.fn(() => false),
    applyQueuedPattern:   vi.fn(),
    getPattern: () => ({
      kick:       [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      snare:      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      clap:       [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      hihat:      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      hihat_open: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    }),
  }
}));

vi.mock('../js/sequencer/Humanizer.js', () => ({
  default: {
    shouldPlay:  vi.fn(() => true),
    swingAmount: 0,
  }
}));

import Transport    from '../js/sequencer/Transport.js';
import Humanizer    from '../js/sequencer/Humanizer.js';
import AudioEngine  from '../js/audio/AudioEngine.js';
import PatternStore from '../js/sequencer/PatternStore.js';

describe('Transport._triggerStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── The regression test ───────────────────────────────────────────────────

  it('passes step to Humanizer.shouldPlay — not just track (regression)', () => {
    Transport._triggerStep(4, 0, 0.1);
    // At step 4: kick=1, hihat=1 active in mock pattern
    // shouldPlay must be called with BOTH track AND step
    expect(Humanizer.shouldPlay).toHaveBeenCalledWith('kick',  4);
    expect(Humanizer.shouldPlay).toHaveBeenCalledWith('hihat', 4);
  });

  it('never calls shouldPlay(track) without step', () => {
    Transport._triggerStep(0, 0, 0.1);
    // Every call to shouldPlay must have 2 arguments
    Humanizer.shouldPlay.mock.calls.forEach(([track, step]) => {
      expect(track).toBeDefined();
      expect(step).toBeDefined();
      expect(typeof step).toBe('number');
    });
  });

  // ── Active steps ─────────────────────────────────────────────────────────

  it('triggers active, unmuted tracks that pass shouldPlay', () => {
    Transport._triggerStep(0, 0.5, 0.1);
    // step 0: kick=1, hihat=1
    expect(AudioEngine.triggerDrum).toHaveBeenCalledWith('kick',  0.5);
    expect(AudioEngine.triggerDrum).toHaveBeenCalledWith('hihat', 0.5);
  });

  it('does not trigger inactive steps', () => {
    Transport._triggerStep(1, 0, 0.1); // step 1: all tracks = 0
    expect(AudioEngine.triggerDrum).not.toHaveBeenCalled();
  });

  it('does not trigger muted tracks', () => {
    PatternStore.isMuted.mockReturnValue(true);
    Transport._triggerStep(0, 0, 0.1);
    expect(AudioEngine.triggerDrum).not.toHaveBeenCalled();
  });

  it('does not trigger when Humanizer.shouldPlay returns false', () => {
    Humanizer.shouldPlay.mockReturnValue(false);
    Transport._triggerStep(0, 0, 0.1);
    expect(AudioEngine.triggerDrum).not.toHaveBeenCalled();
  });

  // ── Pattern switch at step 0 ──────────────────────────────────────────────

  it('calls applyQueuedPattern at step 0', () => {
    Transport._triggerStep(0, 0, 0.1);
    expect(PatternStore.applyQueuedPattern).toHaveBeenCalledOnce();
  });

  it('does not call applyQueuedPattern at steps > 0', () => {
    Transport._triggerStep(1, 0, 0.1);
    Transport._triggerStep(8, 0, 0.1);
    expect(PatternStore.applyQueuedPattern).not.toHaveBeenCalled();
  });

  // ── Step bounds ───────────────────────────────────────────────────────────

  it('skips steps beyond current pattern length', () => {
    Transport._triggerStep(16, 0, 0.1); // getSteps() = 16, so step 16 is out
    expect(AudioEngine.triggerDrum).not.toHaveBeenCalled();
  });
});
