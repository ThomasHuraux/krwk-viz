import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../js/EventBus.js', () => ({
  default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() }
}));

import Humanizer from '../js/sequencer/Humanizer.js';

describe('Humanizer', () => {
  beforeEach(() => {
    Humanizer.humanAmount = 0;
    Humanizer._seed = 1234;
    Humanizer._buildMatrix();
  });

  // ── shouldPlay basics ──────────────────────────────────────────────────────

  it('returns true for all tracks/steps when humanAmount = 0', () => {
    for (let step = 0; step < 16; step++) {
      expect(Humanizer.shouldPlay('hihat', step)).toBe(true);
      expect(Humanizer.shouldPlay('clap',  step)).toBe(true);
    }
  });

  it('kick is never affected regardless of humanAmount (sensitivity = 0)', () => {
    Humanizer.humanAmount = 1.0;
    for (let step = 0; step < 32; step++) {
      expect(Humanizer.shouldPlay('kick', step)).toBe(true);
    }
  });

  // ── The bug that was fixed ─────────────────────────────────────────────────

  it('shouldPlay(track) without step → always false when humanAmount > 0 (regression)', () => {
    Humanizer.humanAmount = 0.5;
    // matrix[track][undefined] → undefined ?? 0 = 0 > threshold → false
    // This caused ALL notes to be silenced. Never regress here.
    expect(Humanizer.shouldPlay('hihat')).toBe(false);
    expect(Humanizer.shouldPlay('snare')).toBe(false);
    expect(Humanizer.shouldPlay('clap')).toBe(false);
  });

  it('shouldPlay(track, step) with valid step is not always false', () => {
    Humanizer.humanAmount = 0.1; // low threshold — most steps should pass
    const results = Array.from({ length: 32 }, (_, i) => Humanizer.shouldPlay('hihat', i));
    expect(results.some(r => r === true)).toBe(true);
  });

  // ── Determinism ───────────────────────────────────────────────────────────

  it('same seed produces identical matrix', () => {
    Humanizer._seed = 777;
    Humanizer._buildMatrix();
    const snapshot = Humanizer._matrix.hihat.slice();

    Humanizer._buildMatrix(); // rebuild with same seed
    expect(Humanizer._matrix.hihat).toEqual(snapshot);
  });

  it('different seeds produce different matrices', () => {
    Humanizer._seed = 1;
    Humanizer._buildMatrix();
    const a = Humanizer._matrix.hihat.slice();

    Humanizer._seed = 2;
    Humanizer._buildMatrix();
    const b = Humanizer._matrix.hihat.slice();

    expect(a).not.toEqual(b);
  });

  // ── Probability at 100% human ─────────────────────────────────────────────

  it('at humanAmount=1, hihat misses most steps (threshold = 0.7)', () => {
    Humanizer.humanAmount = 1.0;
    // threshold = 1.0 * 1.0 * 0.7 = 0.7 → ~30% of values > 0.7 → ~30% play rate
    let plays = 0;
    for (let step = 0; step < 32; step++) {
      if (Humanizer.shouldPlay('hihat', step)) plays++;
    }
    expect(plays).toBeGreaterThan(0);   // some notes still play
    expect(plays).toBeLessThan(20);     // but less than 62% (well below full rate)
  });

  it('snare is less affected than hihat (lower sensitivity)', () => {
    Humanizer.humanAmount = 1.0;
    let hihatPlays = 0, snarePlays = 0;
    for (let step = 0; step < 32; step++) {
      if (Humanizer.shouldPlay('hihat', step)) hihatPlays++;
      if (Humanizer.shouldPlay('snare', step)) snarePlays++;
    }
    // snare sensitivity=0.2 → threshold=0.14 → ~86% play rate
    // hihat sensitivity=1.0 → threshold=0.70 → ~30% play rate
    expect(snarePlays).toBeGreaterThan(hihatPlays);
  });

  // ── Matrix structure ──────────────────────────────────────────────────────

  it('matrix covers all tracks defined in SENSITIVITY', () => {
    const tracks = ['kick', 'snare', 'clap', 'hihat', 'hihat_open'];
    tracks.forEach(t => {
      expect(Humanizer._matrix[t]).toBeDefined();
      expect(Humanizer._matrix[t]).toHaveLength(32);
    });
  });

  it('all matrix values are in [0, 1]', () => {
    Object.values(Humanizer._matrix).forEach(arr => {
      arr.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      });
    });
  });
});
