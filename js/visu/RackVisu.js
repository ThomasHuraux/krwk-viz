import AudioEngine    from '../audio/AudioEngine.js';
import EventBus       from '../EventBus.js';
import PatternStore   from '../sequencer/PatternStore.js';

// ──────────────────────────────────────────────────────────────────
// RackVisu — VIZU mode instrument rack
// 6 panels: FFT · Terrain 3D · Status · Spectrogram · Oscilloscope · Phase Scope
// All draw from a shared rAF loop, clipped to their panel canvas.
// ──────────────────────────────────────────────────────────────────

const ACCENT = { r: 232, g: 0, b: 13 };
const accent = (a) => `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${a})`;
const WHITE  = (a) => `rgba(240,240,240,${a})`;

// Phosphor color (follows theme)
let _phosphor = { r: 240, g: 240, b: 240 };
EventBus.on('theme:change', ({ palette }) => {
  if (palette === 'amber') _phosphor = { r: 232, g: 148, b: 13 };
  else if (palette === 'green') _phosphor = { r: 0, g: 232, b: 122 };
  else _phosphor = { r: 240, g: 240, b: 240 };
});
const phosphor = (a) => `rgba(${_phosphor.r},${_phosphor.g},${_phosphor.b},${a})`;

// ── Canvas helper ──────────────────────────────────────────────────
function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  const W = Math.round(r.width  * dpr);
  const H = Math.round(r.height * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width  = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W: r.width, H: r.height };
}

// ── FFT data ──────────────────────────────────────────────────────
const FFT_SIZE = 512;
const _fftBuf  = new Float32Array(FFT_SIZE);
const _tdBuf   = new Float32Array(FFT_SIZE);

function readFFT() {
  const a = AudioEngine.getAnalyser();
  if (a) {
    a.getFloatFrequencyData(_fftBuf);
    a.getFloatTimeDomainData(_tdBuf);
  } else {
    _fftBuf.fill(-90);
    _tdBuf.fill(0);
  }
}

// ══════════════════════════════════════════════════════════════════
// 01 — FFT SPECTRUM
// ══════════════════════════════════════════════════════════════════
const _peakHold = new Float32Array(96).fill(-90);

