import EventBus from '../EventBus.js';

const SEMITONES   = { C:0,D:2,E:4,F:5,G:7,A:9,B:11,'C#':1,'D#':3,'F#':6,'G#':8,'A#':10,Db:1,Eb:3,Gb:6,Ab:8,Bb:10 };
const SHARP_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Converts a semitone offset from the root to a Tone.js note (e.g. 'G2')
function noteFromOffset(root, offset) {
  const rs    = SEMITONES[root] ?? 0;
  const total = rs + offset;
  const pitch = ((total % 12) + 12) % 12;
  const oct   = 2 + Math.floor(total / 12); // bass in octave 2 (C2 ≈ 65 Hz)
  return `${SHARP_NAMES[pitch]}${oct}`;
}

// Compact notation: parseInt ignores suffixes ! and ~ → '0!' → 0 ✓, '-5~' → -5 ✓
function s(tokens) {
  return tokens.map(t => {
    if (t === '_') return { n: 0, a: false, ac: false, sl: false };
    return { n: parseInt(t, 10), a: true, ac: t.includes('!'), sl: t.includes('~') };
  });
}

// ── 30 Patterns ──────────────────────────────────────────────────────────────
// Semitones from root:  0=root  5=fourth  7=fifth  -5=low fifth  12=octave
// House 0-5 → Acid 6-13 → Bridge 14-18 → Techno 19-24 → Hard 25-29
// Adjacent patterns share motifs for smooth transitions

export const BASS_PATTERNS = [
  // ── HOUSE ──────────────────────────────────────────────────────────────────
  /* 0  HSE MIN */ s(['0!','_','_','_','_','_','7','_','0!','_','_','_','_','_','5','_']),
  /* 1  HSE BSC */ s(['0!','_','_','_','0','_','7','_','0!','_','_','_','0','_','5','_']),
  /* 2  HSE GRV */ s(['0!','_','_','5','_','7','_','_','0!','_','_','5','_','7','5','_']),
  /* 3  HSE WLK */ s(['0!','_','5','_','7','_','5','0','0!','_','5','_','7','5','_','7']),
  /* 4  HSE SYN */ s(['0!','_','_','0','_','7','_','0','_','0!','_','_','0','7','_','5']),
  /* 5  HSE FUL */ s(['0!','_','0','_','7','_','0','7','0!','_','0','5','7','_','0','7']),

  // ── ACID ───────────────────────────────────────────────────────────────────
  /* 6  ACD INT */ s(['0!','_','0~','7','_','5~','7','_','0!','_','0','7','_','5','_','7']),
  /* 7  ACD SMP */ s(['0!','_','0~','3','7~','_','5','_','0!','3~','7','_','5~','7','_','0']),
  /* 8  ACD MIN */ s(['0!','3~','_','7','_','3~','7','_','0!','3~','_','7','3','_','7~','0']),
  /* 9  ACD BNC */ s(['0!','_','7~','0','_','0~','7','_','0!','_','7~','0','0~','7','_','0']),
  /* 10 ACD CLX */ s(['0!','_','0~','3','_','7~','5','_','3~','7!','_','0','5','_','7~','0']),
  /* 11 ACD CPX */ s(['0!','3~','7','_','5~','3','_','0!~','3~','7','5!','_','3~','5','7~','0']),
  /* 12 ACD DPH */ s(['-5','_','0!','_','0~','7','_','5','-5','_','0!~','7','_','3~','7','_']),
  /* 13 ACD HGH */ s(['0!','_','12~','7','_','5~','12','_','0!','_','12~','7','5','_','7~','12']),

  // ── BRIDGE ─────────────────────────────────────────────────────────────────
  /* 14 ACD TCH */ s(['0!','_','7~','0','7','_','5!','_','0!','_','7~','0','7','5','_','7']),
  /* 15 MCH ACD */ s(['0!','0','7','0','0!','0','7','0','0!','0','7','0','0!','0','5!','7']),
  /* 16 HRD ACD */ s(['0!','_','_','0','7!','_','_','7','0!','_','_','0','7!','0','_','7']),
  /* 17 TCH GRV */ s(['0!','_','0','5','_','7','0','_','0!','_','0','5','7','_','0','7']),
  /* 18 TCH SYN */ s(['0!','_','_','0','_','0!','_','7','_','_','0','_','0!','7','_','0']),

  // ── TECHNO ─────────────────────────────────────────────────────────────────
  /* 19 TCH BSC */ s(['0!','_','0','_','0!','_','0','_','0!','_','0','_','0!','_','0','_']),
  /* 20 TCH PMP */ s(['0!','_','_','7','_','0!','_','_','7','_','0!','_','_','7','0!','_']),
  /* 21 TCH HRD */ s(['0!','_','_','_','7!','_','_','_','0!','_','_','_','7!','_','0','_']),
  /* 22 TCH DNS */ s(['0!','_','0','7','_','0','7','0!','_','0','7','_','0!','7','_','0']),
  /* 23 IND LGT */ s(['0!','0','_','0!','_','0','0!','0','0!','0','_','0!','0','0!','0','_']),
  /* 24 IND HVY */ s(['0!','0','0!','0','0!','0','0!','0','0!','7','0!','7','0!','7','0!','7']),

  // ── HARD / RAVE ────────────────────────────────────────────────────────────
  /* 25 RVE MIN */ s(['0!','_','_','7','0','_','7','_','0!','_','_','7','0','7','_','0']),
  /* 26 RVE DRV */ s(['0!','7','_','7','0!','7','_','7','0!','7','_','7','0!','7','0!','7']),
  /* 27 RVE DNS */ s(['0!','7','0','7','0!','7','0','7','0!','7','0','7','0!','7','0','7']),
  /* 28 RVE RTS */ s(['0!','0','0','0','7!','7','7','7','0!','0','0','0','7!','7','7','7']),
  /* 29 RVE MAX */ s(['0!','7','5','7','0!','7','5','7','0!','7','5','7','0!','7','5','7']),
];

