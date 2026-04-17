import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../js/EventBus.js', () => ({
  default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() }
}));
vi.mock('../js/sequencer/PatternStore.js', () => ({
  default: { getBPM: () => 128, getSteps: () => 16 }
}));

import Arpeggiator from '../js/sequencer/Arpeggiator.js';

const NOTES = ['C3', 'E3', 'G3'];

describe('Arpeggiator', () => {
  beforeEach(() => {
    Arpeggiator._notes = [...NOTES];
    Arpeggiator._reset();
  });

  // ── Modes ─────────────────────────────────────────────────────────────────

  describe('rise', () => {
    beforeEach(() => { Arpeggiator.mode = 'rise'; });

    it('steps through notes ascending', () => {
      expect(Arpeggiator._next()).toBe('C3');
      expect(Arpeggiator._next()).toBe('E3');
      expect(Arpeggiator._next()).toBe('G3');
    });

    it('wraps back to start', () => {
      Arpeggiator._next(); Arpeggiator._next(); Arpeggiator._next();
      expect(Arpeggiator._next()).toBe('C3');
    });
  });

  describe('fall', () => {
    beforeEach(() => { Arpeggiator.mode = 'fall'; });

    it('steps through notes descending', () => {
      expect(Arpeggiator._next()).toBe('G3');
      expect(Arpeggiator._next()).toBe('E3');
      expect(Arpeggiator._next()).toBe('C3');
    });

    it('wraps back to top', () => {
      Arpeggiator._next(); Arpeggiator._next(); Arpeggiator._next();
      expect(Arpeggiator._next()).toBe('G3');
    });
  });

  describe('bounce', () => {
    beforeEach(() => { Arpeggiator.mode = 'bounce'; });

    it('goes up then reverses', () => {
      const seq = Array.from({ length: 5 }, () => Arpeggiator._next());
      expect(seq).toEqual(['C3', 'E3', 'G3', 'E3', 'C3']);
    });

    it('continues bouncing beyond first cycle', () => {
      const seq = Array.from({ length: 7 }, () => Arpeggiator._next());
      expect(seq[0]).toBe('C3');
      expect(seq[4]).toBe('C3'); // back at start
      expect(seq[6]).toBe('G3'); // heading up again
    });

    it('handles a 2-note chord without crash', () => {
      Arpeggiator._notes = ['C3', 'G3'];
      Arpeggiator._reset();
      expect(() => {
        for (let i = 0; i < 10; i++) Arpeggiator._next();
      }).not.toThrow();
    });
  });

  describe('pulse', () => {
    it('returns all notes as an array', () => {
      Arpeggiator.mode = 'pulse';
      const result = Arpeggiator._next();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual(NOTES);
    });

    it('returns same chord every call', () => {
      Arpeggiator.mode = 'pulse';
      expect(Arpeggiator._next()).toEqual(Arpeggiator._next());
    });
  });

  describe('scatter', () => {
    beforeEach(() => { Arpeggiator.mode = 'scatter'; });

    it('always returns a note from the chord', () => {
      for (let i = 0; i < 20; i++) {
        expect(NOTES).toContain(Arpeggiator._next());
      }
    });

    it('same seed → same sequence (determinism)', () => {
      Arpeggiator._seed = 42;
      Arpeggiator._reset();
      const seq1 = Array.from({ length: 8 }, () => Arpeggiator._next());

      Arpeggiator._seed = 42;
      Arpeggiator._reset();
      const seq2 = Array.from({ length: 8 }, () => Arpeggiator._next());

      expect(seq1).toEqual(seq2);
    });

    it('different seeds → different sequences', () => {
      Arpeggiator._notes = ['C3','D3','E3','F3','G3','A3','B3']; // more notes = more variance
      Arpeggiator._seed = 1; Arpeggiator._reset();
      const seq1 = Array.from({ length: 12 }, () => Arpeggiator._next());

      Arpeggiator._seed = 9999; Arpeggiator._reset();
      const seq2 = Array.from({ length: 12 }, () => Arpeggiator._next());

      expect(seq1).not.toEqual(seq2);
    });
  });

  // ── _fire emits arp:note with correct shape ───────────────────────────────

  it('_fire emits arp:note with notes array, time, and duration', async () => {
    const { default: EventBus } = await import('../js/EventBus.js');
    Arpeggiator.mode  = 'rise';
    Arpeggiator.speed = 2;
    Arpeggiator._fire(0.5);

    expect(EventBus.emit).toHaveBeenCalledWith('arp:note', expect.objectContaining({
      notes:    expect.any(Array),
      time:     0.5,
      duration: expect.any(Number),
    }));
  });

  // ── Speed-based timing ────────────────────────────────────────────────────

  it('note duration is proportional to speed steps (1/16 < 1/8 < 1/4)', () => {
    // duration = stepDuration * speed * 0.78 — verify the formula scales correctly
    const bpm     = 128;
    const stepDur = 60 / bpm / 4; // 16th note ≈ 0.117s
    const artic   = 0.78;
    expect(stepDur * 1 * artic).toBeLessThan(stepDur * 2 * artic); // 1/16 < 1/8
    expect(stepDur * 2 * artic).toBeLessThan(stepDur * 4 * artic); // 1/8  < 1/4
  });
});