function drawFFT() {
  const canvas = document.getElementById('cv-fft');
  const fit = fitCanvas(canvas); if (!fit) return;
  const { ctx, W, H } = fit;
  ctx.clearRect(0, 0, W, H);

  const BINS  = 96;
  const padL  = 28, padR = 8, padT = 24, padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // grid
  ctx.strokeStyle = accent(0.18);
  ctx.lineWidth   = 0.5;
  for (let i = 1; i < 4; i++) {
    const y = padT + plotH * i / 4;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
  }
  for (let i = 1; i < 4; i++) {
    const x = padL + plotW * i / 4;
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
  }

  const xs = [], ys = [];
  let peakDb = -90, sumSq = 0, sampleCount = 0;

  for (let b = 0; b < BINS; b++) {
    const srcIdx = Math.floor(Math.pow(b / BINS, 1.2) * _fftBuf.length * 0.95);
    const dbVal  = _fftBuf[Math.min(srcIdx, _fftBuf.length - 1)];
    const norm   = Math.max(0, Math.min(1, (dbVal + 90) / 90));
    const x      = padL + (b / (BINS - 1)) * plotW;
    const y      = padT + plotH * (1 - norm);
    xs.push(x); ys.push(y);

    if (dbVal > peakDb) peakDb = dbVal;
    if (_peakHold[b] > dbVal) {
      _peakHold[b] = Math.min(-1, _peakHold[b] + 0.3);
    } else {
      _peakHold[b] = dbVal;
    }
  }

  // RMS from time-domain
  for (let i = 0; i < _tdBuf.length; i++) { sumSq += _tdBuf[i] * _tdBuf[i]; sampleCount++; }
  const rmsDb = sampleCount > 0 ? 20 * Math.log10(Math.sqrt(sumSq / sampleCount) + 1e-9) : -90;

  // fill area
  ctx.beginPath();
  ctx.moveTo(xs[0], padT + plotH);
  for (let i = 0; i < xs.length; i++) ctx.lineTo(xs[i], ys[i]);
  ctx.lineTo(xs[xs.length - 1], padT + plotH);
  ctx.closePath();
  ctx.fillStyle = accent(0.16);
  ctx.fill();

  // spectrum line
  ctx.beginPath();
  for (let i = 0; i < xs.length; i++) i === 0 ? ctx.moveTo(xs[i], ys[i]) : ctx.lineTo(xs[i], ys[i]);
  ctx.strokeStyle = accent(0.9);
  ctx.lineWidth   = 1.2;
  ctx.stroke();

  // peak hold dots
  ctx.beginPath();
  for (let b = 0; b < BINS; b++) {
    const norm = Math.max(0, Math.min(1, (_peakHold[b] + 90) / 90));
    const x = padL + (b / (BINS - 1)) * plotW;
    const y = padT + plotH * (1 - norm);
    b === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.strokeStyle = WHITE(0.45);
  ctx.lineWidth   = 0.6;
  ctx.setLineDash([2, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // labels
  ctx.fillStyle  = WHITE(0.38);
  ctx.font       = '8px "Courier New",monospace';
  ctx.textAlign  = 'left';
  ctx.fillText('0dB',  2, padT + 3);
  ctx.fillText('−45',  2, padT + plotH / 2 + 4);
  ctx.fillText('−90',  2, H - padB + 3);
  ctx.textAlign  = 'center';
  ctx.fillText('1k',   W * 0.5, H - 5);

  // readout update
  const rdPeak = document.getElementById('rd-peak');
  const rdRms  = document.getElementById('rd-rms');
  if (rdPeak) rdPeak.textContent = peakDb.toFixed(1);
  if (rdRms)  rdRms.textContent  = Math.round(rmsDb);
}

// ══════════════════════════════════════════════════════════════════
// 02 — 3D WIREFRAME TERRAIN
// ══════════════════════════════════════════════════════════════════
const TERRAIN_BINS  = 64;
const TERRAIN_DEPTH = 36;
const _terrainHist  = Array.from({ length: TERRAIN_DEPTH }, () => new Float32Array(TERRAIN_BINS));

function drawTerrain() {
  const canvas = document.getElementById('cv-terrain');
  const fit = fitCanvas(canvas); if (!fit) return;
  const { ctx, W, H } = fit;
  ctx.clearRect(0, 0, W, H);

  // push new frame
  const frame = new Float32Array(TERRAIN_BINS);
  for (let b = 0; b < TERRAIN_BINS; b++) {
    const src  = Math.floor(b / TERRAIN_BINS * _fftBuf.length * 0.65);
    frame[b]   = Math.max(0, (_fftBuf[Math.min(src, _fftBuf.length - 1)] + 90) / 90);
  }
  _terrainHist.unshift(frame);
  _terrainHist.pop();

  const padL = 8, padR = 8, padT = 24, padB = 18;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const FLOOR_Y = plotH * 0.80;
  const FOV_X   = plotW * 0.88;
  const FOV_Z   = plotH * 0.62;
  const TILT    = 0.52;
  const { r, g, b: pb } = _phosphor;
  const pal = (a) => `rgba(${r},${g},${pb},${a.toFixed(3)})`;

  const project = (bi, row, amp) => {
    const zFrac = row / (TERRAIN_DEPTH - 1);
    const xFrac = bi  / (TERRAIN_BINS  - 1);
    const ps    = 0.12 + zFrac * 0.88;
    return {
      x: padL + plotW * 0.5 + (xFrac - 0.5) * FOV_X * ps,
      y: padT + FLOOR_Y - (1 - zFrac) * FOV_Z * TILT - amp * 150 * ps,
      zFrac,
    };
  };

  for (let row = TERRAIN_DEPTH - 1; row >= 0; row--) {
    const hist = _terrainHist[row] ?? new Float32Array(TERRAIN_BINS);
    const pts  = Array.from({ length: TERRAIN_BINS }, (_, bi) => project(bi, row, hist[bi]));
    const floorY = padT + FLOOR_Y;

    // occlusion fill
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let bi = 1; bi < TERRAIN_BINS; bi++) ctx.lineTo(pts[bi].x, pts[bi].y);
    ctx.lineTo(pts[TERRAIN_BINS - 1].x, floorY + 8);
    ctx.lineTo(pts[0].x, floorY + 8);
    ctx.closePath();
    const zFrac = pts[0].zFrac;
    ctx.fillStyle = `rgba(0,0,0,${(0.55 + zFrac * 0.40).toFixed(3)})`;
    ctx.fill();

    // line
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let bi = 1; bi < TERRAIN_BINS; bi++) ctx.lineTo(pts[bi].x, pts[bi].y);

    if (row === 0) {
      // front row — wide soft pass then sharp
      ctx.strokeStyle = pal(0.12);
      ctx.lineWidth   = 6;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let bi = 1; bi < TERRAIN_BINS; bi++) ctx.lineTo(pts[bi].x, pts[bi].y);
      ctx.strokeStyle = pal(0.92);
      ctx.lineWidth   = 1.4;
    } else {
      const alpha = 0.05 + zFrac * 0.50;
      ctx.strokeStyle = pal(alpha);
      ctx.lineWidth   = zFrac < 0.3 ? 0.4 : zFrac < 0.7 ? 0.7 : 1.1;
    }
    ctx.stroke();
  }

  // axis labels
  ctx.font      = '7px "Courier New",monospace';
  ctx.fillStyle = pal(0.38);
  ctx.textAlign = 'left';
  ctx.fillText('20Hz',  padL + 2, padT + FLOOR_Y + 12);
  ctx.textAlign = 'right';
  ctx.fillText('20kHz', padL + plotW - 2, padT + FLOOR_Y + 12);
}

