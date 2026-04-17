// Horizontal scan-lines scrolling downward — snare's crack energy
export default class SnareLines {
  constructor(width, height) {
    this.width     = width;
    this.height    = height;
    this.alpha     = 0.55;
    this.offset    = 0;
    this.lineCount = 14;
    this.speed     = 4;
    this.dead      = false;
  }

  update() {
    this.alpha  *= 0.78;
    this.offset += this.speed;
    if (this.alpha < 0.008) this.dead = true;
  }

  draw(ctx) {
    const spacing = this.height / this.lineCount;
    ctx.save();
    ctx.strokeStyle = `rgba(240, 240, 240, ${this.alpha})`;
    ctx.lineWidth   = 1;

    for (let i = 0; i < this.lineCount + 1; i++) {
      const y = (i * spacing + this.offset) % this.height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}
