import EventBus    from '../EventBus.js';
import PatternStore from '../sequencer/PatternStore.js';
import Transport    from '../sequencer/Transport.js';
import ArpSeq, { ARP_PRESETS } from '../sequencer/ArpSeq.js';
import SynthPattern             from '../sequencer/SynthPattern.js';
import BassPattern              from '../sequencer/BassPattern.js';
import AudioEngine              from '../audio/AudioEngine.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const BONES_TRACKS = ['kick', 'snare', 'clap', 'hihat', 'hihat_open'];
const BONES_LABELS = ['KICK', 'SNR', 'CLP', 'CH', 'OH'];
const BONES_RADII  = [220, 178, 140, 102, 64];
const BONES_DOT_ON  = [10, 9, 8, 7.5, 7];
const BONES_DOT_OFF = [7, 6.5, 6, 5.5, 5];

const MIX_LABELS = ['KCK', 'SNR', 'CLP', 'CH', 'OH', 'BSS', 'SYN'];
const MIX_TRACKS = ['kick', 'snare', 'clap', 'hihat', 'hihat_open', 'bass', 'synth'];
const MIX_LEVELS = [0.72, 0.50, 0.55, 0.70, 0.50, 0.80, 0.65];

const COF_ORDER  = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];
const CHROMATIC  = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const INTERVALS  = {
  maj: [0,4,7], min: [0,3,7], '7': [0,4,7,10], maj7: [0,4,7,11], sus2: [0,2,7]
};

const BASS_STYLE_NAMES  = ['HSE','ACD','BRG','TCH','RVE'];
const BASS_STYLE_COUNTS = [6, 8, 5, 6, 5];
const BASS_ROW_OFFSETS  = [0, 6, 14, 19, 25];

// ── Module state ───────────────────────────────────────────────────────────────
let _root = 'C';
let _quality = 'maj';
let _seed = 4011;
let _human = 0;
let _swing = 14;
let _delayDiv = '1/8';
let _view = null;
let _lastTickTime = 0;

// Per-channel envelope for VU bars
const _env = { kick:0, snare:0, clap:0, hihat:0, hihat_open:0, bass:0, synth:0 };

// ── Panel chrome helper ────────────────────────────────────────────────────────
function panel({ num, name, readouts = [], cornerBL, cornerBR, body, klass }) {
  const ro = readouts.map(r =>
    `<span>${r.label}${r.value !== undefined ? ` <span class="v"${r.id ? ` data-readout="${r.id}"` : ''}>${r.value}</span>` : ''}</span>`
  ).join('');
  return `<section class="panel ${klass || ''}">
    <div class="panel-head"><span class="num">${num}</span><span>${name}</span></div>
    ${ro ? `<div class="panel-readout">${ro}</div>` : ''}
    <div class="panel-body">${body}</div>
    ${cornerBL ? `<div class="panel-corner bl">${cornerBL}</div>` : ''}
    ${cornerBR ? `<div class="panel-corner br">${cornerBR}</div>` : ''}
  </section>`;
}

function slider(label, key, value, unit = '') {
  const pct = Math.max(0, Math.min(100, typeof value === 'number' ? value : 0));
  return `<div class="slider" data-slider="${key}">
    <span>${label}</span>
    <div class="track">
      <div class="fill" style="width:${pct}%"></div>
      <div class="knob" style="left:${pct}%"></div>
    </div>
    <span class="val">${unit ? String(Math.round(pct)) + unit : Math.round(pct)}</span>
  </div>`;
}

function sliderDivs(label, key, value, unit, divs, activeDiv) {
  const pct = Math.max(0, Math.min(100, value));
  const divsHTML = divs.map(d =>
    `<button class="btn-cell ${d === activeDiv ? 'active' : ''}" data-div="${d}">${d}</button>`
  ).join('');
  return `<div class="slider with-divs" data-slider="${key}">
    <span>${label}</span>
    <div class="track">
      <div class="fill" style="width:${pct}%"></div>
      <div class="knob" style="left:${pct}%"></div>
    </div>
    <div class="delay-divs">${divsHTML}</div>
    <span class="val">${Math.round(pct)}${unit}</span>
  </div>`;
}