export const BASS_PATTERNS_META = [
  { label: 'HSE·MIN', style: 'house' }, { label: 'HSE·BSC', style: 'house' },
  { label: 'HSE·GRV', style: 'house' }, { label: 'HSE·WLK', style: 'house' },
  { label: 'HSE·SYN', style: 'house' }, { label: 'HSE·FUL', style: 'house' },
  { label: 'ACD·INT', style: 'acid'  }, { label: 'ACD·SMP', style: 'acid'  },
  { label: 'ACD·MIN', style: 'acid'  }, { label: 'ACD·BNC', style: 'acid'  },
  { label: 'ACD·CLX', style: 'acid'  }, { label: 'ACD·CPX', style: 'acid'  },
  { label: 'ACD·DPH', style: 'acid'  }, { label: 'ACD·HGH', style: 'acid'  },
  { label: 'ACD·TCH', style: 'bridge'}, { label: 'MCH·ACD', style: 'bridge'},
  { label: 'HRD·ACD', style: 'bridge'}, { label: 'TCH·GRV', style: 'bridge'},
  { label: 'TCH·SYN', style: 'bridge'}, { label: 'TCH·BSC', style: 'techno'},
  { label: 'TCH·PMP', style: 'techno'}, { label: 'TCH·HRD', style: 'techno'},
  { label: 'TCH·DNS', style: 'techno'}, { label: 'IND·LGT', style: 'techno'},
  { label: 'IND·HVY', style: 'techno'}, { label: 'RVE·MIN', style: 'hard'  },
  { label: 'RVE·DRV', style: 'hard'  }, { label: 'RVE·DNS', style: 'hard'  },
  { label: 'RVE·RTS', style: 'hard'  }, { label: 'RVE·MAX', style: 'hard'  },
];

const STYLE_COLOR = {
  house:  'rgba(120,200,255,',  // sky blue
  acid:   'rgba(255,160, 40,',  // orange
  bridge: 'rgba(200,200,200,',  // gray
  techno: 'rgba(240,240,240,',  // white
  hard:   'rgba(232,  0, 13,',  // red
};

const BassPattern = {
  activePattern:   0,
  _pendingPattern: -1,
  _bassStep:       0,
  _root:           'C',
  _chain:          [], // patterns to chain ([] = loop activePattern)

  get currentSteps()  { return BASS_PATTERNS[this.activePattern]; },
  get currentMeta()   { return BASS_PATTERNS_META[this.activePattern]; },
  get styleColor()    { return STYLE_COLOR[this.currentMeta.style] ?? STYLE_COLOR.techno; },

  listen() {
    EventBus.on('chord:change', ({ root }) => { this._root = root; });

    EventBus.on('transport:tick', ({ time }) => {
      // Pattern switch at bass loop boundary
      if (this._bassStep === 0) {
        if (this._pendingPattern >= 0) {
          this.activePattern   = this._pendingPattern;
          this._pendingPattern = -1;
          EventBus.emit('bass:pattern', { index: this.activePattern });
        } else if (this._chain.length > 1) {
          // Advance through the chain
          const ci = this._chain.indexOf(this.activePattern);
          this.activePattern = this._chain[(ci + 1) % this._chain.length];
          EventBus.emit('bass:pattern', { index: this.activePattern });
        }
      }

      const step = BASS_PATTERNS[this.activePattern][this._bassStep];

      EventBus.emit('bass:step', {
        stepIndex:    this._bassStep,
        stepData:     step,
        patternIndex: this.activePattern,
      });

      if (step.a) {
        EventBus.emit('bass:note', {
          note:   noteFromOffset(this._root, step.n),
          accent: step.ac,
          slide:  step.sl,
          time,
        });
      } else {
        EventBus.emit('bass:rest', {});
      }

      this._bassStep = (this._bassStep + 1) % 16;
    });

    EventBus.on('transport:stop', () => {
      this._bassStep = 0;
      EventBus.emit('bass:stop', {});
    });
  },

  queuePattern(index) {
    if (index < 0 || index >= BASS_PATTERNS.length) return;
    this._pendingPattern = index;
    this._chain          = []; // exit chain mode
    EventBus.emit('bass:pending', { index });
  },

  nextPattern() { this.queuePattern((this.activePattern + 1) % BASS_PATTERNS.length); },
  prevPattern() { this.queuePattern((this.activePattern - 1 + BASS_PATTERNS.length) % BASS_PATTERNS.length); },

  // Add/remove a pattern from the chain
  toggleChain(index) {
    const i = this._chain.indexOf(index);
    if (i >= 0) this._chain.splice(i, 1);
    else        this._chain.push(index);
    // Ensure the active pattern is in the chain when chain is active
    if (this._chain.length > 0 && !this._chain.includes(this.activePattern)) {
      this._chain.unshift(this.activePattern);
    }
    EventBus.emit('bass:chain', { chain: [...this._chain] });
  },
};

export default BassPattern;