// ══════════════════════════════════════════════════════════════════
// 03 — STATUS (BPM + per-channel VU)
// ══════════════════════════════════════════════════════════════════
let _lastBeat  = 0;
let _chord     = { root: 'C', quality: 'maj' };
let _barStr    = '1.1';

EventBus.on('transport:tick', ({ step, steps }) => {
  if (step % 4 === 0) _lastBeat = performance.now();
  const stepsPerBeat = Math.max(1, steps / 4);
  const beat = Math.floor(step / stepsPerBeat) + 1;
  _barStr = beat + '/4';
});

EventBus.on('chord:change', ({ root, quality }) => {
  _chord = { root, quality };
  const el = document.getElementById('st-chord');
  if (el) el.textContent = root + ' ' + quality;
});

const _VU_BANDS = [[0,4],[4,12],[12,22],[22,60],[60,100],[2,8],[20,80]];

function drawStatus() {
  const stBpm = document.getElementById('st-bpm');
  if (stBpm) stBpm.textContent = PatternStore.getBPM();

  const stBar = document.getElementById('st-bar');
  if (stBar) stBar.textContent = _barStr;

  const pulse = document.getElementById('st-pulse');
  if (pulse) {
    const age = performance.now() - _lastBeat;
    pulse.style.opacity = age < 200 ? String((1 - age / 200).toFixed(2)) : '0.12';
  }

  // VU bars — DOM height from FFT bands
  _VU_BANDS.forEach(([lo, hi], i) => {
    let sum = 0;
    for (let b = lo; b < hi && b < _fftBuf.length; b++) {
      sum += Math.max(0, (_fftBuf[b] + 90) / 90);
    }
    const norm = Math.min(1, sum / (hi - lo));
    const bar = document.querySelector(`.status-ch:nth-child(${i + 1}) .bar`);
    if (bar) bar.style.height = Math.round(norm * 100) + '%';
  });
}

// ══════════════════════════════════════════════════════════════════
// 04 — SPECTROGRAM WATERFALL
// ══════════════════════════════════════════════════════════════════
let _spectroCanvas  = null;
let _spectroCtx     = null;
let _spectroW       = 0;
let _spectroH       = 0;
const SPECTRO_BINS  = 128;

function initSpectro(W, H) {
  _spectroCanvas        = document.createElement('canvas');
  _spectroCanvas.width  = W;
  _spectroCanvas.height = H;
  _spectroCtx           = _spectroCanvas.getContext('2d');
  _spectroW = W;
  _spectroH = H;
}