// ── M01 BONES ─────────────────────────────────────────────────────────────────
function buildBonesDots() {
  let dots = '';
  const pattern = PatternStore.getPattern();
  const steps   = PatternStore.getSteps();
  BONES_TRACKS.forEach((track, ti) => {
    const r = BONES_RADII[ti];
    for (let s = 0; s < steps; s++) {
      const ang = (s / steps) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      const on = pattern[track]?.[s] ?? 0;
      dots += `<g class="step-dot" data-track="${track}" data-step="${s}" style="cursor:pointer" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">
        ${on
          ? `<circle r="${BONES_DOT_ON[ti]}" fill="#F0F0F0"/>`
          : `<circle r="${BONES_DOT_OFF[ti]}" fill="rgba(10,6,6,1)" stroke="rgba(240,240,240,0.30)" stroke-width="1"/>`}
      </g>`;
    }
  });
  return dots;
}

function buildBones() {
  const steps = PatternStore.getSteps();
  const pat   = PatternStore.activePattern;

  let ticks = '';
  for (let s = 0; s < 16; s++) {
    const ang = (s / 16) * Math.PI * 2 - Math.PI / 2;
    const x1 = Math.cos(ang) * 220, y1 = Math.sin(ang) * 220;
    const x2 = Math.cos(ang) * 232, y2 = Math.sin(ang) * 232;
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(232,0,13,0.35)" stroke-width="${s % 4 === 0 ? 1.5 : 0.6}"/>`;
  }

  let trackLabels = '';
  BONES_RADII.forEach((r, i) => {
    trackLabels += `<text x="${-r - 8}" y="3" text-anchor="end" font-family="'JetBrains Mono',monospace" font-size="10" letter-spacing="2" fill="${i === 0 ? '#F0F0F0' : 'rgba(240,240,240,0.55)'}">${BONES_LABELS[i]}</text>`;
  });

  return `<div class="bones-stage">
    <svg class="bones-svg" viewBox="-280 -280 560 560" preserveAspectRatio="xMidYMid meet">
      ${BONES_RADII.map(r => `<circle r="${r}" fill="none" stroke="rgba(232,0,13,0.20)" stroke-width="0.7"/>`).join('')}
      <g>${ticks}</g>
      <g id="bones-dots">${buildBonesDots()}</g>
      <g>${trackLabels}</g>
      <line id="bones-needle" x1="0" y1="0" x2="0" y2="-245" stroke="#E8000D" stroke-width="2.5"/>
      <circle r="5" fill="#E8000D"/>
    </svg>
  </div>
  <div class="bones-controls">
    <div>
      <div style="margin-bottom:3px">PATTERN</div>
      <div class="btn-row" id="pattern-row">
        ${['A','B','C','D'].map(p => `<button class="btn-cell ${p === pat ? 'active' : ''}" data-pat="${p}">${p}</button>`).join('')}
      </div>
    </div>
    <div>
      <div style="margin-bottom:3px">STEPS</div>
      <div class="btn-row" id="steps-row">
        ${[8, 16, 12, 32].map(n => `<button class="btn-cell ${n === steps ? 'active' : ''}" data-steps="${n}">${n}</button>`).join('')}
      </div>
    </div>
    <div class="bones-meta">
      <div>BAR <span class="big" id="bn-bar">1.1/4</span></div>
      <div>LOOP <span class="big" id="bn-loop">0</span></div>
    </div>
  </div>`;
}

