import EventBus from '../EventBus.js';

export const SUBS           = { '16n': 1, '8n': 2, '4n': 4, '2n': 8 };
export const DURATION_CYCLE = ['16n', '8n', '4n', '2n'];
export const SLOT_COUNT     = 8;

// Each slot is always present. root:null = silence (empty).
function emptySlot() { return { root: null, quality: 'maj', duration: '8n' }; }

const SynthPattern = {
  slots:            Array.from({ length: SLOT_COUNT }, emptySlot),
  _subPos:          0,
  currentSlotIndex: -1,

  // Pen — what gets placed on next click
  pen: { root: 'C', quality: 'maj' },

  get totalSubs() {
    return this.slots.reduce((s, sl) => s + SUBS[sl.duration], 0);
  },

  // Cumulative sub offset for each slot (for transport + visual)
  slotOffsets() {
    const offsets = [];
    let acc = 0;
    for (const sl of this.slots) { offsets.push(acc); acc += SUBS[sl.duration]; }
    return offsets;
  },

  // Called on every transport:tick (1 sub = 1/16 note)
  tick(time) {
    const total = this.totalSubs;
    if (!total) return;
    const offsets = this.slotOffsets();
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (this._subPos === offsets[i]) {
        this.currentSlotIndex = i;
        if (this.slots[i].root !== null) {
          EventBus.emit('synth:step', { step: this.slots[i], index: i, time,
                                        duration: this.slots[i].duration });
        }
        break;
      }
    }
    this._subPos = (this._subPos + 1) % total;
  },

  // ── Mutations ──

  fillSlot(index) {
    const sl = this.slots[index];
    sl.root    = this.pen.root;
    sl.quality = this.pen.quality;
    EventBus.emit('synth:pattern:changed', {});
  },

  clearSlot(index) {
    const sl = this.slots[index];
    sl.root    = null;
    sl.quality = 'maj';
    EventBus.emit('synth:pattern:changed', {});
  },

  cycleSlotDuration(index) {
    const sl = this.slots[index];
    const i  = DURATION_CYCLE.indexOf(sl.duration);
    sl.duration = DURATION_CYCLE[(i + 1) % DURATION_CYCLE.length];
    EventBus.emit('synth:pattern:changed', {});
  },

  listen() {
    EventBus.on('chord:change', ({ root, quality }) => {
      this.pen.root    = root;
      this.pen.quality = quality;
    });
    EventBus.on('transport:tick',  ({ time }) => { this.tick(time); });
    EventBus.on('transport:stop',  ()         => { this._subPos = 0; this.currentSlotIndex = -1; });
  },
};

export default SynthPattern;
