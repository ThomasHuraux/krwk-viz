# KRWK—VIZ

**Browser-based groovebox + generative audio visualizer.**  
Drum sequencer · 303 bass · polyphonic synth · arpeggiator — all wired to a live visual system.  
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

KRWK-VIZ is a **browser groovebox** — drums, bass, and harmonic synth playing together, fused with a **generative visual system** that reacts to every beat, chord, and note in real time. Music and image are the same thing — the visualization isn't decorative, it *is* the instrument.

The interface is divided into three zones that map directly to three musical dimensions:

---

## BONES — Rhythm

The left zone. A circular drum sequencer with 5 concentric rings, one per instrument. The playhead is a rotating needle that sweeps all rings simultaneously. Every hit fires a visual effect at exact audio time.

**Instruments**

Drums are synthesized from scratch with the Web Audio API — no samples.

| Track | Sound design |
|-------|-------------|
| Kick | 4 layers: click transient (bandpass noise) + sawtooth body (320→48 Hz) + sub sine (90→30 Hz) + mid-punch sine (120 Hz). Soft-limiter on output. |
| Snare | Sine body (200 Hz) + highpass noise crack (280 Hz, 140 ms). |
| Clap | 3 bandpass noise bursts offset by 0 / 8 / 15 ms. |
| Closed hihat | Highpass noise (7000 Hz, 65 ms). |
| Open hihat | Highpass noise (5500 Hz, 400 ms). |

**Sequencer controls**

- **Click** a step button — toggle on/off
- **STEPS** — 8 / 12 / 16 / 32 steps per pattern
- **PATTERN A/B/C/D** — queue a pattern switch at the next loop boundary
- **EUCLID panel** — Euclidean rhythm generator (Bjorklund algorithm). Set hits (K) and rotation (ROT) per track, applied immediately.

**Visual — BONES ring**

5 concentric rings pulse and breathe with the music. Hit effects are queued against `AudioContext.currentTime` and fired frame-accurately:

- `KickFlash` — full-screen white impact
- `SnareLines` — horizontal scan-lines scrolling down
- `ClapRings` — expanding concentric rings from the clap ring position
- Circular oscilloscope — waveform mapped to polar coordinates inside the kick ring

---

## HUMAN — Feel

The center column. No sound of its own — it shapes how everything else plays.

| Control | What it does |
|---------|-------------|
| **BPM** | 60–200. Hold +/− to accelerate. |
| **HUMAN** | Probabilistic gate + velocity jitter + timing drift (±18 ms). Kick is sacred — never affected. Hihat gets the most variation. |
| **SWING** | Delays odd 16th notes. Pairs with HUMAN for full groove feel. |
| **SEED** | The randomness source. Same seed + same pattern = identical groove every loop. Hit NEW SEED to reshuffle. |
| **REVERB** | Convolution reverb send. Clap gets a 35 ms pre-delay to separate attack from tail. |
| **DELAY** | BPM-synced echo — 1/8, 1/4, or 1/2 note. LP filter in the feedback loop so repeats degrade naturally. |
| **SIDECHAIN** | Kick pumps the reverb/delay return. Controls the pump depth. |
| **DIST BSS** | Waveshaper saturation on the 303 bass only. |
| **MASTER** | Global output volume. |
| **MIX** | Per-track faders (KCK / SNR / CLP / CH / OH / BSS / SYN) + mute buttons. |

**Visual — PulseVisu**

The small canvas in the center column shows a **spirograph constellation** — a set of self-intersection points of an epitrochoid curve. Computed once per seed (never per frame). On every beat the constellation flashes red and contracts back to rest.

---

## COLOR — Harmony

The right zone. Two instruments sharing one circular visual space: the **polyphonic synth pad** and the **303-style bass**, both driven by harmonic controls built around the circle of fifths.

### Synth pad

A PolySynth (Tone.js) with sawtooth oscillators, a resonant LP filter, and legato voice handling. Voicings are spread over 3 octaves with a deterministic harmonic tension note per chord quality.

**Chord selection**

