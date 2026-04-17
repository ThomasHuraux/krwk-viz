import EventBus    from '../EventBus.js';
import Geometry    from '../layout/Geometry.js';
import PatternStore from '../sequencer/PatternStore.js';
import { euclidean } from '../sequencer/Euclidean.js';
import { TRACK_ORDER } from '../layout/Geometry.js';

const LABELS = { kick:'KICK', snare:'SNR', clap:'CLAP', hihat:'CH', hihat_open:'OH' };

// Track state: k (hits) and offset per track
const state = {};
TRACK_ORDER.forEach(t => { state[t] = { k: 0, offset: 0 }; });

// Sync state.k from current pattern
function syncFromPattern() {
  const steps = PatternStore.getSteps();
  TRACK_ORDER.forEach(t => {
    const arr = PatternStore.getPattern()[t] ?? [];
    state[t].k      = arr.filter(v => v === 1).length;
    state[t].offset = 0;
  });
}

// Apply euclidean pattern for one track
function applyTrack(track) {
  const steps  = PatternStore.getSteps();
  const { k, offset } = state[track];
  const pattern = euclidean(steps, k, offset);
  const current = PatternStore.getPattern()[track];
  pattern.forEach((v, i) => {
    if (current[i] !== v) PatternStore.toggleStep(track, i);
  });
}

const EuclideanPanel = {
  _container: null,
  _rows: {},   // track → { kVal, offVal }

  init(container) {
    this._container = container;
    syncFromPattern();

    const rows = TRACK_ORDER.map(t => `
      <div class="euc-row" data-track="${t}">
        <span class="euc-track">${LABELS[t]}</span>
        <span class="euc-section-label">K</span>
        <button class="euc-btn" data-track="${t}" data-action="k-">−</button>
        <span class="euc-val" id="euc-k-${t}">${state[t].k}</span>
        <button class="euc-btn" data-track="${t}" data-action="k+">+</button>
        <span class="euc-section-label">ROT</span>
        <button class="euc-btn" data-track="${t}" data-action="off-">−</button>
        <span class="euc-val" id="euc-off-${t}">${state[t].offset}</span>
        <button class="euc-btn" data-track="${t}" data-action="off+">+</button>
      </div>`).join('');

    container.innerHTML = `
      <div id="euc-panel">
        <div class="euc-header">
          <span class="euc-title">EUCLID</span>
          <button class="euc-sync-btn" id="euc-sync">SYNC</button>
        </div>
        ${rows}
      </div>`;

    // Bind SYNC button
    container.querySelector('#euc-sync').addEventListener('click', () => {
      syncFromPattern();
      this._refresh();
    });

    // Bind +/− buttons
    container.querySelectorAll('.euc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const track  = btn.dataset.track;
        const action = btn.dataset.action;
        const steps  = PatternStore.getSteps();
        const s = state[track];

        if      (action === 'k-')   s.k      = Math.max(0,       s.k - 1);
        else if (action === 'k+')   s.k      = Math.min(steps,    s.k + 1);
        else if (action === 'off-') s.offset = ((s.offset - 1) + steps) % steps;
        else if (action === 'off+') s.offset = (s.offset + 1) % steps;

        this._refreshTrack(track);
        applyTrack(track);
      });
    });

    // Re-sync k values when pattern changes externally
    EventBus.on('pattern:changed', () => { syncFromPattern(); this._refresh(); });
    EventBus.on('pattern:reset',   () => { syncFromPattern(); this._refresh(); });

    this._reposition();
    window.addEventListener('resize', () => { Geometry.update(); this._reposition(); });
  },

  _refreshTrack(track) {
    const kEl  = this._container.querySelector(`#euc-k-${track}`);
    const oEl  = this._container.querySelector(`#euc-off-${track}`);
    if (kEl)  kEl.textContent  = state[track].k;
    if (oEl)  oEl.textContent  = state[track].offset;
  },

  _refresh() {
    TRACK_ORDER.forEach(t => this._refreshTrack(t));
  },

  _reposition() {
    const el = this._container.querySelector('#euc-panel');
    if (!el) return;
    const outerR = Geometry.bonesRadii?.hihat_open ?? 0;
    const cx = Geometry.bonesCX;
    const y  = Geometry.pivotY + outerR + 16;
    el.style.left      = `${cx}px`;
    el.style.top       = `${y}px`;
    el.style.transform = 'translateX(-50%)';
  },
};

export default EuclideanPanel;
