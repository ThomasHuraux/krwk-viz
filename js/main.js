import EventBus       from './EventBus.js';
import Geometry       from './layout/Geometry.js';
import AudioEngine    from './audio/AudioEngine.js';
import FXBus          from './audio/FXBus.js';
import SynthEngine    from './audio/SynthEngine.js';
import PatternStore   from './sequencer/PatternStore.js';
import Transport      from './sequencer/Transport.js';
import TemporalMemory from './sequencer/TemporalMemory.js';
import Humanizer      from './sequencer/Humanizer.js';
import ArpSeq         from './sequencer/ArpSeq.js';
import SynthPattern   from './sequencer/SynthPattern.js';
import BassPattern    from './sequencer/BassPattern.js';
import BassEngine     from './audio/BassEngine.js';
import StepGrid          from './ui/StepGrid.js';
import HumanColumn       from './ui/HumanColumn.js';
import EffectsPanel      from './ui/EffectsPanel.js';
import MixPanel          from './ui/MixPanel.js';
import PatternSelector   from './ui/PatternSelector.js';
import ArpControls       from './ui/ArpControls.js';
import BassControls      from './ui/BassControls.js';
import BassPatternBrowser from './ui/BassPatternBrowser.js';
import EuclideanPanel    from './ui/EuclideanPanel.js';
import VisuCanvas        from './visu/VisuCanvas.js';
import ChordWheel        from './ui/ChordWheel.js';
import RackVisu          from './visu/RackVisu.js';

const AppState = {
  state: 'idle',
  set(s) {
    this.state = s;
    document.body.dataset.appState = s;
  }
};

