import EventBus from '../EventBus.js';
import Geometry  from '../layout/Geometry.js';

export const NOTES_COF = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];
const QUALITIES = ['maj', 'min', '7', 'maj7', 'sus2'];

// Quality modifier buttons — positioned horizontally below the Tonnetz.
// Root comes from Tonnetz clicks; these buttons extend the quality only.
const ChordWheel = {
  root:        'C',
  quality:     'maj',
  qualityBtns: {},

  init(container) {
    QUALITIES.forEach(q => {
      const btn = document.createElement('button');
      btn.className       = 'chord-quality-btn';
      btn.textContent     = q;
      btn.dataset.quality = q;
      if (q === this.quality) btn.classList.add('active');

      btn.addEventListener('click', () => {
        this.quality = q;
        this._syncActive(q);
        EventBus.emit('chord:change', { root: this.root, quality: q });
      });

      this.qualityBtns[q] = btn;
      container.appendChild(btn);
    });

    this._reposition();
    window.addEventListener('resize', () => { Geometry.update(); this._reposition(); });

    // Sync when Tonnetz selects a chord (root + base quality)
    EventBus.on('chord:change', ({ root, quality }) => {
      this.root    = root;
      this.quality = quality;
      this._syncActive(quality);
    });
  },

  _syncActive(q) {
    Object.values(this.qualityBtns).forEach(b =>
      b.classList.toggle('active', b.dataset.quality === q)
    );
  },

  _reposition() {
    const count  = QUALITIES.length;
    const gap    = 46;
    const startX = Geometry.colorCX - ((count - 1) * gap) / 2;
    const y      = Geometry.pivotY + Geometry.colorRadii.hihat_open + 36;

    QUALITIES.forEach((q, i) => {
      const btn = this.qualityBtns[q];
      if (!btn) return;
      btn.style.left = `${startX + i * gap}px`;
      btn.style.top  = `${y}px`;
    });
  },
};

export default ChordWheel;