// ── M02 TEMPO ─────────────────────────────────────────────────────────────────
function buildTempo() {
  return `<div class="tempo-body">
    <div class="tempo-row1">
      <div>
        <span class="tempo-bpm" id="bpm-display">${PatternStore.getBPM()}</span>
        <span class="tempo-bpm-unit">BPM</span>
      </div>
      <div class="tempo-bpm-controls">
        <button class="btn-cell" data-bpm="-1">−</button>
        <button class="btn-cell" data-bpm="+1">+</button>
      </div>
      <div class="tempo-seed">
        SEED
        <span class="v" id="seed-display">${_seed}</span>
        <span class="new" id="seed-new">NEW ›</span>
      </div>
    </div>
    <div class="tempo-sliders">
      ${slider('HUMAN', 'human', _human, '%')}
      ${slider('SWING', 'swing', _swing, '%')}
    </div>
  </div>`;
}

// ── M03 EFFECTS ───────────────────────────────────────────────────────────────
function buildEffects() {
  return `<div class="effects-body">
    ${slider('REVERB', 'reverb', 28, '%')}
    ${sliderDivs('DELAY', 'delay', 22, '%', ['1/8','1/4','1/2'], _delayDiv)}
    ${slider('SIDECHAIN', 'sidechain', 52, '%')}
    ${slider('DIST · BSS', 'dist', 8, '%')}
  </div>`;
}

// ── M04 MIX ───────────────────────────────────────────────────────────────────
function buildMix() {
  const faders = MIX_LABELS.map((l, i) => {
    const trackKey = MIX_TRACKS[i];
    const muted = PatternStore.muted[trackKey] ?? false;
    const capTop = (1 - MIX_LEVELS[i]) * 100;
    return `<div class="fader-col" data-fader="${i}" data-track="${trackKey}">
      <div class="fader-track">
        <div class="fader-cap" style="top:${capTop}%"></div>
        <div class="fader-vu" data-vu="${i}" style="height:0%"></div>
      </div>
      <div class="fader-label">${l}</div>
      <div class="fader-mute ${muted ? 'on' : ''}" data-mute="${trackKey}"></div>
    </div>`;
  }).join('');
  return `<div class="mix-body">
    <div class="mix-head"><span>7 CH</span><span>MASTER <span class="master-val">85%</span></span></div>
    <div class="mix-faders">${faders}</div>
  </div>`;
}

// ── M05 HARMONY ───────────────────────────────────────────────────────────────
function buildHarmony() {
  const qualities = ['maj','min','7','maj7','sus2'];

  let cofDots = '', cofLabels = '';
  COF_ORDER.forEach((note, i) => {
    const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(ang) * 130, y = Math.sin(ang) * 130;
    const lx = Math.cos(ang) * 152, ly = Math.sin(ang) * 152;
    const sel = note === _root;
    cofDots   += `<circle class="cof-dot" data-note="${note}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${sel ? 5 : 3}" fill="${sel ? '#E8000D' : '#F0F0F0'}" style="cursor:pointer"/>`;
    cofLabels += `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-size="9" letter-spacing="1" fill="${sel ? '#F0F0F0' : 'rgba(240,240,240,0.55)'}">${note}</text>`;
  });

  const ivs = INTERVALS[_quality] || INTERVALS.maj;
  const rootIdx = CHROMATIC.indexOf(_root);
  const polyPts = ivs.map(iv => {
    const note = CHROMATIC[(rootIdx + iv) % 12];
    const cofIdx = COF_ORDER.indexOf(note);
    const ang = (cofIdx / 12) * Math.PI * 2 - Math.PI / 2;
    return `${(Math.cos(ang) * 130).toFixed(1)},${(Math.sin(ang) * 130).toFixed(1)}`;
  }).join(' ');

  const tlHTML = SynthPattern.slots.map((slot, i) => {
    const isEmpty = slot.root === null;
    const isCurrent = i === SynthPattern.currentSlotIndex;
    if (isEmpty) return `<div class="tl-slot empty" data-slot="${i}">+</div>`;
    return `<div class="tl-slot ${isCurrent ? 'active current' : ''}" data-slot="${i}">${slot.root} ${slot.quality}</div>`;
  }).join('');

  return `<div class="harmony-body">
    <div class="harmony-qualities">
      <div class="label">QUALITY</div>
      ${qualities.map(q => `<div class="chip ${q === _quality ? 'active' : ''}" data-q="${q}">${q.toUpperCase()}</div>`).join('')}
    </div>
    <div class="harmony-wheel">
      <svg viewBox="-180 -180 360 360" preserveAspectRatio="xMidYMid meet">
        <circle r="130" fill="none" stroke="rgba(232,0,13,0.18)" stroke-width="0.8"/>
        <circle r="106" fill="none" stroke="rgba(232,0,13,0.10)" stroke-width="0.6" stroke-dasharray="2 4"/>
        <g>${cofLabels}</g>
        <g>${cofDots}</g>
        <polygon points="${polyPts}" fill="none" stroke="#E8000D" stroke-width="1.3"/>
        <text x="0" y="-6" text-anchor="middle" font-family="'Barlow Condensed',sans-serif" font-size="48" font-weight="700" fill="#F0F0F0">${_root}</text>
        <text x="0" y="16" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-size="11" letter-spacing="3" fill="#E8000D">${_quality.toUpperCase()}</text>
      </svg>
    </div>
    <div class="harmony-timeline">
      <div class="label">TIMELINE</div>
      ${tlHTML}
    </div>
  </div>`;
}

