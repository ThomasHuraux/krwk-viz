import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../js/EventBus.js', () => ({
  default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() }
}));

import PatternStore from '../js/sequencer/PatternStore.js';

describe('PatternStore', () => {
  beforeEach(() => {
    PatternStore.reset();
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  it('starts on pattern A with 16 steps', () => {
    expect(PatternStore.activePattern).toBe('A');
    expect(PatternStore.getSteps()).toBe(16);
  });

  it('default pattern has kick on every beat (steps 0,4,8,12)', () => {
    [0, 4, 8, 12].forEach(step => {
      expect(PatternStore.isActive('kick', step)).toBe(true);
    });
  });

  it('default pattern has no kick on off-beats', () => {
    [1, 2, 3, 5, 6, 7].forEach(step => {
      expect(PatternStore.isActive('kick', step)).toBe(false);
    });
  });

  // ── Step editing ──────────────────────────────────────────────────────────

  it('toggleStep activates an inactive step', () => {
    expect(PatternStore.isActive('snare', 3)).toBe(false);
    PatternStore.toggleStep('snare', 3);
    expect(PatternStore.isActive('snare', 3)).toBe(true);
  });

  it('toggleStep deactivates an active step', () => {
    PatternStore.toggleStep('snare', 3);
    PatternStore.toggleStep('snare', 3);
    expect(PatternStore.isActive('snare', 3)).toBe(false);
  });

  it('toggleStep uses XOR — no drift after many toggles', () => {
    for (let i = 0; i < 100; i++) PatternStore.toggleStep('clap', 5);
    expect(PatternStore.isActive('clap', 5)).toBe(false); // even number of toggles
  });

  // ── Step count ────────────────────────────────────────────────────────────

  it('setPatternSteps expands arrays and fills with 0', () => {
    PatternStore.setPatternSteps('A', 32);
    expect(PatternStore.getSteps()).toBe(32);
    for (let step = 16; step < 32; step++) {
      expect(PatternStore.isActive('kick', step)).toBe(false);
    }
  });

  it('setPatternSteps truncates arrays', () => {
    PatternStore.setPatternSteps('A', 8);
    expect(PatternStore.getSteps()).toBe(8);
    // Steps 8-15 no longer accessible via getPattern
    expect(PatternStore.getPattern().kick).toHaveLength(8);
  });

  it('setPatternSteps preserves existing active steps', () => {
    expect(PatternStore.isActive('kick', 0)).toBe(true);
    PatternStore.setPatternSteps('A', 32);
    expect(PatternStore.isActive('kick', 0)).toBe(true);
  });

  // ── Pattern switching ─────────────────────────────────────────────────────

  it('queuePattern does not switch immediately', () => {
    PatternStore.queuePattern('B');
    expect(PatternStore.activePattern).toBe('A');
  });

  it('applyQueuedPattern switches to queued pattern', () => {
    PatternStore.queuePattern('C');
    PatternStore.applyQueuedPattern();
    expect(PatternStore.activePattern).toBe('C');
  });

  it('applyQueuedPattern clears the queue', () => {
    PatternStore.queuePattern('B');
    PatternStore.applyQueuedPattern();
    PatternStore.applyQueuedPattern(); // second call should be no-op
    expect(PatternStore.activePattern).toBe('B');
  });

  it('queuePattern ignores invalid pattern IDs', () => {
    PatternStore.queuePattern('Z');
    PatternStore.applyQueuedPattern();
    expect(PatternStore.activePattern).toBe('A'); // unchanged
  });

  // ── Mute ─────────────────────────────────────────────────────────────────

  it('toggleMute mutes a track', () => {
    expect(PatternStore.isMuted('kick')).toBe(false);
    PatternStore.toggleMute('kick');
    expect(PatternStore.isMuted('kick')).toBe(true);
  });

  it('toggleMute unmutes a muted track', () => {
    PatternStore.toggleMute('kick');
    PatternStore.toggleMute('kick');
    expect(PatternStore.isMuted('kick')).toBe(false);
  });

  it('mute state is track-independent', () => {
    PatternStore.toggleMute('kick');
    expect(PatternStore.isMuted('snare')).toBe(false);
  });

  // ── BPM ──────────────────────────────────────────────────────────────────

  it('setBPM stores the value', () => {
    PatternStore.setBPM(140);
    expect(PatternStore.getBPM()).toBe(140);
  });

  it('setBPM clamps to max 200', () => {
    PatternStore.setBPM(999);
    expect(PatternStore.getBPM()).toBe(200);
  });

  it('setBPM clamps to min 60', () => {
    PatternStore.setBPM(10);
    expect(PatternStore.getBPM()).toBe(60);
  });

  // ── Reset ─────────────────────────────────────────────────────────────────

  it('reset sets activePattern back to A', () => {
    PatternStore.queuePattern('C');
    PatternStore.applyQueuedPattern();
    expect(PatternStore.activePattern).toBe('C');
    PatternStore.reset();
    expect(PatternStore.activePattern).toBe('A');
  });

  it('reset restores default kick pattern', () => {
    PatternStore.toggleStep('kick', 0);
    PatternStore.reset();
    expect(PatternStore.isActive('kick', 0)).toBe(true);
  });

  it('reset clears mutes', () => {
    PatternStore.toggleMute('snare');
    PatternStore.reset();
    expect(PatternStore.isMuted('snare')).toBe(false);
  });

  it('reset restores 16-step length on pattern A', () => {
    PatternStore.setPatternSteps('A', 32);
    PatternStore.reset();
    expect(PatternStore.getSteps()).toBe(16);
  });
});
