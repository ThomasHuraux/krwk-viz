import EventBus       from './EventBus.js';
import AudioEngine    from './audio/AudioEngine.js';
import FXBus          from './audio/FXBus.js';
import SynthEngine    from './audio/SynthEngine.js';
import BassEngine     from './audio/BassEngine.js';
import PatternStore   from './sequencer/PatternStore.js';
import Transport      from './sequencer/Transport.js';
import TemporalMemory from './sequencer/TemporalMemory.js';
import Humanizer      from './sequencer/Humanizer.js';
import ArpSeq         from './sequencer/ArpSeq.js';
import SynthPattern   from './sequencer/SynthPattern.js';
import BassPattern    from './sequencer/BassPattern.js';
import ComposeView    from './ui/ComposeView.js';
import RackVisu       from './visu/RackVisu.js';
import MidiInput      from './midi/MidiInput.js';

const INIT_SEED = 4011;

async function ensureAudio() {
  if (!AudioEngine.ctx) {
    await AudioEngine.init();
    SynthEngine.init(AudioEngine.ctx, AudioEngine.getMasterGain());
    BassEngine.init(AudioEngine.ctx, AudioEngine.getMasterGain());
  } else if (AudioEngine.ctx.state === 'suspended') {
    await AudioEngine.ctx.resume();
  }
}

function boot() {
  // Audio module wiring (no side effects until ensureAudio())
  TemporalMemory.init();
  Humanizer.init(INIT_SEED);
  FXBus.listen();
  SynthEngine.listen();
  BassEngine.listen();
  ArpSeq.listen();
  SynthPattern.listen();
  BassPattern.listen();

  // UI
  const viewCompose = document.getElementById('view-compose');
  const viewVizu    = document.getElementById('view-vizu');
  ComposeView.init(viewCompose, INIT_SEED);
  RackVisu.init(viewVizu);
  RackVisu.start();

  // ── Mode switching ───────────────────────────────────────────────
  function setMode(mode) {
    document.body.dataset.mode = mode;
    const pill = document.getElementById('mode-pill');
    if (pill) pill.textContent = mode.toUpperCase();
  }

  document.getElementById('mode-pill')?.addEventListener('click', () => {
    setMode(document.body.dataset.mode === 'vizu' ? 'compose' : 'vizu');
  });

  document.addEventListener('keydown', e => {
    if (e.code === 'Tab' || e.code === 'KeyV') {
      e.preventDefault();
      setMode(document.body.dataset.mode === 'vizu' ? 'compose' : 'vizu');
    } else if (e.code === 'Space') {
      e.preventDefault();
      if (Transport.isPlaying) EventBus.emit('ui:stop');
      else EventBus.emit('ui:play');
    }
  });

  // ── Transport ────────────────────────────────────────────────────
  EventBus.on('ui:play', async () => {
    await ensureAudio();
    Transport.start();
  });

  EventBus.on('ui:stop', () => Transport.stop());

  EventBus.on('ui:reset', () => {
    PatternStore.reset();
    TemporalMemory.reset();
  });

  // ── Mixer routing (drum synth gain per channel) ──────────────────
  EventBus.on('mixer:volume', ({ track, value }) => {
    if (['kick','snare','clap','hihat','hihat_open'].includes(track)) {
      AudioEngine.drumSynth?.setTrackVolume(track, value);
    }
  });

  // ── Status strip (top bar) ───────────────────────────────────────
  let _loopCount = 0;

  EventBus.on('transport:tick', ({ step, steps }) => {
    if (step === 0) _loopCount++;

    const stepsPerBeat = Math.max(1, steps / 4);
    const beat = Math.floor(step / stepsPerBeat) + 1;

    const sBpm  = document.getElementById('s-bpm');
    const sBar  = document.getElementById('s-bar');
    const sLoop = document.getElementById('s-loop');
    if (sBpm)  sBpm.textContent  = PatternStore.getBPM();
    if (sBar)  sBar.textContent  = _loopCount + '.' + beat;
    if (sLoop) sLoop.textContent = _loopCount;

    // Live dot flash on every quarter note
    if (step % 4 === 0) {
      const dot = document.getElementById('live-dot');
      if (dot) {
        dot.style.opacity = '1';
        setTimeout(() => { if (dot) dot.style.opacity = ''; }, 80);
      }
    }
  });

  EventBus.on('transport:stop', () => {
    _loopCount = 0;
    const sBar  = document.getElementById('s-bar');
    const sLoop = document.getElementById('s-loop');
    if (sBar)  sBar.textContent  = '1.1';
    if (sLoop) sLoop.textContent = '0';
  });

  // ── MIDI ─────────────────────────────────────────────────────────
  MidiInput.init().catch(() => {});

  // ── ComposeView animation frame ──────────────────────────────────
  function frame() {
    ComposeView.frame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