// ── M06 BASS ──────────────────────────────────────────────────────────────────
function buildBass() {
  const actIdx  = BassPattern.activePattern;
  const pendIdx = BassPattern._pendingPattern;
  const chain   = BassPattern._chain;
  const chainStr = chain.length > 0
    ? `[${chain.map(p => String(p + 1).padStart(2,'0')).join('→')}]`
    : '—';
  const meta = BassPattern.currentMeta;
  const styleLabel = { house:'HSE', acid:'ACD', bridge:'BRG', techno:'TCH', hard:'RVE' }[meta.style] ?? 'HSE';

  let cells = '';
  BASS_STYLE_NAMES.forEach((style, row) => {
    const count = BASS_STYLE_COUNTS[row];
    const offset = BASS_ROW_OFFSETS[row];
    for (let c = 0; c < 8; c++) {
      const idx = offset + c;
      const disabled = c >= count;
      const isOn = idx === actIdx;
      const isPending = idx === pendIdx;
      const inChain = chain.includes(idx);
      const cls = 'bass-cell'
        + (disabled ? ' disabled' : '')
        + (isOn ? ' on' : '')
        + (isPending ? ' queued' : '')
        + (inChain && !isOn ? ' chain' : '');
      cells += disabled
        ? `<div class="${cls}"></div>`
        : `<div class="${cls}" data-bass="${idx}"></div>`;
    }
  });

  return `<div class="bass-body">
    <div style="display:flex;justify-content:space-between">
      <span>30 PATTERNS · CHAIN ${chainStr}</span>
      <span style="color:var(--accent)">${styleLabel} · pat ${String(actIdx + 1).padStart(2,'0')}/30</span>
    </div>
    <div class="bass-grid">
      <div class="bass-style-col">${BASS_STYLE_NAMES.map(s => `<span>${s}</span>`).join('')}</div>
      <div class="bass-pats">${cells}</div>
    </div>
    <div class="bass-filters">
      ${slider('CUT', 'bassCut', 60, ' Hz')}
      ${slider('RES', 'bassRes', 10, '')}
      ${slider('ENV', 'bassEnv', 70, '')}
      ${slider('DEC', 'bassDec', 60, ' s')}
    </div>
  </div>`;
}

// ── M07 ARP ───────────────────────────────────────────────────────────────────
function buildArp() {
  const chips = ARP_PRESETS.map((p, i) => {
    const isActive = i === ArpSeq.activePreset;
    const isQueued = i === ArpSeq.pendingPreset;
    return `<div class="arp-chip ${isActive ? 'active' : ''} ${isQueued ? 'queued' : ''}" data-arp="${i}">${p.label}</div>`;
  });
  chips.push('<div></div>');
  return `<div class="arp-body"><div class="arp-grid">${chips.join('')}</div></div>`;
}

