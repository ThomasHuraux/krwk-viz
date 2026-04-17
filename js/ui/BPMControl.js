import PatternStore from '../sequencer/PatternStore.js';
import EventBus     from '../EventBus.js';

const BPMControl = {
  init(container) {
    const bpm = PatternStore.getBPM();

    container.innerHTML = `
      <span class="bpm-value" id="bpm-value">${bpm}</span>
      <span class="bpm-unit">BPM</span>
      <input class="bpm-slider" id="bpm-slider" type="range"
             min="60" max="200" value="${bpm}" step="1"
             aria-label="BPM">
    `;

    const slider  = container.querySelector('#bpm-slider');
    const display = container.querySelector('#bpm-value');

    slider.addEventListener('input', () => {
      const v = parseInt(slider.value, 10);
      PatternStore.setBPM(v);
      display.textContent = v;
    });

    // Keep display in sync if BPM changes from elsewhere
    EventBus.on('transport:bpm', ({ bpm: v }) => {
      display.textContent = v;
      slider.value        = v;
    });
  }
};

export default BPMControl;
