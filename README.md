# KRWK—VIZ

**Browser-based drum sequencer + generative audio visualizer.**  
No install. No framework. No server. Open `index.html` and play.

---

```
██╗  ██╗██████╗ ██╗    ██╗██╗  ██╗    ██╗   ██╗██╗███████╗
██║ ██╔╝██╔══██╗██║    ██║██║ ██╔╝    ██║   ██║██║╚══███╔╝
█████╔╝ ██████╔╝██║ █╗ ██║█████╔╝     ██║   ██║██║  ███╔╝ 
██╔═██╗ ██╔══██╗██║███╗██║██╔═██╗     ╚██╗ ██╔╝██║ ███╔╝  
██║  ██╗██║  ██║╚███╔███╔╝██║  ██╗     ╚████╔╝ ██║███████╗
╚═╝  ╚═╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝     ╚═══╝  ╚═╝╚══════╝
```

---

## What is it

KRWK-VIZ is a **16-step drum sequencer** fused with a **generative visual system** that reacts to every beat, chord, and note in real time. Music and image are the same thing here — the visualization isn't decorative, it *is* the instrument.

Three zones, one canvas:

| Zone | Function |
|------|----------|
| **BONES** | Circular step sequencer — 5 concentric rings (kick → hihat). Playhead is a rotating needle. |
| **HUMAN** | Controls swing, humanization, seed, BPM, FX sends, mixer. |
| **COLOR** | Circle of fifths (COF) + synth chord sequencer + arpeggiator ring. |

---

## Sounds

- **Drums** — synthesized from scratch with Web Audio API. Kick: 4-layer (click transient + sawtooth body + sub sine + mid-punch). Snare, clap, closed/open hihat — all programmatic.
- **Bass** — 303-style MonoSynth (Tone.js). Sawtooth → resonant LP filter → waveshaper distortion → sidechain from kick.
- **Synth pads** — PolySynth (Tone.js). Voicings spread across 3 octaves with harmonic tension note. Legato mode.
- **FX** — Convolution reverb + BPM-synced delay with LP feedback loop. Global sidechain compressor.

---

## Visual system

The canvas evolves over time. The longer you play, the more alive it gets.

**TemporalMemory** tracks your session arc:
- loops 1–4 → precise, minimal, pure machine
- loops 5–16 → rings breathe, trails appear
- loops 17–32 → organic wobble, grain densifies
- loops 33+ → maximum expression

**Effects fired at audio time** (not animation frame):
- `KickFlash` — full-screen white impact
- `SnareLines` — horizontal scan-lines scrolling down
- `ClapRings` — expanding concentric rings
- Circular oscilloscope — waveform mapped to polar coordinates

**PulseVisu** — a spirograph constellation (epitrochoid self-intersections) that pulses at the BPM. Computed once per seed, never recalculated per frame.

---

## Controls

### Sequencer
- **Click** a step button to toggle it on/off
- **STEPS** selector — 8 / 12 / 16 / 32 steps per pattern
- **PATTERN** A/B/C/D — queue switches at loop boundary

### Synth / Harmony
- **Click** a COF node — selects root + previews chord
- **Quality pips** at center — maj / min / 7 / maj7 / sus2
- **Outer ring slots** — place chords on a timeline (click = place pen, dblclick = clear)
- **Arp ring** — 9 presets (OFF, UP·4, UP·8, DN·4, DN·8, UD·8, ALT·8, OCT·4, BIN·8)

### Bass
- **Bass ring** — 30 patterns across 5 styles: House → Acid → Bridge → Techno → Hard/Rave
- **Single click** bass center — prev/next pattern
- **Double click** a pattern button — add to chain (auto-advance each loop)
- **CUT / RES / ENV / DEC** sliders — live 303 filter tweaking