// ── M08 TRANSPORT ─────────────────────────────────────────────────────────────
function buildTransport() {
  const playing = Transport.isPlaying;
  return `<div class="transport-body">
    <div class="transport-main">
      <button class="btn-big primary" id="btn-play">▶ ${playing ? 'PLAYING' : 'PLAY'}</button>
      <button class="btn-big compact" id="btn-stop">■ STOP</button>
      <button class="btn-big compact" id="btn-reset">↺ RESET</button>
    </div>
    <div class="transport-foot">
      <span>SR <span class="v">48000</span></span>
      <span>BUF <span class="v">256</span></span>
      <span>LAT <span class="v">5.3 ms</span></span>
    </div>
  </div>`;
}

// ── Partial re-renders ─────────────────────────────────────────────────────────
function rerenderBonesDots() {
  const g = document.getElementById('bones-dots');
  if (g) g.innerHTML = buildBonesDots();
}

function rerenderBones() {
  const el = _view?.querySelector('.m-bones .panel-body');
  if (el) el.innerHTML = buildBones();
}

function rerenderHarmony() {
  const el = _view?.querySelector('.m-harmony .panel-body');
  if (el) el.innerHTML = buildHarmony();
}

function rerenderBass() {
  const el = _view?.querySelector('.m-bass .panel-body');
  if (el) el.innerHTML = buildBass();
  const ro = _view?.querySelector('[data-readout="h-bass"]');
  if (ro) ro.textContent = `${({ house:'HSE', acid:'ACD', bridge:'BRG', techno:'TCH', hard:'RVE' }[BassPattern.currentMeta.style] ?? '---')}·${String(BassPattern.activePattern + 1).padStart(2,'0')}`;
}

function rerenderArp() {
  const el = _view?.querySelector('.m-arp .panel-body');
  if (el) el.innerHTML = buildArp();
  const cur = _view?.querySelector('[data-readout="h-arp-cur"]');
  if (cur) cur.textContent = ARP_PRESETS[ArpSeq.activePreset]?.label ?? 'OFF';
  const nxt = _view?.querySelector('[data-readout="h-arp-next"]');
  if (nxt) nxt.textContent = ArpSeq.pendingPreset >= 0 ? (ARP_PRESETS[ArpSeq.pendingPreset]?.label ?? '') + '»' : '—';
}

// ── Interaction binding ────────────────────────────────────────────────────────
let _dragSlider = null, _dragFader = null;

