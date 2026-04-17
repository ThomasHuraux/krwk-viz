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
import StepGrid       from './ui/StepGrid.js';
import HumanColumn    from './ui/HumanColumn.js';
import PatternSelector from './ui/PatternSelector.js';
import ArpControls    from './ui/ArpControls.js';
import BassControls   from './ui/BassControls.js';
import BassPatternBrowser from './ui/BassPatternBrowser.js';
import EuclideanPanel from './ui/EuclideanPanel.js';
import VisuCanvas     from './visu/VisuCanvas.js';
import PulseVisu      from './visu/PulseVisu.js';

// App state — single source of truth for transport status
const AppState = {
  state: 'idle', // idle | playing | stopped
  set(s) {
    this.state = s;
    document.body.dataset.appState = s;
  }
};

async function boot() {
  // Geometry must be computed before anything else renders
  Geometry.update();

  // TemporalMemory listens to EventBus — init before audio + canvas
  TemporalMemory.init();
  Humanizer.init(HumanColumn.getSeed());
  FXBus.listen();
  SynthEngine.listen();
  BassEngine.listen();
  ArpSeq.listen();
  SynthPattern.listen();
  BassPattern.listen();

  // Canvas starts immediately — visual life before any sound
  VisuCanvas.init(document.getElementById('visu'));

  // UI
  StepGrid.init(document.getElementById('sequencer'));
  HumanColumn.init(document.getElementById('human-controls'));
  PulseVisu.init(document.getElementById('hc-pulse'));
  PatternSelector.init(document.getElementById('pattern-selector'));
  ArpControls.init(document.getElementById('arp-controls-mount'));
  BassControls.init(document.getElementById('bass-controls-mount'));
  BassPatternBrowser.init(document.getElementById('bass-browser-mount'));
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
    // keep AppState as-is — reset doesn't stop transport
  });

  // Theme toggle (dark ↔ light)
  const btnTheme = document.getElementById('btn-theme');
  const applyTheme = t => {
    document.body.dataset.theme = t;
    btnTheme.textContent = t === 'light' ? 'DRK' : 'LGT';
    btnTheme.classList.toggle('active', t === 'light');
    localStorage.setItem('krwk-theme', t);
  };
  applyTheme(localStorage.getItem('krwk-theme') ?? 'dark');
  btnTheme.addEventListener('click', () => {
    applyTheme(document.body.dataset.theme === 'light' ? 'dark' : 'light');
  });

  // Mixer volume routing (before audio init — values are stored by each engine)
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

  // Step length selector — 8 / 12 / 16 / 32
  document.querySelectorAll('.length-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const steps = parseInt(btn.dataset.steps, 10);
      PatternStore.setPatternSteps(PatternStore.activePattern, steps);
      document.querySelectorAll('.length-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Sync length buttons when pattern changes
  const syncLengthBtns = () => {
    const s = PatternStore.getSteps();
    document.querySelectorAll('.length-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.steps, 10) === s);
    });
  };
  EventBus.on('pattern:changed', syncLengthBtns);

  // CAPTURE — export canvas PNG with full metadata in filename
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

    // Flash white on canvas
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const link    = document.createElement('a');
    link.download = filename;
    link.href     = canvas.toDataURL('image/png');
    link.click();

    // Restore app state after capture flash
    setTimeout(() => AppState.set(Transport.isPlaying ? 'playing' : 'stopped'), 150);
  }

  // NEW SEED — visual flash on the canvas
  EventBus.on('seed:change', () => {
    const canvas = document.getElementById('visu');
    const ctx    = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(240,240,240,0.07)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  });
}

boot();