function drawSpectro() {
  const canvas = document.getElementById('cv-spectro');
  const fit = fitCanvas(canvas); if (!fit) return;
  const { ctx, W, H } = fit;

  const padT = 24, padB = 18;
  const plotH = H - padT - padB;

  // Lazy init or resize
  if (!_spectroCanvas || _spectroW !== Math.floor(W) || _spectroH !== Math.floor(plotH)) {
    initSpectro(Math.floor(W), Math.floor(plotH));
  }

  // Shift left by 1 px
  const imgData = _spectroCtx.getImageData(1, 0, _spectroW - 1, _spectroH);
  _spectroCtx.putImageData(imgData, 0, 0);
  _spectroCtx.clearRect(_spectroW - 1, 0, 1, _spectroH);

  // Draw new column
  const { r, g, b: pb } = _phosphor;
  for (let bin = 0; bin < SPECTRO_BINS; bin++) {
    const srcIdx  = Math.floor(bin / SPECTRO_BINS * _fftBuf.length * 0.85);
    const dbVal   = _fftBuf[Math.min(srcIdx, _fftBuf.length - 1)];
    const norm    = Math.pow(Math.max(0, Math.min(1, (dbVal + 90) / 90)), 2);
    const yFrac   = 1 - bin / SPECTRO_BINS;
    const y       = Math.floor(yFrac * _spectroH);
    const h       = Math.max(1, Math.floor(_spectroH / SPECTRO_BINS));
    _spectroCtx.fillStyle = `rgba(${r},${g},${pb},${(norm * 0.85).toFixed(3)})`;
    _spectroCtx.fillRect(_spectroW - 1, y, 1, h);
  }

  // Render to panel canvas
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(_spectroCanvas, 0, padT, W, plotH);

  // axes
  ctx.fillStyle  = WHITE(0.35);
  ctx.font       = '7px "Courier New",monospace';
  ctx.textAlign  = 'left';
  ctx.fillText('20kHz', 4, padT + 10);
  ctx.textAlign  = 'left';
  ctx.fillText('20Hz', 4, padT + plotH - 4);
}

// ══════════════════════════════════════════════════════════════════
// 05 — OSCILLOSCOPE (phosphor persistence)
// ══════════════════════════════════════════════════════════════════
const SCOPE_TRACES = 4;
const _scopeTraces = [];
const SCOPE_SAMPLES = 256;