### Human column
| Control | Effect |
|---------|--------|
| HUMAN | Probabilistic gate + velocity jitter + timing drift. Kick is sacred — never affected. |
| SWING | Pushes odd 16th notes back. Pairs with HUMAN for full groove. |
| SEED | Deterministic randomness — same seed = same groove. NEW SEED reshuffles. |
| REVERB | Convolution reverb send (clap gets pre-delay for punch separation). |
| DELAY | BPM-synced echo (1/8, 1/4, 1/2). LP in feedback loop — repeats degrade naturally. |
| SIDECHAIN | Kick pumps the reverb/delay return. |
| DIST BSS | Waveshaper saturation on the 303 bass. |

### Transport
| Key / Button | Action |
|---|---|
| `▶ PLAY` | Starts sequencer + initializes audio on first click |
| `■ STOP` | Stops transport, resets step |
| `↺ RESET` | Clears all patterns back to default |
| `SPACE` | Capture canvas as PNG |
| `⊡ CAPTURE` | Same — exports `KRWK-VIZ_BPMxxx_SEEDxxxx_Chord_time.png` |
| `FULL` | Fullscreen |
| `LGT / DRK` | Light / dark theme toggle |

---

## Architecture

Vanilla JS, ES modules, zero build step. Tone.js loaded via CDN for synthesis.

```
js/
├── EventBus.js              — decoupled pub/sub (all communication goes here)
├── main.js                  — boot, transport bindings, capture
├── audio/
│   ├── AudioEngine.js       — AudioContext, master limiter, analyser
│   ├── DrumSynth.js         — all drum voices, per-track gain nodes
│   ├── BassEngine.js        — 303 MonoSynth, sidechain, distortion
│   ├── SynthEngine.js       — PolySynth, legato, filter bloom
│   └── FXBus.js             — reverb + delay graph, sidechain duck
├── sequencer/
│   ├── Transport.js         — scheduler loop (AudioContext lookahead)
│   ├── PatternStore.js      — patterns A-D, BPM, mute state
│   ├── BassPattern.js       — 30 bass patterns, chain mode
│   ├── ArpSeq.js            — arpeggiator presets + pool
│   ├── Humanizer.js         — seed-based probabilistic gate + swing
│   ├── TemporalMemory.js    — session arc, mutation parameters
│   └── SynthPattern.js      — 8-slot chord timeline
├── layout/
│   └── Geometry.js          — single source of truth for all spatial values
├── ui/
│   ├── StepGrid.js          — polar-positioned step buttons
│   ├── HumanColumn.js       — all sliders, BPM, mixer
│   ├── BassPatternBrowser.js — pattern grid with chain mode
│   ├── ArpControls.js       — speed + gate buttons
│   ├── EuclideanPanel.js    — Euclidean rhythm generator (Bjorklund)
│   └── ChordWheel.js        — quality modifier buttons
└── visu/
    ├── VisuCanvas.js         — main canvas: rings, COF, bass ring, effects
    ├── PulseVisu.js          — spirograph constellation (BPM pulse)
    └── effects/
        ├── KickFlash.js
        ├── SnareLines.js
        ├── ClapRings.js
        └── HiHatGrain.js
```

**Key design decisions:**

- Audio scheduling uses `AudioContext.currentTime` with a 100ms lookahead — never `setInterval`
- Visual events are queued against audio time and fired frame-accurately via `_pendingEffects`
- All UI state flows through `EventBus` — no direct module coupling
- Geometry is computed once and shared — `StepGrid`, `VisuCanvas`, and all overlays stay pixel-perfect in sync

---

## Run locally

```bash
# No build needed — just serve the directory
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:8080`.

Tests (Vitest):
```bash
npm test
```

---

## Aesthetic

Inspired by Bauhaus graphic design and Kraftwerk's visual language.

- Background: `#0A0A0A`
- Elements: `#F0F0F0`
- Accent: `#E8000D`
- Typography: Courier New / monospace only
- No gradients. No shadows. No rounded corners.

---

## Author

Thomas Huraux
