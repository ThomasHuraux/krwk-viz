import EventBus from '../EventBus.js';

const BassControls = {
  init(container) {
    container.innerHTML = `
      <div id="bass-controls">
        <div class="bass-row">
          <span class="bass-label">CUT</span>
          <input class="bass-slider" id="bass-cutoff" type="range"
            min="60" max="4000" step="10" value="600">
          <span class="bass-val" id="bass-cutoff-val">600 Hz</span>
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

    bind('bass-cutoff', 'bass-cutoff-val', 'cutoff',   v => `${Math.round(v)} Hz`);
    bind('bass-res',    'bass-res-val',    'resonance', v => v.toFixed(1));
    bind('bass-env',    'bass-env-val',    'envMod',    v => v.toFixed(1));
    bind('bass-dec',    'bass-dec-val',    'decay',     v => v.toFixed(2));
  },
};

export default BassControls;
