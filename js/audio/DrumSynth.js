import EventBus from '../EventBus.js';

export default class DrumSynth {
  constructor(ctx, destination, fxBus = null) {
    this.ctx          = ctx;
    this.destination  = destination;
    this.fxBus        = fxBus;
    this._humanAmount = 0;

    EventBus.on('human:change', ({ value }) => { this._humanAmount = value; });

    // Persistent per-track gain nodes — mixer control point
    this.trackGains = {};
    ['kick', 'snare', 'clap', 'hihat', 'hihat_open'].forEach(track => {
      const g = ctx.createGain();
      g.gain.value = 1.0;
      g.connect(destination);
      if (fxBus) {
        const { reverb, delay } = fxBus.getSends(track);
        g.connect(reverb);
        g.connect(delay);
      }
      this.trackGains[track] = g;
    });

    // Pre-computed soft-limiter for the kick
    this._kickLimitCurve = this._buildKickLimitCurve();
  }

  trigger(track, time, step = 0) {
    switch (track) {
      case 'kick':       this._kick(time);               break;
      case 'snare':      this._snare(time);              break;
      case 'clap':       this._clap(time);               break;
      case 'hihat':      this._hihat(time, false, step); break;
      case 'hihat_open': this._hihat(time, true,  step); break;
    }
  }

  // Route trigger gain through persistent track gain (mixer)
  _connect(gainNode, track) {
    gainNode.connect(this.trackGains[track] ?? this.destination);
  }