function bindInteractions(root) {
  root.addEventListener('click', e => {
    // Step dot
    const dot = e.target.closest('.step-dot');
    if (dot) { PatternStore.toggleStep(dot.dataset.track, +dot.dataset.step); return; }
    // Pattern A/B/C/D
    const pat = e.target.closest('[data-pat]');
    if (pat) {
      PatternStore.queuePattern(pat.dataset.pat);
      root.querySelectorAll('[data-pat]').forEach(b => b.classList.toggle('active', b.dataset.pat === pat.dataset.pat));
      const ro = root.querySelector('[data-readout="h-pat"]');
      if (ro) ro.textContent = pat.dataset.pat;
      return;
    }
    // Steps
    const stp = e.target.closest('[data-steps]');
    if (stp) {
      const n = +stp.dataset.steps;
      PatternStore.setPatternSteps(PatternStore.activePattern, n);
      root.querySelectorAll('[data-steps]').forEach(b => b.classList.toggle('active', +b.dataset.steps === n));
      const ro = root.querySelector('[data-readout="h-steps"]');
      if (ro) ro.textContent = n;
      return;
    }
    // BPM ±
    const bb = e.target.closest('[data-bpm]');
    if (bb) {
      PatternStore.setBPM(PatternStore.getBPM() + +bb.dataset.bpm);
      const d = document.getElementById('bpm-display');
      if (d) d.textContent = PatternStore.getBPM();
      const ro = root.querySelector('[data-readout="h-bpm"]');
      if (ro) ro.textContent = PatternStore.getBPM();
      document.getElementById('s-bpm').textContent = PatternStore.getBPM();
      return;
    }
    // Seed NEW
    if (e.target.id === 'seed-new') {
      _seed = 1000 + Math.floor(Math.random() * 9000);
      EventBus.emit('seed:change', { seed: _seed });
      const d = document.getElementById('seed-display');
      if (d) d.textContent = _seed;
      const ss = document.getElementById('s-seed');
      if (ss) ss.textContent = _seed;
      return;
    }
    // Delay div
    const dd = e.target.closest('[data-div]');
    if (dd) {
      _delayDiv = dd.dataset.div;
      const beats = _delayDiv === '1/8' ? 0.5 : _delayDiv === '1/4' ? 1 : 2;
      EventBus.emit('fx:delay-time', { beats });
      root.querySelectorAll('[data-div]').forEach(b => b.classList.toggle('active', b.dataset.div === _delayDiv));
      return;
    }
    // Mute
    const mute = e.target.closest('[data-mute]');
    if (mute) { PatternStore.toggleMute(mute.dataset.mute); return; }
    // COF dot
    const cofDot = e.target.closest('.cof-dot');
    if (cofDot) {
      _root = cofDot.dataset.note;
      EventBus.emit('chord:change', { root: _root, quality: _quality });
      rerenderHarmony();
      return;
    }
    // Quality chip
    const qc = e.target.closest('[data-q]');
    if (qc) {
      _quality = qc.dataset.q;
      EventBus.emit('chord:change', { root: _root, quality: _quality });
      rerenderHarmony();
      return;
    }
    // Timeline slot
    const slot = e.target.closest('[data-slot]');
    if (slot) {
      const idx = +slot.dataset.slot;
      if (slot.classList.contains('empty')) {
        SynthPattern.pen.root    = _root;
        SynthPattern.pen.quality = _quality;
        SynthPattern.fillSlot(idx);
      } else {
        const s = SynthPattern.slots[idx];
        if (s.root) {
          _root = s.root; _quality = s.quality;
          EventBus.emit('chord:change', { root: _root, quality: _quality });
          rerenderHarmony();
        }
      }
      return;
    }
    // Bass cell
    const bc = e.target.closest('[data-bass]');
    if (bc) { BassPattern.queuePattern(+bc.dataset.bass); rerenderBass(); return; }
    // Arp chip
    const ac = e.target.closest('[data-arp]');
    if (ac) { ArpSeq.queuePreset(+ac.dataset.arp); rerenderArp(); return; }
    // Transport
    if (e.target.id === 'btn-play')  { EventBus.emit('ui:play');  return; }
    if (e.target.id === 'btn-stop')  { EventBus.emit('ui:stop');  return; }
    if (e.target.id === 'btn-reset') { EventBus.emit('ui:reset'); return; }
  });

  // Timeline double-click → clear slot
  root.addEventListener('dblclick', e => {
    const slot = e.target.closest('[data-slot]');
    if (slot && !slot.classList.contains('empty')) {
      SynthPattern.clearSlot(+slot.dataset.slot);
      rerenderHarmony();
    }
    const bc = e.target.closest('[data-bass]');
    if (bc) { BassPattern.toggleChain(+bc.dataset.bass); rerenderBass(); }
  });

  // Sliders — delegated mousedown on root
  root.addEventListener('mousedown', e => {
    const track = e.target.closest('.slider .track');
    if (track) { _dragSlider = track; onSliderMove(track, e.clientX); return; }
    const faderEl = e.target.closest('.fader-track');
    if (faderEl) { _dragFader = faderEl; onFaderMove(faderEl, e.clientY); }
  });
  window.addEventListener('mousemove', e => {
    if (_dragSlider) onSliderMove(_dragSlider, e.clientX);
    if (_dragFader)  onFaderMove(_dragFader, e.clientY);
  });
  window.addEventListener('mouseup', () => { _dragSlider = null; _dragFader = null; });
}

