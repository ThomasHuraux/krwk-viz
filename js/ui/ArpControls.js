import EventBus from '../EventBus.js';
import Geometry  from '../layout/Geometry.js';

const ArpControls = {
  _container: null,

  init(container) {
    this._container = container;

    container.innerHTML = `
      <div id="arp-controls">
        <div class="arp-row">
          <span class="arp-label">SPEED</span>
          <button class="arp-btn arp-speed" data-steps="4">1/4</button>
          <button class="arp-btn arp-speed active" data-steps="2">1/8</button>
          <button class="arp-btn arp-speed" data-steps="1">1/16</button>
        </div>
        <div class="arp-row">
          <span class="arp-label">GATE</span>
          <button class="arp-btn arp-gate" data-ratio="0.25">25%</button>
          <button class="arp-btn arp-gate" data-ratio="0.50">50%</button>
          <button class="arp-btn arp-gate active" data-ratio="0.80">80%</button>
          <button class="arp-btn arp-gate" data-ratio="1.20">120%</button>
        </div>
      </div>
    `;

    container.querySelectorAll('.arp-speed').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.arp-speed').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        EventBus.emit('arp:speed', { steps: parseInt(btn.dataset.steps, 10) });
      });
    });

    container.querySelectorAll('.arp-gate').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.arp-gate').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        EventBus.emit('arp:gate', { ratio: parseFloat(btn.dataset.ratio) });
      });
    });

    this._reposition();
    window.addEventListener('resize', () => { Geometry.update(); this._reposition(); });
  },

  _reposition() {
    const el = this._container.querySelector('#arp-controls');
    if (!el) return;
    const outerR = Geometry.colorRadii?.hihat_open ?? 0;
    const cx     = Geometry.colorCX;
    const cy     = Geometry.colorCY ?? Geometry.pivotY;
    // Inside the synth wheel, centered, below scale selection
    el.style.left      = `${cx}px`;
    el.style.top       = `${cy + outerR * 0.22}px`;
    el.style.transform = 'translateX(-50%) scale(0.75)';
    el.style.transformOrigin = 'top center';
  },
};

export default ArpControls;
