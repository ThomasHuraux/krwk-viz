import PatternStore from '../sequencer/PatternStore.js';
import EventBus     from '../EventBus.js';

const HumanColumn = {
  _seed: Math.floor(Math.random() * 9999),

  getSeed() { return this._seed; },

  init(container) {
    const bpm = PatternStore.getBPM();

    container.innerHTML = `
      <div class="hc-section">
        <div class="hc-label">BPM</div>
        <div class="hc-bpm-display" id="hc-bpm">${bpm}</div>
        <div class="hc-bpm-btns">
          <button class="hc-btn" id="hc-bpm-dn">−</button>
          <button class="hc-btn" id="hc-bpm-up">+</button>
        </div>
      </div>

      <div class="hc-divider"></div>

      <div class="hc-section hc-section-human">
        <div class="hc-label">HUMAN</div>
        <div class="hc-human-num" id="hc-human-num">0%</div>
        <input class="hc-slider hc-slider-human" id="hc-human" type="range" min="0" max="100" value="0" step="1">
        <div class="hc-human-tags">GROOVE · TIMING · CHAOS</div>
      </div>

      <div class="hc-divider"></div>

      <div class="hc-section">
        <div class="hc-label">SWING</div>
        <div class="hc-slider-row">
          <input class="hc-slider" id="hc-swing" type="range" min="0" max="100" value="14" step="1">
          <span class="hc-val" id="hc-swing-val">14%</span>
        </div>
      </div>

      <div class="hc-divider"></div>

      <div class="hc-section">
        <div class="hc-label">SEED</div>
        <div class="hc-seed-display" id="hc-seed">${String(this._seed).padStart(4,'0')}</div>
        <button class="hc-btn hc-btn-wide" id="hc-newseed">NEW ›</button>
      </div>
    `;

    this._bindBPM(container, bpm);

    const humanSlider = container.querySelector('#hc-human');
    const humanNum    = container.querySelector('#hc-human-num');
    humanSlider.addEventListener('input', () => {
      humanNum.textContent = `${humanSlider.value}%`;
      EventBus.emit('human:change', { value: parseInt(humanSlider.value, 10) / 100 });
    });

    this._bindSlider(container, 'hc-swing', 'hc-swing-val', v => EventBus.emit('swing:change', { value: v / 100 }));
    this._bindSeed(container);

    EventBus.on('transport:bpm', ({ bpm: v }) => {
      const el = container.querySelector('#hc-bpm');
      if (el) el.textContent = v;
    });
  },

  _bindBPM(container, initialBpm) {
    const display = container.querySelector('#hc-bpm');
    let bpm = initialBpm;

    const update = delta => {
      bpm = Math.max(60, Math.min(200, bpm + delta));
      PatternStore.setBPM(bpm);
      display.textContent = bpm;
    };

    container.querySelector('#hc-bpm-up').addEventListener('click', () => update(+1));
    container.querySelector('#hc-bpm-dn').addEventListener('click', () => update(-1));

    let holdTimer = null;
    ['#hc-bpm-up','#hc-bpm-dn'].forEach(sel => {
      const btn   = container.querySelector(sel);
      const delta = sel.includes('up') ? 1 : -1;
      btn.addEventListener('mousedown', () => {
        holdTimer = setInterval(() => update(delta), 80);
      });
      ['mouseup','mouseleave'].forEach(e =>
        btn.addEventListener(e, () => clearInterval(holdTimer))
      );
    });
  },

  _bindSlider(container, id, valId, onChange) {
    const slider  = container.querySelector(`#${id}`);
    const display = container.querySelector(`#${valId}`);
    slider.addEventListener('input', () => {
      display.textContent = `${slider.value}%`;
      onChange(parseInt(slider.value, 10));
    });
  },

  _bindSeed(container) {
    container.querySelector('#hc-newseed').addEventListener('click', () => {
      this._seed = Math.floor(Math.random() * 9999);
      container.querySelector('#hc-seed').textContent = String(this._seed).padStart(4, '0');
      EventBus.emit('seed:change', { seed: this._seed });
    });
  },
};

export default HumanColumn;
