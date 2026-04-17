import PatternStore from '../sequencer/PatternStore.js';
import EventBus     from '../EventBus.js';


const HumanColumn = {
  _seed: Math.floor(Math.random() * 9999),

  getSeed() { return this._seed; },

  init(container) {
    const bpm = PatternStore.getBPM();

    container.innerHTML = `
      <div class="hc-section">
        <div class="hc-bpm-display" id="hc-bpm">${bpm}</div>
        <div class="hc-label">BPM</div>
        <div class="hc-bpm-btns">
          <button class="hc-btn" id="hc-bpm-up">+</button>
          <button class="hc-btn" id="hc-bpm-dn">−</button>
        </div>
      </div>

      <div class="hc-divider"></div>

      <canvas id="hc-pulse"></canvas>

      <div class="hc-divider"></div>

      <div class="hc-section hc-section-human">
        <div class="hc-label">HUMAN</div>
        <div class="hc-human-num" id="hc-human-num">0</div>
        <input class="hc-slider hc-slider-human" id="hc-human" type="range" min="0" max="100" value="0" step="1">
        <div class="hc-human-tags">GROOVE · TIMING · CHAOS</div>
      </div>

      <div class="hc-divider"></div>

      <div class="hc-section">
        <div class="hc-label">SWING</div>
        <div class="hc-slider-row">
          <input class="hc-slider" id="hc-swing" type="range" min="0" max="100" value="0" step="1">
          <span class="hc-val" id="hc-swing-val">0%</span>
        </div>
      </div>

      <div class="hc-divider"></div>

      <div class="hc-section">
        <div class="hc-label">SEED</div>
        <div class="hc-seed-display" id="hc-seed">${String(this._seed).padStart(4,'0')}</div>
        <button class="hc-btn hc-btn-wide" id="hc-newseed">NEW SEED</button>
      </div>

      <div class="hc-divider"></div>

      <div class="hc-section">
        <div class="hc-label">REVERB</div>
        <div class="hc-slider-row">
          <input class="hc-slider" id="hc-reverb" type="range" min="0" max="100" value="0" step="1">
          <span class="hc-val" id="hc-reverb-val">0%</span>
        </div>
      </div>

      <div class="hc-divider"></div>

      <div class="hc-section">
        <div class="hc-label">DELAY</div>
        <div class="hc-slider-row">
          <input class="hc-slider" id="hc-delay" type="range" min="0" max="100" value="0" step="1">
          <span class="hc-val" id="hc-delay-val">0%</span>
        </div>
        <div class="hc-bpm-btns" id="hc-delay-time">
          <button class="hc-btn hc-delay-btn active" data-beats="0.5">1/8</button>
          <button class="hc-btn hc-delay-btn" data-beats="1.0">1/4</button>
          <button class="hc-btn hc-delay-btn" data-beats="2.0">1/2</button>
        </div>
      </div>

      <div class="hc-divider"></div>

      <div class="hc-section">
        <div class="hc-label">SIDECHAIN</div>
        <div class="hc-slider-row">
          <input class="hc-slider" id="hc-sc" type="range" min="0" max="100" value="0" step="1">
          <span class="hc-val" id="hc-sc-val">0%</span>
        </div>
      </div>

      <div class="hc-divider"></div>

      <div class="hc-section">
        <div class="hc-label">DIST <span class="hc-sub-label">BSS</span></div>
        <div class="hc-slider-row">
          <input class="hc-slider" id="hc-dist" type="range" min="0" max="100" value="0" step="1">
          <span class="hc-val" id="hc-dist-val">0%</span>
        </div>
      </div>

      <div class="hc-divider"></div>

      <div class="hc-section">
        <div class="hc-label">MASTER</div>
        <div class="hc-slider-row">
          <input class="hc-slider" id="hc-master" type="range" min="0" max="100" value="85" step="1">
          <span class="hc-val" id="hc-master-val">85%</span>
        </div>
      </div>

      <div class="hc-divider"></div>

      <div class="hc-section">
        <div class="hc-label">MIX</div>
        <div class="hc-mixer">
          ${[
            ['kick','KCK'],['snare','SNR'],['clap','CLP'],
            ['hihat','CH'],['hihat_open','OH'],['bass','BSS'],['synth','SYN']
          ].map(([track, label]) => `
          <div class="hc-mix-chan">
            <input class="hc-mix-slider" type="range" orient="vertical" min="0" max="100" value="100" data-track="${track}">
            <button class="hc-mix-mute" data-track="${track}">M</button>
            <span class="hc-mix-label">${label}</span>
          </div>`).join('')}
        </div>
      </div>
    `;

    this._bindBPM(container, bpm);

    // HUMAN — large display + event emission
    const humanSlider = container.querySelector('#hc-human');
    const humanNum    = container.querySelector('#hc-human-num');
    humanSlider.addEventListener('input', () => {
      humanNum.textContent = humanSlider.value;
      EventBus.emit('human:change', { value: parseInt(humanSlider.value, 10) / 100 });
    });

    this._bindSlider(container, 'hc-swing',  'hc-swing-val',  v => EventBus.emit('swing:change',  { value: v / 100 }));
    this._bindSlider(container, 'hc-reverb', 'hc-reverb-val', v => EventBus.emit('fx:reverb',     { mix: v / 100 }));
    this._bindSlider(container, 'hc-delay',  'hc-delay-val',  v => EventBus.emit('fx:delay',      { mix: v / 100 }));
    this._bindSlider(container, 'hc-sc',     'hc-sc-val',     v => EventBus.emit('fx:sidechain',  { amount: v / 100 }));
    this._bindSlider(container, 'hc-dist',   'hc-dist-val',   v => EventBus.emit('fx:dist',        { amount: v / 100 }));
    this._bindSlider(container, 'hc-master', 'hc-master-val', v => EventBus.emit('master:change', { value: v / 100 }));
    this._bindSeed(container);
    this._bindDelayTime(container);
    this._bindMixer(container);

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

    // Hold to accelerate
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

  _bindDelayTime(container) {
    container.querySelectorAll('.hc-delay-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.hc-delay-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        EventBus.emit('fx:delay-time', { beats: parseFloat(btn.dataset.beats) });
      });
    });
  },

  _bindMixer(container) {
    container.querySelectorAll('.hc-mix-slider').forEach(slider => {
      slider.addEventListener('input', () => {
        EventBus.emit('mixer:volume', {
          track: slider.dataset.track,
          value: parseInt(slider.value, 10) / 100,
        });
      });
    });

    container.querySelectorAll('.hc-mix-mute').forEach(btn => {
      btn.addEventListener('click', () => PatternStore.toggleMute(btn.dataset.track));
    });

    // Sync mute button state when track:mute fires
    EventBus.on('track:mute', ({ track, muted }) => {
      const btn = container.querySelector(`.hc-mix-mute[data-track="${track}"]`);
      if (btn) btn.classList.toggle('muted', muted);
    });
  }
};

export default HumanColumn;