  setTrackVolume(track, value) {
    const g = this.trackGains[track];
    if (!g) return;
    g.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), this.ctx.currentTime, 0.01);
  }

  _kick(time) {
    const { ctx } = this;
    const T = time;

    // ── 1. TRANSIENT — click noise bref 0–6ms ────────────────────────────────
    const clickSrc  = ctx.createBufferSource();
    clickSrc.buffer = this._whiteNoise(0.006);

    const clickFlt           = ctx.createBiquadFilter();
    clickFlt.type            = 'bandpass';
    clickFlt.frequency.value = 2400;
    clickFlt.Q.value         = 0.8;

    const clickEnv = ctx.createGain();
    clickEnv.gain.setValueAtTime(0, T);
    clickEnv.gain.linearRampToValueAtTime(0.75, T + 0.0005);
    clickEnv.gain.exponentialRampToValueAtTime(0.001, T + 0.006);

    clickSrc.connect(clickFlt);
    clickFlt.connect(clickEnv);

    // ── 2. BODY — sawtooth 320→48 Hz (0–80 ms) ──────────────────────────────
    // Start lowered to 320 Hz (was 420): warmer, less harsh.
    const bodyOsc  = ctx.createOscillator();
    bodyOsc.type   = 'sawtooth';
    bodyOsc.frequency.setValueAtTime(320, T);
    bodyOsc.frequency.exponentialRampToValueAtTime(48, T + 0.025);

    const bodyEnv = ctx.createGain();
    bodyEnv.gain.setValueAtTime(0, T);
    bodyEnv.gain.linearRampToValueAtTime(0.70, T + 0.001);
    bodyEnv.gain.exponentialRampToValueAtTime(0.001, T + 0.080);
    bodyEnv.gain.setValueAtTime(0, T + 0.080);

    bodyOsc.connect(bodyEnv);

    // Body LP: raised to 220 Hz (was 160) to keep the body warm
    const bodyLP           = ctx.createBiquadFilter();
    bodyLP.type            = 'lowpass';
    bodyLP.frequency.value = 220;
    bodyLP.Q.value         = 0.5;
    bodyEnv.connect(bodyLP);

    // ── 3. SUB — pure sine 90→30 Hz (0–250 ms) — main bass layer ───────────
    // Start freq: 90 Hz (was 72) → more sub punch at attack.
    // End freq: 30 Hz (was 38) → deeper sub, physical body.
    // Decay extended to 250 ms (was 150 ms) → bass holds the groove.
    // Gain 1.40 pre-limiter (was 0.85) → knee at 0.85 clips cleanly.
    const subOsc  = ctx.createOscillator();
    subOsc.type   = 'sine';
    subOsc.frequency.setValueAtTime(90, T);
    subOsc.frequency.exponentialRampToValueAtTime(30, T + 0.025);

    const subEnv = ctx.createGain();
    subEnv.gain.setValueAtTime(0, T);
    subEnv.gain.linearRampToValueAtTime(1.40, T + 0.002);  // attack 2ms
    subEnv.gain.exponentialRampToValueAtTime(0.001, T + 0.250);
    subEnv.gain.setValueAtTime(0, T + 0.250);

    subOsc.connect(subEnv);

    // ── 4. MID-PUNCH — sine 120 Hz brief (0–35 ms): glues sub and body ──────
    // TR-808 technique: a third sinusoidal layer in the low-mids
    // ensures perceptual continuity between the sub and the body.
    const punchOsc  = ctx.createOscillator();
    punchOsc.type   = 'sine';
    punchOsc.frequency.setValueAtTime(120, T);
    punchOsc.frequency.exponentialRampToValueAtTime(55, T + 0.030);

    const punchEnv = ctx.createGain();
    punchEnv.gain.setValueAtTime(0, T);
    punchEnv.gain.linearRampToValueAtTime(0.60, T + 0.001);
    punchEnv.gain.exponentialRampToValueAtTime(0.001, T + 0.035);
    punchEnv.gain.setValueAtTime(0, T + 0.035);

    punchOsc.connect(punchEnv);

    // ── Mix → soft-limiter → trackGain ──────────────────────────────────────
    const mix      = ctx.createGain();
    mix.gain.value = 1.0;

    const limiter      = ctx.createWaveShaper();
    limiter.curve      = this._kickLimitCurve;  // knee 0.85, pre-computed
    limiter.oversample = '4x';                  // 4x for sub at 30 Hz

    clickEnv.connect(mix);
    bodyLP.connect(mix);
    subEnv.connect(mix);
    punchEnv.connect(mix);
    mix.connect(limiter);
    this._connect(limiter, 'kick');

    const END = T + 0.260;
    clickSrc.start(T);
    bodyOsc.start(T);  bodyOsc.stop(END);
    subOsc.start(T);   subOsc.stop(END);
    punchOsc.start(T); punchOsc.stop(END);
  }

  // Soft-limiter: linear up to 0.85, soft exponential knee up to 1.0
  // Knee raised to 0.85 (was 0.75): lets more sub dynamics through.
  // Exp coeff 2.5 (was 3.5): softer saturation, sub less crushed.
  _buildKickLimitCurve() {
    const n     = 512;
    const curve = new Float32Array(n);
    const knee  = 0.85;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      const t = Math.abs(x);
      let   y;
      if (t <= knee) {
        y = t;
      } else {
        const e = (t - knee) / (1 - knee);
        y = knee + (1 - knee) * (1 - Math.exp(-e * 2.5));
      }
      curve[i] = x < 0 ? -y : y;
    }
    return curve;
  }

  _snare(time) {
    const { ctx } = this;

    // Tonal body
    const osc     = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.frequency.value = 200;
    osc.connect(oscGain);
    this._connect(oscGain, 'snare');
    oscGain.gain.setValueAtTime(0.55, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    osc.start(time);
    osc.stop(time + 0.08);

    // Noise crack — HP 280 Hz, decay 140 ms (200 ms was too long, muddied with kick)
    const noise     = ctx.createBufferSource();
    noise.buffer    = this._whiteNoise(0.14);
    const noiseHP   = ctx.createBiquadFilter();
    noiseHP.type    = 'highpass'; noiseHP.frequency.value = 280; noiseHP.Q.value = 1.0;
    const noiseGain = ctx.createGain();
    noise.connect(noiseHP); noiseHP.connect(noiseGain);
    this._connect(noiseGain, 'snare');
    noiseGain.gain.setValueAtTime(0.85, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    noise.start(time);
  }

  _clap(time) {
    const { ctx } = this;
    // Offsets 0/8/15 ms (22 ms was too wide, 15 ms gives a cleaner snap)
    // BP 1600 Hz (1200 Hz was too central, 1600 Hz is more airy)
    [0, 0.008, 0.015].forEach(offset => {
      const t     = time + offset;
      const noise = ctx.createBufferSource();
      noise.buffer = this._whiteNoise(0.10);

      const filter = ctx.createBiquadFilter();
      filter.type  = 'bandpass'; filter.frequency.value = 1600; filter.Q.value = 1.0;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.80, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.10);

      noise.connect(filter); filter.connect(gain);
      this._connect(gain, 'clap');
      noise.start(t);
    });
  }

  // Groove velocity by step position — accent on beats, ghost on 16ths
  // Template based on house hit analysis: accents at 0/4/8/12, ghosts on odd steps
  _hatVelocity(step) {
    const template = [0.90, 0.28, 0.65, 0.22, 0.85, 0.28, 0.60, 0.20,
                      0.88, 0.28, 0.62, 0.20, 0.82, 0.30, 0.60, 0.25];
    const base = template[step % 16] ?? 1.0;
    // HUMAN 0 → vel = 1.0 (machine-perfect) | HUMAN 1 → vel = template (max groove)
    return 1.0 - this._humanAmount * (1.0 - base);
  }

  _hihat(time, open = false, step = 0) {
    const { ctx }  = this;
    const track    = open ? 'hihat_open' : 'hihat';
    // Open hihat 400 ms (300 ms was too short for house style)
    const duration = open ? 0.40 : 0.065;
    const vel      = this._hatVelocity(step);

    const noise  = ctx.createBufferSource();
    noise.buffer = this._whiteNoise(duration);

    const filter = ctx.createBiquadFilter();
    filter.type  = 'highpass';
    filter.frequency.value = open ? 5500 : 7000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.52 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.connect(filter); filter.connect(gain);
    this._connect(gain, track);
    noise.start(time);
  }

  _whiteNoise(duration) {
    const { ctx } = this;
    const length  = Math.ceil(ctx.sampleRate * duration);
    const buffer  = ctx.createBuffer(1, length, ctx.sampleRate);
    const data    = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
