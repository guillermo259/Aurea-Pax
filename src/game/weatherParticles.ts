import { WeatherKind } from './types';

const POOL_CAPACITY = 160;

// Particle kind codes
const KIND_NONE = 0;
const KIND_RAINDROP = 1;
const KIND_SPLASH = 2;
const KIND_LEAF = 3;
const KIND_GUST = 4;

/**
 * Pre-allocated zero-GC typed-array particle ring buffer for rain and wind weather effects.
 */
export class WeatherParticlePool {
  private readonly kind = new Uint8Array(POOL_CAPACITY);
  private readonly x = new Float32Array(POOL_CAPACITY);
  private readonly y = new Float32Array(POOL_CAPACITY);
  private readonly vx = new Float32Array(POOL_CAPACITY);
  private readonly vy = new Float32Array(POOL_CAPACITY);
  private readonly life = new Float32Array(POOL_CAPACITY);
  private readonly maxLife = new Float32Array(POOL_CAPACITY);
  private readonly size = new Float32Array(POOL_CAPACITY);
  private readonly phase = new Float32Array(POOL_CAPACITY);
  private cursor = 0;
  private spawnAccum = 0;

  private allocateSlot(): number {
    for (let i = 0; i < POOL_CAPACITY; i++) {
      const idx = (this.cursor + i) % POOL_CAPACITY;
      if (this.kind[idx] === KIND_NONE) {
        this.cursor = (idx + 1) % POOL_CAPACITY;
        return idx;
      }
    }
    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % POOL_CAPACITY;
    return idx;
  }

  private spawnRain(width: number, height: number): void {
    const idx = this.allocateSlot();
    this.kind[idx] = KIND_RAINDROP;
    this.x[idx] = Math.random() * (width + 180) - 40;
    this.y[idx] = -20 - Math.random() * 80;
    this.vx[idx] = -65 - Math.random() * 25;
    this.vy[idx] = 430 + Math.random() * 140;
    const targetFall = (0.35 + Math.random() * 0.68) * height;
    this.maxLife[idx] = Math.max(0.25, targetFall / this.vy[idx]);
    this.life[idx] = 0;
    this.size[idx] = 11 + Math.random() * 7;
    this.phase[idx] = Math.random() * 6.28;
  }

  private spawnSplash(px: number, py: number): void {
    const idx = this.allocateSlot();
    this.kind[idx] = KIND_SPLASH;
    this.x[idx] = px;
    this.y[idx] = py;
    this.vx[idx] = 0;
    this.vy[idx] = 0;
    this.life[idx] = 0;
    this.maxLife[idx] = 0.22 + Math.random() * 0.08;
    this.size[idx] = 3.5 + Math.random() * 2.5;
    this.phase[idx] = 0;
  }

  private spawnWind(width: number, height: number): void {
    const idx = this.allocateSlot();
    const isGust = Math.random() < 0.24;
    this.kind[idx] = isGust ? KIND_GUST : KIND_LEAF;
    this.x[idx] = -60 - Math.random() * 80;
    this.y[idx] = Math.random() * height;
    this.vx[idx] = isGust ? 320 + Math.random() * 140 : 170 + Math.random() * 110;
    this.vy[idx] = isGust ? 18 + Math.random() * 20 : 28 + Math.random() * 38;
    this.life[idx] = 0;
    this.maxLife[idx] = (width + 180) / this.vx[idx];
    this.size[idx] = isGust ? 48 + Math.random() * 54 : 2.5 + Math.random() * 2.2;
    this.phase[idx] = Math.random() * 6.28;
  }

