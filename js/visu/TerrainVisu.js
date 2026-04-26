import AudioEngine from '../audio/AudioEngine.js';
import EventBus    from '../EventBus.js';

const BINS  = 80;
const DEPTH = 40;

const PALETTES = {
  amber: { r: 232, g: 148, b:  13 },
  green: { r:   0, g: 232, b: 122 },
  white: { r: 240, g: 240, b: 240 },
};

const TerrainVisu = {
  _canvas:        null,
  _ctx:           null,
  _history:       [],
  _phosphorColor: { ...PALETTES.white },
  _human:         0,
  _W:             0,
  _H:             0,

  init(canvas) {
    if (!canvas) return;
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');

    this._syncSize();
    this._initHistory();

    EventBus.on('transport:stop', () => this._initHistory());
    EventBus.on('human:change',   ({ value }) => { this._human = value; });
    EventBus.on('theme:change',   ({ palette }) => {
      if (PALETTES[palette]) this._phosphorColor = { ...PALETTES[palette] };
    });

    window.addEventListener('resize', () => this._syncSize());

    this._loop();
  },

  setPhosphorColor(color) {
    this._phosphorColor = { ...color };
  },

  _syncSize() {
    if (!this._canvas) return;
    const rect = this._canvas.getBoundingClientRect();
    this._W = this._canvas.width  = rect.width  || this._canvas.offsetWidth  || 200;
    this._H = this._canvas.height = rect.height || this._canvas.offsetHeight || 200;
  },

  _initHistory() {
    this._history = Array.from({ length: DEPTH }, () => new Float32Array(BINS));
  },

  _loop() {
    requestAnimationFrame(() => this._loop());
    const analyser = AudioEngine.getAnalyser();
    if (analyser) this._pushFrame(analyser);
    this._draw();
  },

  _pushFrame(analyser) {
    const raw = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(raw);

    const frame  = new Float32Array(BINS);
    const limit  = raw.length * 0.6;
    for (let b = 0; b < BINS; b++) {
      const srcIdx = Math.floor(b / BINS * limit);
      const dbVal  = Math.max(-90, raw[Math.min(srcIdx, raw.length - 1)]);
      frame[b] = Math.max(0, (dbVal + 90) / 90);
    }
    this._history.unshift(frame);
    if (this._history.length > DEPTH) this._history.pop();
  },

  _project(binIdx, rowIdx, amp) {
    const W = this._W, H = this._H;
    const FLOOR_Y   = H * 0.78;
    const FOV_X     = W * 0.72;
    const FOV_Z     = H * 0.55;
    const TILT      = 0.55 + this._human * 0.15;

    const zFrac      = rowIdx / (DEPTH - 1);
    const xFrac      = binIdx / (BINS  - 1);
    const perspScale = 0.15 + zFrac * 0.85;
    const xOffset    = (xFrac - 0.5) * FOV_X * perspScale;
    const zOffset    = (1 - zFrac)   * FOV_Z * TILT;
    return {
      x: W * 0.5 + xOffset,
      y: FLOOR_Y - zOffset - amp * 180 * perspScale,
      perspScale,
      zFrac,
      FLOOR_Y,
    };
  },

  _palColor(alpha) {
    const { r, g, b } = this._phosphorColor;
    return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
  },

  _draw() {
    const ctx  = this._ctx;
    if (!ctx) return;
    const W = this._W, H = this._H;

    // Persistent trail fill
    ctx.fillStyle = 'rgba(10,10,10,0.25)';
    ctx.fillRect(0, 0, W, H);

    if (!this._history.length) return;

    // Painter's algorithm: back to front
    for (let row = DEPTH - 1; row >= 0; row--) {
      const frame = this._history[row] ?? this._history[this._history.length - 1];
      const zFrac = row / (DEPTH - 1);

      // Compute projected points for this row
      const pts = [];
      for (let b = 0; b < BINS; b++) {
        pts.push(this._project(b, row, frame[b]));
      }
      const FLOOR_Y = pts[0].FLOOR_Y;

      // Occlusion fill (painter's algorithm — covers rows behind)
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let b = 1; b < BINS; b++) ctx.lineTo(pts[b].x, pts[b].y);
      ctx.lineTo(pts[BINS - 1].x, FLOOR_Y + 20);
      ctx.lineTo(pts[0].x,        FLOOR_Y + 20);
      ctx.closePath();
      ctx.fillStyle = `rgba(10,10,10,${(0.65 + zFrac * 0.35).toFixed(3)})`;
      ctx.fill();

      // Wireframe line
      const alpha   = 0.04 + zFrac * 0.51;
      ctx.lineWidth = zFrac < 0.3 ? 0.5 : zFrac < 0.7 ? 0.8 : 1.5;

      if (row === 0) {
        // Front row — glow (thick pass) then sharp pass
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let b = 1; b < BINS; b++) ctx.lineTo(pts[b].x, pts[b].y);
        ctx.strokeStyle = this._palColor(0.10);
        ctx.lineWidth   = 8;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let b = 1; b < BINS; b++) ctx.lineTo(pts[b].x, pts[b].y);
        ctx.strokeStyle = this._palColor(0.90);
        ctx.lineWidth   = 1.5;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let b = 1; b < BINS; b++) ctx.lineTo(pts[b].x, pts[b].y);
        ctx.strokeStyle = this._palColor(alpha);
        ctx.stroke();
      }

      // Vertical frequency cuts every 4 bins
      if (row < DEPTH - 1) {
        const nextFrame = this._history[row + 1] ?? frame;
        for (let b = 0; b < BINS; b += 4) {
          const pThis = pts[b];
          const pNext = this._project(b, row + 1, nextFrame[b]);
          ctx.beginPath();
          ctx.moveTo(pThis.x, pThis.y);
          ctx.lineTo(pNext.x, pNext.y);
          ctx.strokeStyle = this._palColor(0.08);
          ctx.lineWidth   = 0.5;
          ctx.stroke();
        }
      }
    }

    // Axis labels
    ctx.font         = '9px "Courier New"';
    ctx.fillStyle    = this._palColor(0.35);
    ctx.textBaseline = 'bottom';
    const labelY     = this._project(0, DEPTH - 1, 0).FLOOR_Y + 16;
    ctx.textAlign    = 'left';
    ctx.fillText('20Hz',   6, labelY);
    ctx.textAlign    = 'right';
    ctx.fillText('20kHz', W - 6, labelY);
  },
};

export default TerrainVisu;
