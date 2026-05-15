import EventBus    from '../EventBus.js';
import PatternStore from '../sequencer/PatternStore.js';

const MixPanel = {
  init(container) {
    container.innerHTML = `
      <div class="hc-section mix-master-section">
        <div class="hc-slider-row">
          <span class="hc-label" style="flex-shrink:0">MASTER</span>
          <input class="hc-slider" id="mp-master" type="range" min="0" max="100" value="85" step="1">
          <span class="hc-val" id="mp-master-val">85%</span>
        </div>
      </div>

      <div class="hc-divider"></div>

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
    `;

    const masterSlider = container.querySelector('#mp-master');
    const masterVal    = container.querySelector('#mp-master-val');
    masterSlider.addEventListener('input', () => {
      const v = parseInt(masterSlider.value, 10);
      masterVal.textContent = `${v}%`;
      const label = document.getElementById('master-label');
      if (label) label.textContent = `MASTER ${v}%`;
      EventBus.emit('master:change', { value: v / 100 });
    });

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

    EventBus.on('track:mute', ({ track, muted }) => {
      const btn = container.querySelector(`.hc-mix-mute[data-track="${track}"]`);
      if (btn) btn.classList.toggle('muted', muted);
    });
  },
};

export default MixPanel;
