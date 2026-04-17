import PatternStore from '../sequencer/PatternStore.js';
import EventBus     from '../EventBus.js';
import Presets      from '../sequencer/Presets.js';

const PATTERN_IDS = ['A', 'B', 'C', 'D'];

const PatternSelector = {
  container: null,
  buttons:   {},

  init(container) {
    this.container = container;

    PATTERN_IDS.forEach(id => {
      const btn = document.createElement('button');
      btn.className    = 'pattern-btn';
      btn.textContent  = id;
      btn.dataset.id   = id;
      if (id === 'A') btn.classList.add('active');

      btn.addEventListener('click', () => PatternStore.queuePattern(id));

      // Right-click: load the matching preset into this pattern slot
      btn.addEventListener('contextmenu', e => {
        e.preventDefault();
        const preset = Presets[PATTERN_IDS.indexOf(id)] ?? Presets[0];
        const prev   = PatternStore.activePattern;
        PatternStore.activePattern = id;
        PatternStore.loadPreset(preset);
        PatternStore.activePattern = prev;
      });

      this.buttons[id] = btn;
      container.appendChild(btn);
    });

    EventBus.on('pattern:changed', ({ id }) => this._setActive(id));
    EventBus.on('pattern:queued',  ({ id }) => this._setQueued(id));
  },

  _setActive(id) {
    Object.values(this.buttons).forEach(b => {
      b.classList.remove('active', 'queued');
    });
    this.buttons[id]?.classList.add('active');
  },

  _setQueued(id) {
    this.buttons[id]?.classList.add('queued');
  }
};

export default PatternSelector;