async function boot() {
  Geometry.update();

  TemporalMemory.init();
  Humanizer.init(HumanColumn.getSeed());
  FXBus.listen();
  SynthEngine.listen();
  BassEngine.listen();
  ArpSeq.listen();
  SynthPattern.listen();
  BassPattern.listen();

  VisuCanvas.init(document.getElementById('visu'));
  ChordWheel.init(document.getElementById('chord-wheel'));

  // UI panels — each mounted in its panel-body
  StepGrid.init(document.getElementById('sequencer'));
  HumanColumn.init(document.getElementById('human-controls'));
  EffectsPanel.init(document.getElementById('effects-controls'));
  MixPanel.init(document.getElementById('mix-controls'));
  PatternSelector.init(document.getElementById('pattern-selector'));
  ArpControls.init(document.getElementById('arp-controls-mount'));
  BassPatternBrowser.init(document.getElementById('bass-browser-mount'));
  BassControls.init(document.getElementById('bass-controls-mount'));
  EuclideanPanel.init(document.getElementById('euc-panel-mount'));

  // Transport controls
  const btnPlay  = document.getElementById('btn-play');
  const btnStop  = document.getElementById('btn-stop');
  const btnReset = document.getElementById('btn-reset');

  btnPlay.addEventListener('click', async () => {
    if (!AudioEngine.ctx) {
      await AudioEngine.init();
      SynthEngine.init(AudioEngine.ctx, AudioEngine.getMasterGain());
      BassEngine.init(AudioEngine.ctx, AudioEngine.getMasterGain());
    } else if (AudioEngine.ctx.state === 'suspended') {
      await AudioEngine.ctx.resume();
    }
    Transport.start();
    AppState.set('playing');
  });

  btnStop.addEventListener('click', () => {
    Transport.stop();
    AppState.set('stopped');
  });

  btnReset.addEventListener('click', () => {
    PatternStore.reset();
    TemporalMemory.reset();
  });

  // Theme toggle (3 states: dark → amber → green → dark)
  const THEME_CYCLE  = ['dark', 'amber', 'green'];
  const THEME_LABELS = { dark: 'LGT', amber: 'AMB', green: 'GRN' };
  const btnTheme = document.getElementById('btn-theme');
  const applyTheme = t => {
    document.body.dataset.theme = t;
    btnTheme.textContent = THEME_LABELS[t] ?? 'LGT';
    btnTheme.classList.toggle('active', t !== 'dark');
    localStorage.setItem('krwk-theme', t);
    EventBus.emit('theme:change', { palette: t === 'dark' ? 'white' : t });
  };
  const savedTheme = localStorage.getItem('krwk-theme') ?? 'dark';
  applyTheme(THEME_CYCLE.includes(savedTheme) ? savedTheme : 'dark');
  btnTheme.addEventListener('click', () => {
    const cur  = document.body.dataset.theme;
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(cur) + 1) % THEME_CYCLE.length];
    applyTheme(next);
  });

  // Mixer routing
  EventBus.on('mixer:volume', ({ track, value }) => {
    if (['kick','snare','clap','hihat','hihat_open'].includes(track)) {
      AudioEngine.drumSynth?.setTrackVolume(track, value);
    }
  });

  // Fullscreen
  const btnFs = document.getElementById('btn-fullscreen');
  btnFs.addEventListener('click', () => {
    document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
  });
  document.addEventListener('fullscreenchange', () => {
    btnFs.textContent = document.fullscreenElement ? 'EXIT' : 'FULL';
    btnFs.classList.toggle('active', !!document.fullscreenElement);
    Geometry.update();
  });

  // Step length selector
  document.querySelectorAll('.length-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const steps = parseInt(btn.dataset.steps, 10);
      PatternStore.setPatternSteps(PatternStore.activePattern, steps);
      document.querySelectorAll('.length-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Update bones-meta
      const meta = document.getElementById('bones-meta');
      if (meta) meta.textContent = `${steps} STEPS · 5 TRK · PATTERN ${PatternStore.activePattern.toUpperCase()}`;
    });
  });

  const syncLengthBtns = () => {
    const s = PatternStore.getSteps();
    document.querySelectorAll('.length-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.steps, 10) === s);
    });
  };
  EventBus.on('pattern:changed', syncLengthBtns);

  // Capture
  document.getElementById('btn-capture').addEventListener('click', () => _capture());
  document.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); _capture(); } });

  function _capture() {
    AppState.set('capture');
    const canvas  = document.getElementById('visu');
    const bpm     = PatternStore.getBPM();
    const seed    = String(HumanColumn.getSeed()).padStart(4, '0');
    const chord   = `${VisuCanvas.currentChord.root}${VisuCanvas.currentChord.quality}`.replace('#', 's');
    const now     = new Date();
    const ts      = `${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}m${String(now.getSeconds()).padStart(2,'0')}s`;
    const filename = `KRWK-VIZ_BPM${bpm}_SEED${seed}_${chord}_${ts}.png`;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const link    = document.createElement('a');
    link.download = filename;
    link.href     = canvas.toDataURL('image/png');
    link.click();

    setTimeout(() => AppState.set(Transport.isPlaying ? 'playing' : 'stopped'), 150);
  }

  // Mode switching — COMPOSE ↔ VIZU
  function setMode(mode) {
    document.body.dataset.mode = mode;
    const brandMode = document.getElementById('brand-mode');
    if (brandMode) brandMode.textContent = mode.toUpperCase();
    if (mode === 'vizu') RackVisu.start();
    else RackVisu.stop();
  }

  document.getElementById('btn-vizu').addEventListener('click',       () => setMode('vizu'));
  document.getElementById('btn-vizu-inner').addEventListener('click', () => setMode('vizu'));
  document.getElementById('btn-compose').addEventListener('click',    () => setMode('compose'));
  document.addEventListener('keydown', e => {
    if (e.code === 'Tab') {
      e.preventDefault();
      setMode(document.body.dataset.mode === 'vizu' ? 'compose' : 'vizu');
    }
  });

  EventBus.on('seed:change', () => {
    const canvas = document.getElementById('visu');
    const ctx    = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(240,240,240,0.07)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  });

  // Pattern selector meta update
  EventBus.on('pattern:changed', () => {
    const meta = document.getElementById('bones-meta');
    if (meta) {
      const s = PatternStore.getSteps();
      meta.textContent = `${s} STEPS · 5 TRK · PATTERN ${PatternStore.activePattern.toUpperCase()}`;
    }
  });

  // Live indicator
  EventBus.on('ui:step', () => {
    const dot = document.getElementById('live-indicator');
    if (dot) dot.classList.add('blink');
    setTimeout(() => dot?.classList.remove('blink'), 80);
  });
}

boot();
