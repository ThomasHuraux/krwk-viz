// Geometry — single source of truth for all spatial layout values.
// Both VisuCanvas and StepGrid import from here to stay pixel-perfect in sync.

const APP_HEADER_H  = 40;   // #app-header
const SUBHEADER_H   = 28;   // #subheader
const PANEL_HEADER_H = 28;  // .panel-header inside each panel

// Total offset above the BONES/COF circle bodies
const HEADER_H = APP_HEADER_H + SUBHEADER_H + PANEL_HEADER_H; // 96

const BONES_COL = 0.42;
const HUMAN_COL = 0.16;
const COLOR_COL = 0.42;

// Bottom strip row height (grid row 4 = 13vh) + its panel headers
const BOTTOM_STRIP_FRAC = 0.13;

// Ring ratios relative to max radius (outermost = 0.50)
export const RING_RATIO = {
  kick:       0.15,
  snare:      0.25,
  clap:       0.35,
  hihat:      0.43,
  hihat_open: 0.50,
};
export const TRACK_ORDER = ['kick', 'snare', 'clap', 'hihat', 'hihat_open'];

const Geometry = {
  width:     0,
  height:    0,

  bonesCX:   0,
  colorCX:   0,
  colorCY:   0,
  pivotX:    0,
  pivotY:    0,

  bonesRadii: {},
  colorRadii: {},

  bassRingCX: 0,
  bassRingCY: 0,
  bassRingR:  0,

  update() {
    this.width  = window.innerWidth;
    this.height = window.innerHeight;

    // Bottom strip takes 13vh + panel header each side
    const BOTTOM_H = Math.round(this.height * BOTTOM_STRIP_FRAC) + PANEL_HEADER_H;

    const availH     = this.height - HEADER_H - BOTTOM_H;
    const colorLeft  = this.width * (BONES_COL + HUMAN_COL);
    const colorWidth = this.width * COLOR_COL;

    this.bonesCX = this.width * (BONES_COL / 2);
    this.pivotX  = this.width * (BONES_COL + HUMAN_COL / 2);
    this.pivotY  = HEADER_H + availH / 2;

    // ── BONES ────────────────────────────────────────────────────────────────
    const bonesMaxR  = Math.min(this.width * BONES_COL / 2 - 24, availH / 2 - 24);
    const bonesScale = bonesMaxR / RING_RATIO.hihat_open;
    TRACK_ORDER.forEach(t => { this.bonesRadii[t] = bonesScale * RING_RATIO[t]; });

    // ── LEMNISCATE DIAGONAL ───────────────────────────────────────────────────
    // F = 0.86 → overlap ≈ 14% of (synthR+bassR)
    const ML = 8, MR = 8, MT = 8, MB = 8;
    const RATIO = 1.5;
    const F = 0.86;
    const P = colorWidth - (ML + MR);
    const Q = availH     - (MB + MT);
    const a = 2 - F * F;
    const disc = Math.sqrt(Math.max(0, (P + Q) * (P + Q) - a * (P * P + Q * Q)));
    const x = ((P + Q) - disc) / a;
    const bassR  = Math.max(30, x / (RATIO + 1));
    const synthR = RATIO * bassR;

    this.colorCX    = this.width  - synthR - MR;
    this.colorCY    = HEADER_H    + synthR + MT;
    this.bassRingCX = colorLeft   + bassR  + ML;
    this.bassRingCY = this.height - BOTTOM_H - bassR - MB;
    this.bassRingR  = bassR;

    const colorScale = synthR / RING_RATIO.hihat_open;
    TRACK_ORDER.forEach(t => { this.colorRadii[t] = colorScale * RING_RATIO[t]; });
  }
};

export default Geometry;
