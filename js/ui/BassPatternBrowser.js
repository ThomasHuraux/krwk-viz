import EventBus from '../EventBus.js';
import Geometry  from '../layout/Geometry.js';
import BassPattern, { BASS_PATTERNS_META } from '../sequencer/BassPattern.js';
import BassControls from './BassControls.js';

const GROUPS = [
  { style: 'house',  label: 'HSE', indices: [0,1,2,3,4,5]          },
  { style: 'acid',   label: 'ACD', indices: [6,7,8,9,10,11,12,13]  },
  { style: 'bridge', label: 'BRG', indices: [14,15,16,17,18]        },
  { style: 'techno', label: 'TCH', indices: [19,20,21,22,23,24]     },
  { style: 'hard',   label: 'RVE', indices: [25,26,27,28,29]        },
];

function shortLabel(meta) { return meta.label.split('·')[1] ?? meta.label; }

// Prevent dblclick from triggering two clicks
function onDblClick(el, cb) {
  let timer = null;
  el.addEventListener('click', e => {
    if (timer) { clearTimeout(timer); timer = null; return; }
    timer = setTimeout(() => { timer = null; cb(e, 'click'); }, 220);
  });
  el.addEventListener('dblclick', e => { cb(e, 'dblclick'); });
}

const BassPatternBrowser = {
  _container: null,
  _buttons:   [],

  init(container) {
    this._container = container;

    const rows = GROUPS.map(g => {
      const btns = g.indices.map(i => {
        const meta = BASS_PATTERNS_META[i];
        return `<button class="bpb-btn" data-idx="${i}" data-style="${g.style}"
                  title="${meta.label} — dblclick=chain">${shortLabel(meta)}</button>`;
      }).join('');
      return `<div class="bpb-row">
                <span class="bpb-group" data-style="${g.style}">${g.label}</span>
                ${btns}
              </div>`;
    }).join('');

    container.innerHTML = `
      <div id="bass-browser">
        ${rows}
        <div class="bpb-chain-row">
          <span class="bpb-chain-label">CHAIN</span>
          <button class="bpb-clear-btn" id="bpb-clear">CLR</button>
        </div>
      </div>`;

    this._buttons = [];
    container.querySelectorAll('.bpb-btn').forEach(btn => {
      const idx = parseInt(btn.dataset.idx, 10);
      this._buttons[idx] = btn;
      onDblClick(btn, (e, type) => {
        if (type === 'click')    BassPattern.queuePattern(idx);
        if (type === 'dblclick') { BassPattern.toggleChain(idx); this._renderChain(); }
      });
    });

    container.querySelector('#bpb-clear').addEventListener('click', () => {
      BassPattern._chain = [];
      EventBus.emit('bass:chain', { chain: [] });
      this._renderChain();
    });

    this._renderChain();

    EventBus.on('bass:pattern', ({ index }) => { this._renderChain(); this._renderActive(index, -1); });
    EventBus.on('bass:pending', ({ index }) => this._renderActive(BassPattern.activePattern, index));
    EventBus.on('bass:chain',   ()          => this._renderChain());

    this._reposition();
    window.addEventListener('resize', () => { Geometry.update(); this._reposition(); });
  },

  _renderActive(active, pending) {
    this._buttons.forEach((btn, i) => {
      const inChain = BassPattern._chain.includes(i);
      btn.classList.toggle('active',  i === active);
      btn.classList.toggle('pending', i === pending && i !== active);
      // chained class handled by _renderChain
    });
  },

  _renderChain() {
    const chain  = BassPattern._chain;
    const active = BassPattern.activePattern;
    this._buttons.forEach((btn, i) => {
      const pos = chain.indexOf(i);
      btn.classList.toggle('chained', pos >= 0);
      btn.classList.toggle('active',  i === active);
      // show position number in chain as data attribute for CSS counter
      if (pos >= 0) btn.dataset.chainPos = pos + 1;
      else          delete btn.dataset.chainPos;
    });
    // show/hide CLEAR button
    const clr = this._container.querySelector('#bpb-clear');
    if (clr) clr.style.opacity = chain.length > 1 ? '1' : '0.2';
  },

  _reposition() {
    const el = this._container.querySelector('#bass-browser');
    if (!el) return;
    const R  = Geometry.bassRingR;
    const cy = Geometry.bassRingCY;
    // Bottom-right corner, just above the control bar
    el.style.left      = `${Geometry.width - 16}px`;
    el.style.top       = `${cy + R + 8}px`;
    el.style.transform = 'translate(-100%, -100%)';
    // BassControls positions itself above — re-trigger after our render
    requestAnimationFrame(() => BassControls._reposition());
  },
};

export default BassPatternBrowser;
