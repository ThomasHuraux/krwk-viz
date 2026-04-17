// Pixel grain scattered along the hihat ring — high-frequency texture
// open=true : more particles, wider spread, slower decay (open hi-hat sustain)
export default class HiHatGrain {
  constructor(cx, cy, radius, open = false) {
    this.cx        = cx;
    this.cy        = cy;
    this.radius    = radius;
    this.open      = open;
    this.alpha     = 1.0;
    this.dead      = false;
    this.particles = this._generate();
  }

  _generate() {
    const count  = this.open ? 160 : 100;
    const spread = this.open ? 70  : 50;
    const particles = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r     = this.radius + (Math.random() - 0.5) * spread;
      particles.push({
        x:  this.cx + r * Math.cos(angle),
        y:  this.cy + r * Math.sin(angle),
        sz: Math.random() < 0.12 ? 2 : 1,
      });
    }
    return particles;
  }

  update() {
    this.alpha *= this.open ? 0.75 : 0.65;
    if (this.alpha < 0.01) this.dead = true;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = `rgba(240, 240, 240, ${this.alpha})`;
    for (const p of this.particles) {
      ctx.fillRect(p.x, p.y, p.sz, p.sz);
    }
    ctx.restore();
  }
}
