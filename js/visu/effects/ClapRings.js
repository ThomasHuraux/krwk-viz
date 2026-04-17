// Expanding concentric rings from the clap's ring position
export default class ClapRings {
  constructor(cx, cy, baseRadius) {
    this.cx         = cx;
    this.cy         = cy;
    this.baseRadius = baseRadius;
    this.expansion  = 0;
    this.alpha      = 0.75;
    this.ringCount  = 4;
    this.dead       = false;
  }

  update() {
    this.expansion += 5;
    this.alpha     *= 0.80;
    if (this.alpha < 0.007) this.dead = true;
  }

  draw(ctx) {
    ctx.save();
    for (let i = 0; i < this.ringCount; i++) {
      const r     = this.baseRadius + this.expansion + i * 18;
      const alpha = this.alpha * (1 - i / this.ringCount);

      ctx.beginPath();
      ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(240, 240, 240, ${alpha})`;
      ctx.lineWidth   = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
}