- **COF nodes** (12 outer dots) — click to select root note and preview the chord immediately
- **Quality pips** (5 center dots) — select chord quality: `maj` / `min` / `7` / `maj7` / `sus2`
- **Chord polygon** — the current chord's notes are shown as a polygon inside the COF

**Synth timeline (outer ring)**

8 slots arranged as an arc. Each slot holds a chord with a duration (16n / 8n / 4n / 2n — shown as radial thickness).

- **Click** an empty slot — place the current chord as a step
- **Double-click** a filled slot — clear it
- **Click** a filled slot — recall its chord as the current pen

**Arpeggiator (middle ring)**

9 presets displayed as sectors. Click a sector to queue it at the next loop boundary.

| Preset | Pattern |
|--------|---------|
| OFF | Arp disabled |
| UP·4 | Ascending 4 notes (1/8) |
| UP·8 | Ascending 8 notes (1/16) |
| DN·4 | Descending 4 notes (1/8) |
| DN·8 | Descending 8 notes (1/16) |
| UD·8 | Up then down, 8 notes |
| ALT·8 | Alternating intervals |
| OCT·4 | Root + octave jump |
| BIN·8 | Binary rhythmic motif |

Speed (1/16 · 1/8 · 1/4) and gate (25% · 50% · 80% · 120%) are set in the ARP controls panel.

### Bass — 303

A MonoSynth (Tone.js): sawtooth → resonant LP filter → waveshaper distortion → sidechain gain → master. Auto-sidechain from kick. Portamento on slide steps.

**30 patterns** across 5 styles, displayed as a ring in the lower-right:

| Style | Patterns | Character |
|-------|----------|-----------|
| HSE | 0–5 | Minimal to full house walking bass |
| ACD | 6–13 | Classic 303 acid lines with slides and accents |
| BRG | 14–18 | Transition patterns between house and techno |
| TCH | 19–24 | Industrial techno, repetitive and driving |
| RVE | 25–29 | Hard rave, maximum density |

- **Click** a pattern button — queue it at the next bass loop boundary
- **Double-click** — add/remove from chain (auto-cycles through chained patterns each loop)
- **Click** bass ring center — prev / next pattern
- **Double-click** bass ring center — toggle current pattern in chain
- **CUT / RES / ENV / DEC** — live filter tweaking (cutoff Hz, resonance Q, env mod octaves, decay s)

---

## Transport

| Button / Key | Action |
|---|---|
| `▶ PLAY` | Start. Initializes audio context on first click. |
| `■ STOP` | Stop transport, reset step to 0. |
| `↺ RESET` | Clear all patterns back to default. |
| `⊡ CAPTURE` or `SPACE` | Export canvas as PNG — filename encodes BPM, seed, chord, and timestamp. |
| `FULL` | Toggle fullscreen. |
| `LGT / DRK` | Toggle light / dark theme. |

---

## Visual system

The canvas evolves the longer you play. **TemporalMemory** accumulates loop count and energy and drives all visual mutation parameters:

```
loops  1–4   →  precise, minimal, pure machine
loops  5–16  →  rings breathe, trails appear
loops 17–32  →  organic wobble, grain densifies
loops 33+    →  maximum expression
```

Visual events are never tied to animation frames — they are queued against `AudioContext.currentTime` and fired when the clock reaches them, keeping sound and image frame-accurate.

---

## Architecture

Vanilla JS, ES modules, zero build step. Tone.js via CDN.

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

**Key decisions:**
- Audio scheduling uses `AudioContext.currentTime` with 100 ms lookahead — never `setInterval`
- Visual events are queued against audio time and fired frame-accurately via `_pendingEffects`
- All state flows through `EventBus` — no direct module coupling
- `Geometry.js` is the single source of truth for all layout values — `StepGrid`, `VisuCanvas`, and all overlays stay pixel-perfect in sync

---

## Run locally

```bash
npx serve .
# or
python3 -m http.server 8080
```

Tests:
```bash
npm test
```

---

## Aesthetic

Bauhaus / Kraftwerk.

- Background `#0A0A0A` · Elements `#F0F0F0` · Accent `#E8000D`
- Monospace only (Courier New)
- No gradients. No shadows. No rounded corners.

---

## Author

Thomas Huraux
