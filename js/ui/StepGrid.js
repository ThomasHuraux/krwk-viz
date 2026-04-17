import PatternStore from '../sequencer/PatternStore.js';
import EventBus     from '../EventBus.js';
import Geometry, { TRACK_ORDER, RING_RATIO } from '../layout/Geometry.js';

const LABELS = { kick: 'KICK', snare: 'SNARE', clap: 'CLAP', hihat: 'CH', hihat_open: 'OH' };
const MAX_STEPS = 32; // maximum buttons rendered per track

const StepGrid = {
  container: null,
  buttons:   {},
  labels:    {},

  init(container) {
    this.container = container;
    this._render();
    this._syncRange();

    window.addEventListener('resize', () => {
      Geometry.update();
      this._reposition();
    });

    EventBus.on('pattern:update', ({ track, step, value }) => {
      this.buttons[`${track}-${step}`]?.classList.toggle('active', value === 1);
    });

    EventBus.on('pattern:reset',   () => { this._reposition(); this._syncAllButtons(); this._syncRange(); });
    EventBus.on('pattern:changed', () => { this._reposition(); this._syncAllButtons(); this._syncRange(); });
    EventBus.on('pattern:length',  () => { this._reposition(); this._syncRange(); });

    EventBus.on('track:mute', ({ track, muted }) => this._applyMute(track, muted));

    EventBus.on('ui:step', ({ step }) => this._highlightStep(step));
    EventBus.on('transport:stop', () => this._clearHighlights());
  },

  _render() {
    this.container.innerHTML = '';
    this.buttons = {};
    this.labels  = {};

    TRACK_ORDER.forEach(track => {
      for (let step = 0; step < MAX_STEPS; step++) {
        const btn = document.createElement('button');
        btn.className     = 'step-btn';
        btn.dataset.track = track;
        btn.dataset.step  = step;
        btn.setAttribute('aria-label', `${track} step ${step + 1}`);

        if (PatternStore.isActive(track, step)) btn.classList.add('active');

        const pos      = this._polar(track, step);
        btn.style.left = `${pos.x}px`;
        btn.style.top  = `${pos.y}px`;

        btn.addEventListener('click', () => PatternStore.toggleStep(track, step));

        this.buttons[`${track}-${step}`] = btn;
        this.container.appendChild(btn);
      }

      // Track label at 9 o'clock — display only
      const label = document.createElement('span');
      label.className     = 'track-label';
      label.textContent   = LABELS[track];
      label.dataset.track = track;

      const r  = Geometry.bonesRadii[track];
      const lx = Geometry.bonesCX + (r + 20) * Math.cos(Math.PI);
      const ly = Geometry.pivotY  + (r +  2) * Math.sin(Math.PI);
      label.style.left = `${lx}px`;
      label.style.top  = `${ly}px`;

      this.labels[track] = label;
      this.container.appendChild(label);
    });
  },

  _polar(track, step) {
    const r     = Geometry.bonesRadii[track];
    const steps = PatternStore.getSteps();
    const angle = -Math.PI / 2 + (step / steps) * Math.PI * 2;
    return {
      x: Geometry.bonesCX + r * Math.cos(angle),
      y: Geometry.pivotY  + r * Math.sin(angle),
    };
  },

  _reposition() {
    TRACK_ORDER.forEach(track => {
      for (let step = 0; step < MAX_STEPS; step++) {
        const btn = this.buttons[`${track}-${step}`];
        if (!btn) continue;
        const pos      = this._polar(track, step);
        btn.style.left = `${pos.x}px`;
        btn.style.top  = `${pos.y}px`;
      }
      const label = this.labels[track];
      if (label) {
        const r      = Geometry.bonesRadii[track];
        label.style.left = `${Geometry.bonesCX + (r + 20) * Math.cos(Math.PI)}px`;
        label.style.top  = `${Geometry.pivotY  + (r +  2) * Math.sin(Math.PI)}px`;
      }
    });
  },

  _syncAllButtons() {
    TRACK_ORDER.forEach(track => {
      for (let step = 0; step < MAX_STEPS; step++) {
        this.buttons[`${track}-${step}`]?.classList.toggle(
          'active', PatternStore.isActive(track, step)
        );
      }
      this._applyMute(track, PatternStore.isMuted(track));
    });
  },

  // Dim buttons beyond current pattern length
  _syncRange() {
    const activeSteps = PatternStore.getSteps();
    TRACK_ORDER.forEach(track => {
      for (let step = 0; step < MAX_STEPS; step++) {
        this.buttons[`${track}-${step}`]
          ?.classList.toggle('out-of-range', step >= activeSteps);
      }
    });
  },

  _applyMute(track, muted) {
    this.labels[track]?.classList.toggle('muted', muted);
    for (let s = 0; s < MAX_STEPS; s++) {
      this.buttons[`${track}-${s}`]?.classList.toggle('track-muted', muted);
    }
  },

  _highlightStep(step) {
    this._clearHighlights();
    TRACK_ORDER.forEach(track => {
      this.buttons[`${track}-${step}`]?.classList.add('playing');
    });
  },

  _clearHighlights() {
    TRACK_ORDER.forEach(track => {
      for (let s = 0; s < MAX_STEPS; s++) {
        this.buttons[`${track}-${s}`]?.classList.remove('playing');
      }
    });
  }
};

export default StepGrid;
