// Full-screen white flash radiating from center — kick's sub-bass impact
export default class KickFlash {
  constructor(cx, cy, initialAlpha = 0.45) {
    this.cx    = cx;
    this.cy    = cy;
    this.alpha = initialAlpha;
    this.dead  = false;
  }

  update() {
    this.alpha *= 0.72;
    if (this.alpha < 0.004) this.dead = true;
  }

  draw(ctx) {
    const { width, height } = ctx.canvas;
    ctx.fillStyle = `rgba(240, 240, 240, ${this.alpha})`;
    ctx.fillRect(0, 0, width, height);
  }
}
