import EventBus from '../EventBus.js';

const EffectsPanel = {
  init(container) {
    container.innerHTML = `
      <div class="hc-section">
        <div class="hc-label">REVERB</div>
        <div class="hc-slider-row">
          <input class="hc-slider" id="ep-reverb" type="range" min="0" max="100" value="28" step="1">
          <span class="hc-val" id="ep-reverb-val">28%</span>
        </div>
      </div>

      <div class="hc-divider"></div>

      <div class="hc-section">
        <div class="hc-label">DELAY</div>
        <div class="hc-slider-row">
          <input class="hc-slider" id="ep-delay" type="range" min="0" max="100" value="0" step="1">
          <span class="hc-val" id="ep-delay-val">0%</span>
        </div>
        <div class="hc-bpm-btns" id="ep-delay-time">
          <button class="hc-btn hc-delay-btn active" data-beats="0.5">1/8</button>
          <button class="hc-btn hc-delay-btn" data-beats="1.0">1/4</button>
          <button class="hc-btn hc-delay-btn" data-beats="2.0">1/2</button>
        </div>
      </div>

      <div class="hc-divider"></div>

      <div class="hc-section">
        <div class="hc-label">SIDECHAIN</div>
        <div class="hc-slider-row">
          <input class="hc-slider" id="ep-sc" type="range" min="0" max="100" value="0" step="1">
          <span class="hc-val" id="ep-sc-val">0%</span>
        </div>
      </div>

      <div class="hc-divider"></div>

      <div class="hc-section">
        <div class="hc-label">DIST <span class="hc-sub-label">BSS</span></div>
        <div class="hc-slider-row">
          <input class="hc-slider" id="ep-dist" type="range" min="0" max="100" value="0" step="1">
          <span class="hc-val" id="ep-dist-val">0%</span>
        </div>
      </div>
    `;

    this._bind(container, 'ep-reverb', 'ep-reverb-val', v => EventBus.emit('fx:reverb',    { mix: v / 100 }));
    this._bind(container, 'ep-delay',  'ep-delay-val',  v => EventBus.emit('fx:delay',     { mix: v / 100 }));
    this._bind(container, 'ep-sc',     'ep-sc-val',     v => EventBus.emit('fx:sidechain', { amount: v / 100 }));
    this._bind(container, 'ep-dist',   'ep-dist-val',   v => EventBus.emit('fx:dist',      { amount: v / 100 }));

    container.querySelectorAll('.hc-delay-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.hc-delay-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        EventBus.emit('fx:delay-time', { beats: parseFloat(btn.dataset.beats) });
      });
    });
  },

  _bind(container, id, valId, onChange) {
    const slider  = container.querySelector(`#${id}`);
    const display = container.querySelector(`#${valId}`);
    slider.addEventListener('input', () => {
      display.textContent = `${slider.value}%`;
      onChange(parseInt(slider.value, 10));
    });
  },
};

export default EffectsPanel;
