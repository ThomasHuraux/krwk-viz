// Geometry — single source of truth for all spatial layout values.
// Both VisuCanvas and StepGrid import from here to stay pixel-perfect in sync.

const HEADER_H  = 80;   // BONES/HUMAN/COLOR bandeau
const BOTTOM_H  = 48;   // control bar
const BONES_COL = 0.42; // fraction of viewport width
const HUMAN_COL = 0.16;
const COLOR_COL = 0.42;

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

  // Zone centers
  bonesCX:   0,  // BONES circle center X
  colorCX:   0,  // SYNTH circle center X (top-right of COLOR zone)
  colorCY:   0,  // SYNTH circle center Y (independent of BONES/pivotY)
  pivotX:    0,  // HUMAN pivot X
  pivotY:    0,  // shared Y for BONES and needle base

  // Derived radii (computed from max radius)
  bonesRadii: {},
  colorRadii: {},  // same proportions, different center — ready for Sprint D

  // Bass ring geometry (COLOR column, below main ring)
  bassRingCX: 0,
  bassRingCY: 0,
  bassRingR:  0,

  update() {
    this.width  = window.innerWidth;
    this.height = window.innerHeight;

    const availH     = this.height - HEADER_H - BOTTOM_H;
    const colorLeft  = this.width * (BONES_COL + HUMAN_COL);
    const colorWidth = this.width * COLOR_COL;

    this.bonesCX = this.width * (BONES_COL / 2);
    this.pivotX  = this.width * (BONES_COL + HUMAN_COL / 2);
    this.pivotY  = HEADER_H + availH / 2;

    // ── BONES ──────────────────────────────────────────────────────────────
    const bonesMaxR  = Math.min(this.width * BONES_COL / 2 - 24, availH / 2 - 24);
    const bonesScale = bonesMaxR / RING_RATIO.hihat_open;
    TRACK_ORDER.forEach(t => { this.bonesRadii[t] = bonesScale * RING_RATIO[t]; });

    // ── LEMNISCATE DIAGONAL ───────────────────────────────────────────────────
    // Synth : coin haut-droit   colorCX = width − synthR − MR
    //                           colorCY = HEADER_H + synthR + MT
    // Basse : coin bas-gauche   bassRingCX = colorLeft + bassR + ML
    //                           bassRingCY = height − BOTTOM_H − bassR − MB
    //
    // The synth 300° arc opens toward the bass (direction computed dynamically).
    // Tangency constraint: D(centers) = synthR + bassR + GAP
    //   Dx = 2.5b + (ML+MR) − colorWidth
    //   Dy = availH − 2.5b − (MB+MT)
    //   D  = 2.5b + GAP     with synthR = 1.5·b
    //
    // Analytical solution (x = 2.5·b):
    //   x = (P+Q+G) − sqrt(2·(G²+PQ+G·(P+Q)))
    //   P = colorWidth−(ML+MR), Q = availH−(MB+MT), G = GAP
    //
    // F = fraction of (synthR+bassR) used as center-to-center distance.
    // F < 1 → overlap: the arc tip penetrates the bass circle.
    // F = 0.86 → overlap ≈ 14% of (synthR+bassR) ≈ 60 px at 1440×900.
    //
    // Quadratique (x = 2.5·bassR) :
    //   (F·x)² = (x−P)² + (Q−x)²   P = colorWidth−margins, Q = availH−margins
    //   (2−F²)·x² − 2(P+Q)·x + (P²+Q²) = 0
    //
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
