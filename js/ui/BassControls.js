import EventBus from '../EventBus.js';
import Geometry  from '../layout/Geometry.js';

const BassControls = {
  _container: null,

  init(container) {
    this._container = container;

    container.innerHTML = `
      <div id="bass-controls">
        <div class="bass-row">
          <span class="bass-label">CUT</span>
          <input class="bass-slider" id="bass-cutoff" type="range"
            min="60" max="4000" step="10" value="600">
          <span class="bass-val" id="bass-cutoff-val">600</span>
        </div>
        <div class="bass-row">
          <span class="bass-label">RES</span>
          <input class="bass-slider" id="bass-res" type="range"
            min="0.5" max="30" step="0.5" value="10">
          <span class="bass-val" id="bass-res-val">10</span>
        </div>
        <div class="bass-row">
          <span class="bass-label">ENV</span>
          <input class="bass-slider" id="bass-env" type="range"
            min="0.5" max="8" step="0.1" value="3.5">
          <span class="bass-val" id="bass-env-val">3.5</span>
        </div>
        <div class="bass-row">
          <span class="bass-label">DEC</span>
          <input class="bass-slider" id="bass-dec" type="range"
            min="0.02" max="0.8" step="0.01" value="0.12">
          <span class="bass-val" id="bass-dec-val">0.12</span>
        </div>
      </div>
    `;

    const bind = (id, valId, key, fmt) => {
      const input = container.querySelector(`#${id}`);
      const label = container.querySelector(`#${valId}`);
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        label.textContent = fmt(v);
        EventBus.emit('bass:param', { [key]: v });
      });
    };

    bind('bass-cutoff', 'bass-cutoff-val', 'cutoff',    v => Math.round(v));
    bind('bass-res',    'bass-res-val',    'resonance',  v => v.toFixed(1));
    bind('bass-env',    'bass-env-val',    'envMod',     v => v.toFixed(1));
    bind('bass-dec',    'bass-dec-val',    'decay',      v => v.toFixed(2));

    this._reposition();
    window.addEventListener('resize', () => { Geometry.update(); this._reposition(); });
  },

  _reposition() {
    const el = this._container.querySelector('#bass-controls');
    if (!el) return;
    const browser = document.getElementById('bass-browser');
    const bRect   = browser ? browser.getBoundingClientRect() : null;
    if (bRect && bRect.width > 0) {
      // Stacked just above the preset grid, right-aligned
      el.style.left      = `${bRect.right}px`;
      el.style.top       = `${bRect.top - 8}px`;
      el.style.transform = 'translate(-100%, -100%)';
    } else {
      // Fallback: to the right of the bass ring
      const R  = Geometry.bassRingR;
      const cx = Geometry.bassRingCX;
      const cy = Geometry.bassRingCY;
      el.style.left      = `${cx + R + 16}px`;
      el.style.top       = `${cy}px`;
      el.style.transform = 'translate(0, -50%)';
    }
  },
};

export default BassControls;
