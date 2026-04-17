import Presets      from '../sequencer/Presets.js';
import PatternStore from '../sequencer/PatternStore.js';
import EventBus     from '../EventBus.js';

const PresetSelector = {
  container:   null,
  activeId:    null,
  buttons:     {},

  init(container) {
    this.container = container;

    Presets.forEach(preset => {
      const btn = document.createElement('button');
      btn.className     = 'preset-btn';
      btn.textContent   = preset.name;
      btn.dataset.id    = preset.id;

      btn.addEventListener('click', () => this._load(preset));

      this.buttons[preset.id] = btn;
      container.appendChild(btn);
    });

    // Reflect active preset on external pattern:reset (e.g. manual reset clears it)
    EventBus.on('preset:load', ({ id }) => {
      this._setActive(id);
    });
  },

  _load(preset) {
    PatternStore.loadPreset(preset);
  },

  _setActive(id) {
    Object.values(this.buttons).forEach(b => b.classList.remove('active'));
    if (this.buttons[id]) this.buttons[id].classList.add('active');
    this.activeId = id;
  }
};

export default PresetSelector;