function drawScope() {
  const canvas = document.getElementById('cv-scope');
  const fit = fitCanvas(canvas); if (!fit) return;
  const { ctx, W, H } = fit;

  const padL = 8, padR = 8, padT = 24, padB = 18;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Fade existing content (phosphor persistence)
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = accent(0.12);
  ctx.lineWidth   = 0.5;
  for (let i = 1; i < 5; i++) {
    const y = padT + plotH * i / 5;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
  }
  for (let i = 1; i < 8; i++) {
    const x = padL + plotW * i / 8;
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
  }

  // Push new trace
  const trace = new Float32Array(SCOPE_SAMPLES);
  for (let i = 0; i < SCOPE_SAMPLES; i++) {
    const src = Math.floor(i / SCOPE_SAMPLES * _tdBuf.length);
    trace[i]  = _tdBuf[Math.min(src, _tdBuf.length - 1)];
  }
  _scopeTraces.unshift(trace);
  if (_scopeTraces.length > SCOPE_TRACES) _scopeTraces.pop();

  const { r, g, b: pb } = _phosphor;

  _scopeTraces.forEach((tr, idx) => {
    const age = idx / SCOPE_TRACES;
    ctx.beginPath();
    for (let i = 0; i < SCOPE_SAMPLES; i++) {
      const x = padL + (i / (SCOPE_SAMPLES - 1)) * plotW;
      const y = padT + plotH * 0.5 - tr[i] * plotH * 0.42;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    const alpha = idx === 0 ? 0.88 : (1 - age) * 0.35;
    ctx.strokeStyle = `rgba(${r},${g},${pb},${alpha.toFixed(3)})`;
    ctx.lineWidth   = idx === 0 ? 1.2 : 0.6;
    ctx.stroke();
  });

  // Centre baseline
  ctx.strokeStyle = accent(0.25);
  ctx.lineWidth   = 0.5;
  ctx.beginPath();
  ctx.moveTo(padL, padT + plotH * 0.5);
  ctx.lineTo(W - padR, padT + plotH * 0.5);
  ctx.stroke();
}

// ══════════════════════════════════════════════════════════════════
// 06 — PHASE SCOPE (Lissajous / pseudo XY)
// ══════════════════════════════════════════════════════════════════
let _phaseOffscreen    = null;
let _phaseOffscreenCtx = null;

function drawPhase() {
  const canvas = document.getElementById('cv-phase');
  const fit = fitCanvas(canvas); if (!fit) return;
  const { ctx, W, H } = fit;

  // Lazy init offscreen for persistence
  if (!_phaseOffscreen || _phaseOffscreen.width !== Math.floor(W) || _phaseOffscreen.height !== Math.floor(H)) {
    _phaseOffscreen        = document.createElement('canvas');
    _phaseOffscreen.width  = Math.floor(W);
    _phaseOffscreen.height = Math.floor(H);
    _phaseOffscreenCtx     = _phaseOffscreen.getContext('2d');
  }

  // Fade persistence
  _phaseOffscreenCtx.fillStyle = 'rgba(0,0,0,0.12)';
  _phaseOffscreenCtx.fillRect(0, 0, W, H);

  const cx = W * 0.5;
  const cy = H * 0.5;
  const radius = Math.min(W, H) * 0.42;

  // Build XY from time-domain: L = sample i, R = sample i + offset (pseudo-stereo)
  const OFFSET = 32;
  const STEP   = 3;
  const { r, g, b: pb } = _phosphor;

  _phaseOffscreenCtx.beginPath();
  let first = true;
  for (let i = 0; i + OFFSET < _tdBuf.length; i += STEP) {
    const L = _tdBuf[i];
    const R = _tdBuf[i + OFFSET];
    // XY Lissajous: rotate 45° for Mid/Side readability
    const x = cx + (L + R) * radius * 0.707;
    const y = cy - (L - R) * radius * 0.707;
    first ? _phaseOffscreenCtx.moveTo(x, y) : _phaseOffscreenCtx.lineTo(x, y);
    first = false;
  }
  _phaseOffscreenCtx.strokeStyle = `rgba(${r},${g},${pb},0.75)`;
  _phaseOffscreenCtx.lineWidth   = 1.0;
  _phaseOffscreenCtx.stroke();

  // Render offscreen to main
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(_phaseOffscreen, 0, 0);

  // Axes (M/S cross)
  ctx.strokeStyle = accent(0.20);
  ctx.lineWidth   = 0.5;
  ctx.beginPath(); ctx.moveTo(cx, 4); ctx.lineTo(cx, H - 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, cy); ctx.lineTo(W - 4, cy); ctx.stroke();
  // Diagonal guides
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy + radius); ctx.lineTo(cx + radius, cy - radius);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy - radius); ctx.lineTo(cx + radius, cy + radius);
  ctx.stroke();
  ctx.setLineDash([]);

  // Correlation estimate
  let sumLR = 0, sumL2 = 0, sumR2 = 0;
  const OFFSET2 = 32;
  for (let i = 0; i + OFFSET2 < _tdBuf.length; i++) {
    const L = _tdBuf[i], R = _tdBuf[i + OFFSET2];
    sumLR += L * R; sumL2 += L * L; sumR2 += R * R;
  }
  const corr = (sumL2 * sumR2 > 1e-12)
    ? sumLR / Math.sqrt(sumL2 * sumR2)
    : 0;
  const rdCorr = document.getElementById('rd-corr');
  if (rdCorr) rdCorr.textContent = (corr >= 0 ? '+' : '') + corr.toFixed(2);
}