function onSliderMove(track, clientX) {
  const rect = track.getBoundingClientRect();
  if (!rect.width) return;
  const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  const fill = track.querySelector('.fill');
  const knob = track.querySelector('.knob');
  const val  = track.closest('.slider')?.querySelector('.val');
  if (fill) fill.style.width = pct + '%';
  if (knob) knob.style.left  = pct + '%';
  const key  = track.closest('.slider')?.dataset.slider;
  const unit = val?.textContent.match(/[^0-9.\-]+$/)?.[0] ?? '';
  if (val) val.textContent = Math.round(pct) + unit;
  onSliderValue(key, pct);
}

function onSliderValue(key, pct) {
  if (key === 'human')    { _human = Math.round(pct); EventBus.emit('human:change', { value: pct / 100 }); }
  else if (key === 'swing')    { _swing = Math.round(pct); EventBus.emit('swing:change', { value: pct / 100 }); }
  else if (key === 'reverb')   { EventBus.emit('fx:reverb',   { mix: pct / 100 }); }
  else if (key === 'delay')    { EventBus.emit('fx:delay',    { mix: pct / 100 }); }
  else if (key === 'sidechain'){ EventBus.emit('fx:sidechain',{ amount: pct / 100 }); }
  else if (key === 'dist')     { EventBus.emit('bass:dist',   { amount: pct / 100 }); }
}

function onFaderMove(faderEl, clientY) {
  const col  = faderEl.closest('.fader-col');
  if (!col) return;
  const rect = faderEl.getBoundingClientRect();
  const lvl  = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
  const cap  = faderEl.querySelector('.fader-cap');
  if (cap) cap.style.top = (1 - lvl) * 100 + '%';
  const trackKey = col.dataset.track;
  const i = +col.dataset.fader;
  MIX_LEVELS[i] = lvl;
  EventBus.emit('mixer:volume', { track: trackKey, value: lvl });
}

// ── EventBus bindings ─────────────────────────────────────────────────────────
function bindEventBus() {
  EventBus.on('pattern:update',  () => rerenderBonesDots());
  EventBus.on('pattern:reset',   () => rerenderBones());
  EventBus.on('pattern:changed', () => rerenderBones());
  EventBus.on('pattern:length',  () => rerenderBones());

  EventBus.on('synth:pattern:changed', () => rerenderHarmony());
  EventBus.on('bass:pattern',          () => rerenderBass());
  EventBus.on('bass:pending',          () => rerenderBass());
  EventBus.on('bass:chain',            () => rerenderBass());
  EventBus.on('arp:pending',           () => rerenderArp());
  EventBus.on('arp:active',            () => rerenderArp());

  EventBus.on('track:mute', ({ track, muted }) => {
    _view?.querySelectorAll(`[data-mute="${track}"]`).forEach(el => el.classList.toggle('on', muted));
  });
  EventBus.on('transport:start', () => {
    const btn = document.getElementById('btn-play');
    if (btn) btn.textContent = '▶ PLAYING';
  });
  EventBus.on('transport:stop', () => {
    const btn = document.getElementById('btn-play');
    if (btn) btn.textContent = '▶ PLAY';
  });

  // Envelope tracking for VU bars
  EventBus.on('drum:trigger', ({ track }) => { _env[track] = 1.0; });
  EventBus.on('bass:note',    ()          => { _env.bass   = 0.85; });
  EventBus.on('synth:step',   ()          => { _env.synth  = 0.65; });

  // Bar / loop display in BONES panel
  let _loopCounter = 0;
  EventBus.on('transport:tick', ({ step, steps, time }) => {
    _lastTickTime = time;
    if (step === 0) _loopCounter++;
    const stepsPerBeat = Math.max(1, steps / 4);
    const beat = Math.floor(step / stepsPerBeat) + 1;
    const bnBar  = document.getElementById('bn-bar');
    const bnLoop = document.getElementById('bn-loop');
    if (bnBar)  bnBar.textContent  = _loopCounter + '.' + beat + '/4';
    if (bnLoop) bnLoop.textContent = _loopCounter;
  });
}