  public update(
    dt: number,
    weatherKind: WeatherKind,
    intensity: number,
    width: number,
    height: number,
  ): void {
    if (dt <= 0 || width <= 0 || height <= 0) return;

    if (intensity > 0.03 && weatherKind !== 'clear') {
      const ratePerSec = weatherKind === 'rain' ? 92 * intensity : 34 * intensity;
      this.spawnAccum += ratePerSec * dt;
      while (this.spawnAccum >= 1) {
        this.spawnAccum -= 1;
        if (weatherKind === 'rain') {
          this.spawnRain(width, height);
        } else {
          this.spawnWind(width, height);
        }
      }
    } else {
      this.spawnAccum = 0;
    }

    for (let i = 0; i < POOL_CAPACITY; i++) {
      const k = this.kind[i];
      if (k === KIND_NONE) continue;

      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        if (k === KIND_RAINDROP) {
          const sx = this.x[i];
          const sy = this.y[i];
          this.kind[i] = KIND_NONE;
          if (sy > 50 && sy < height - 50 && sx > 0 && sx < width) {
            this.spawnSplash(sx, sy);
          }
        } else {
          this.kind[i] = KIND_NONE;
        }
        continue;
      }

      if (k === KIND_LEAF) {
        const flutter = Math.sin(this.life[i] * 5.2 + this.phase[i]) * 28;
        this.x[i] += this.vx[i] * dt;
        this.y[i] += (this.vy[i] + flutter) * dt;
      } else if (k !== KIND_SPLASH) {
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
      }
    }
  }

  public render(
    ctx: CanvasRenderingContext2D,
    weatherKind: WeatherKind,
    intensity: number,
    width: number,
    height: number,
  ): void {
    if (intensity <= 0.02 && this.isEmpty()) return;

    if (intensity > 0.02) {
      if (weatherKind === 'rain') {
        ctx.fillStyle = `rgba(18, 34, 52, ${(0.16 * intensity).toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
      } else if (weatherKind === 'wind') {
        ctx.fillStyle = `rgba(186, 152, 92, ${(0.06 * intensity).toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
      }
    }

    ctx.save();

    // Batch all raindrops into a single path stroke for ultra-low draw overhead
    ctx.strokeStyle = 'rgba(190, 226, 246, 0.44)';
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    let hasRain = false;
    for (let i = 0; i < POOL_CAPACITY; i++) {
      if (this.kind[i] === KIND_RAINDROP) {
        hasRain = true;
        ctx.moveTo(this.x[i], this.y[i]);
        ctx.lineTo(this.x[i] - this.size[i] * 0.14, this.y[i] + this.size[i]);
      }
    }
    if (hasRain) ctx.stroke();

    // Batch splashes into one path
    ctx.strokeStyle = 'rgba(205, 236, 250, 0.34)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    let hasSplash = false;
    for (let i = 0; i < POOL_CAPACITY; i++) {
      if (this.kind[i] === KIND_SPLASH) {
        hasSplash = true;
        const t = this.life[i] / Math.max(0.001, this.maxLife[i]);
        const rx = this.size[i] * (0.4 + t * 0.9);
        const ry = rx * 0.45;
        ctx.moveTo(this.x[i] + rx, this.y[i]);
        ctx.ellipse(this.x[i], this.y[i], rx, ry, 0, 0, Math.PI * 2);
      }
    }
    if (hasSplash) ctx.stroke();

    // Batch wind gusts into one path
    ctx.strokeStyle = 'rgba(244, 232, 204, 0.16)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    let hasGust = false;
    for (let i = 0; i < POOL_CAPACITY; i++) {
      if (this.kind[i] === KIND_GUST) {
        hasGust = true;
        const px = this.x[i];
        const py = this.y[i];
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(
          px + this.size[i] * 0.5,
          py + Math.sin(this.life[i] * 4 + this.phase[i]) * 5,
          px + this.size[i],
          py + 6,
        );
      }
    }
    if (hasGust) ctx.stroke();

    // Drifting Mediterranean leaves
    for (let i = 0; i < POOL_CAPACITY; i++) {
      if (this.kind[i] !== KIND_LEAF) continue;
      const t = this.life[i] / Math.max(0.001, this.maxLife[i]);
      const alpha = Math.sin(Math.min(1, t) * Math.PI) * 0.72;
      ctx.fillStyle =
        this.phase[i] > 3.1
          ? `rgba(124, 148, 72, ${alpha.toFixed(2)})`
          : `rgba(204, 174, 108, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(
        this.x[i],
        this.y[i],
        this.size[i],
        this.size[i] * 0.55,
        this.life[i] * 3 + this.phase[i],
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    ctx.restore();
  }

  private isEmpty(): boolean {
    for (let i = 0; i < POOL_CAPACITY; i++) {
      if (this.kind[i] !== KIND_NONE) return false;
    }
    return true;
  }
}