// ══════════════════════════════════════════════════════════════════
// Main loop
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// HTML builder helpers
// ══════════════════════════════════════════════════════════════════
function _panel({ num, name, readouts = [], cornerBL, cornerBR, body, klass }) {
  const ro = readouts.map(r =>
    `<span>${r.label}${r.value !== undefined
      ? ` <span class="v"${r.id ? ` data-readout="${r.id}"` : ''}>${r.value}</span>`
      : ''}</span>`
  ).join('');
  return `<section class="panel ${klass || ''}">
    <div class="panel-head"><span class="num">${num}</span><span>${name}</span></div>
    ${ro ? `<div class="panel-readout">${ro}</div>` : ''}
    ${body}
    ${cornerBL ? `<div class="panel-corner bl">${cornerBL}</div>` : ''}
    ${cornerBR ? `<div class="panel-corner br">${cornerBR}</div>` : ''}
  </section>`;
}

function _statusHTML() {
  const ch = ['KCK','SNR','CLP','CH','OH','BSS','SYN'];
  const bars = ch.map((l, i) => `
    <div class="status-ch">
      <div class="meter"><div class="bar" data-vu="${i}"></div></div>
      <div class="lbl">${l}</div>
    </div>`).join('');
  return `<div class="status-body">
    <div class="status-top">
      <div class="status-bpm" id="st-bpm">128</div>
      <div class="status-bpm-side">
        <div>BPM</div>
        <div class="v" id="st-bar">1.1</div>
        <div>BAR</div>
        <div class="v accent" id="st-chord">C maj</div>
        <div>CHORD</div>
        <div class="status-pulse" id="st-pulse"></div>
      </div>
    </div>
    <div class="status-channels">${bars}</div>
  </div>`;
}

function init(rootEl) {
  rootEl.innerHTML = `<div class="vizu-grid">
    ${_panel({ num:'01', name:'FFT SPECTRUM',
      readouts:[{label:'PEAK', value:'-6 dB', id:'rd-peak'},{label:'RMS', value:'-18 dB', id:'rd-rms'}],
      cornerBL:'20 Hz', cornerBR:'20 kHz',
      body:'<canvas class="v-canvas" id="cv-fft"></canvas>', klass:'v-fft' })}
    ${_panel({ num:'02', name:'TERRAIN · 3D',
      readouts:[{label:'DEPTH', value:'36'},{label:'TILT', value:'22°'}],
      cornerBL:'FREQ →', cornerBR:'TIME ↙',
      body:'<canvas class="v-canvas" id="cv-terrain"></canvas>', klass:'v-terrain' })}
    ${_panel({ num:'03', name:'STATUS',
      readouts:[{label:'7 CH'}],
      cornerBL:'NOW', cornerBR:'LIVE',
      body:_statusHTML(), klass:'v-status' })}
    ${_panel({ num:'04', name:'SPECTROGRAM',
      readouts:[{label:'WIN', value:'1024'},{label:'HOP', value:'512'}],
      cornerBL:'TIME →', cornerBR:'FREQ ↑',
      body:'<canvas class="v-canvas" id="cv-spectro"></canvas>', klass:'v-spectro' })}
    ${_panel({ num:'05', name:'OSCILLOSCOPE',
      readouts:[{label:'10 ms/DIV · 0.5 V/DIV'}],
      cornerBL:'PHOSPHOR', cornerBR:'TRG ▮▮▮▯▯',
      body:'<canvas class="v-canvas" id="cv-scope"></canvas>', klass:'v-scope' })}
    ${_panel({ num:'06', name:'PHASE SCOPE',
      readouts:[{label:'CORR', value:'+0.00', id:'rd-corr'},{label:'X / Y'}],
      cornerBL:'L', cornerBR:'R',
      body:'<canvas class="v-canvas" id="cv-phase"></canvas>', klass:'v-phase' })}
  </div>`;
}

// ══════════════════════════════════════════════════════════════════
// rAF loop
// ══════════════════════════════════════════════════════════════════
let _rafId   = null;
let _active  = false;

function _loop() {
  if (!_active) return;
  readFFT();
  drawFFT();
  drawTerrain();
  drawStatus();
  drawSpectro();
  drawScope();
  drawPhase();
  _rafId = requestAnimationFrame(_loop);
}

const RackVisu = {
  init,

  start() {
    if (_active) return;
    _active = true;
    _rafId = requestAnimationFrame(_loop);
  },

  stop() {
    _active = false;
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  },
};

export default RackVisu;