// ── Public API ────────────────────────────────────────────────────────────────
const ComposeView = {
  init(root, initSeed) {
    _view = root;
    _seed = initSeed;

    const arpLabel = ARP_PRESETS[ArpSeq.activePreset]?.label ?? 'OFF';
    const bassStyle = { house:'HSE', acid:'ACD', bridge:'BRG', techno:'TCH', hard:'RVE' }[BassPattern.currentMeta.style] ?? 'HSE';

    root.innerHTML = `<div class="compose-grid">
      ${panel({ num:'01', name:'BONES',
        readouts:[{label:'PAT',value:PatternStore.activePattern,id:'h-pat'},{label:'STEPS',value:PatternStore.getSteps(),id:'h-steps'}],
        cornerBL:'5 TRK', cornerBR:'POLAR', body:buildBones(), klass:'m-bones' })}
      ${panel({ num:'02', name:'TEMPO',
        readouts:[{label:'BPM',value:PatternStore.getBPM(),id:'h-bpm'}],
        body:buildTempo(), klass:'m-tempo' })}
      ${panel({ num:'03', name:'EFFECTS',
        readouts:[{label:'4 CTRL'}],
        body:buildEffects(), klass:'m-effects' })}
      ${panel({ num:'04', name:'MIX',
        readouts:[{label:'7 CH'}],
        body:buildMix(), klass:'m-mix' })}
      ${panel({ num:'05', name:'HARMONY',
        readouts:[{label:'ARP',value:arpLabel,id:'h-arp'}],
        cornerBL:'CIRCLE OF FIFTHS',
        body:buildHarmony(), klass:'m-harmony' })}
      ${panel({ num:'06', name:'BASS 303',
        readouts:[{label:'PAT',value:`${bassStyle}·${String(BassPattern.activePattern+1).padStart(2,'0')}`,id:'h-bass'}],
        body:buildBass(), klass:'m-bass' })}
      ${panel({ num:'07', name:'ARP',
        readouts:[{label:'CUR',value:arpLabel,id:'h-arp-cur'},{label:'NEXT',value:'—',id:'h-arp-next'}],
        body:buildArp(), klass:'m-arp' })}
      ${panel({ num:'08', name:'TRANSPORT',
        readouts:[{label:'LIVE'}],
        body:buildTransport(), klass:'m-transport' })}
    </div>`;

    bindInteractions(root);
    bindEventBus();
  },

  frame() {
    // Smooth playhead needle
    const needle = document.getElementById('bones-needle');
    if (needle) {
      const steps = PatternStore.getSteps();
      if (Transport.isPlaying && AudioEngine.ctx) {
        const stepDur = 60 / PatternStore.getBPM() / 4;
        const elapsed = Math.min(
          Math.max(0, AudioEngine.ctx.currentTime - _lastTickTime),
          stepDur
        );
        const stepF = (Transport.currentStep + elapsed / stepDur) % steps;
        const ang = (stepF / steps) * Math.PI * 2 - Math.PI / 2;
        needle.setAttribute('x2', (Math.cos(ang) * 245).toFixed(1));
        needle.setAttribute('y2', (Math.sin(ang) * 245).toFixed(1));
      }
    }

    // VU bars — decay envelopes and update DOM
    const vuEls = document.querySelectorAll('.fader-vu[data-vu]');
    vuEls.forEach(vu => {
      const i = +vu.dataset.vu;
      const t = MIX_TRACKS[i];
      _env[t] = (_env[t] || 0) * 0.88;
      vu.style.height = Math.max(0, _env[t] * 82) + '%';
    });
  },
};

export default ComposeView;
