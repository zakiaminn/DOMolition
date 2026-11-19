import { clamp, createLoop, sourceScale, type ShatterEngineInstance, type ShatterOptions } from './shared';

// Upper bound on dust grains, so big elements stay smooth.
const MAX_PARTICLES = 9000;
// How long the dissolve front takes to cross the element.
const SWEEP_TICKS = 70;

/**
 * "I don't feel so good." The element crumbles into dust in a ragged sweep from
 * left to right, each grain carried up and away on a turbulent breeze while it
 * fades. No physics engine; this one is a particle system on the canvas.
 */
export const createDisintegrateEngine = ({
  width,
  height,
  sourceCanvas,
  ctx,
  startX,
  startY,
  canvasWidth,
  canvasHeight,
  onComplete,
}: ShatterOptions): ShatterEngineInstance => {
  const { sx, sy } = sourceScale(sourceCanvas, width, height);

  // Grain size scales with the element so the particle count stays bounded.
  const grain = Math.max(2, Math.ceil(Math.sqrt((width * height) / MAX_PARTICLES)));
  const gcols = Math.ceil(width / grain);
  const grows = Math.ceil(height / grain);

  // Average each grain's colour by drawing the capture down to one pixel per grain.
  const sample = document.createElement('canvas');
  sample.width = gcols;
  sample.height = grows;
  const sctx = sample.getContext('2d', { willReadFrequently: true });
  if (!sctx) throw new Error('DOMolition: 2D context unavailable');
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(sourceCanvas, 0, 0, gcols, grows);
  const pixels = sctx.getImageData(0, 0, gcols, grows).data;

  // What's still standing. We erase each grain from this copy as it lets go,
  // so per frame we only blit one image plus the moving dust.
  const remaining = document.createElement('canvas');
  remaining.width = sourceCanvas.width;
  remaining.height = sourceCanvas.height;
  const rctx = remaining.getContext('2d');
  if (!rctx) throw new Error('DOMolition: 2D context unavailable');
  rctx.drawImage(sourceCanvas, 0, 0);

  // A wobbly dissolve front: low-frequency noise along the height so the edge is ragged.
  const knots = Array.from({ length: 8 }, () => Math.random());
  const frontNoise = (v: number) => {
    const k = v * (knots.length - 1);
    const i = Math.min(knots.length - 2, Math.floor(k));
    const t = k - i;
    return knots[i] * (1 - t) + knots[i + 1] * t;
  };

  interface Grain {
    hx: number; // home, element-local CSS px
    hy: number;
    x: number; // current, viewport CSS px
    y: number;
    vx: number;
    vy: number;
    release: number; // tick it lets go
    life: number;
    age: number;
    color: string;
    alpha: number;
  }

  const grains: Grain[] = [];
  for (let gy = 0; gy < grows; gy++) {
    for (let gx = 0; gx < gcols; gx++) {
      const o = (gy * gcols + gx) * 4;
      const a = pixels[o + 3];
      if (a < 8) continue;
      const hx = gx * grain;
      const hy = gy * grain;
      const u = hx / width;
      const v = hy / height;
      // Mostly a left→right sweep, with a ragged front and plenty of speckle.
      const release = Math.round(
        (u * 0.65 + frontNoise(v) * 0.2 + Math.random() * 0.25) * SWEEP_TICKS
      );
      grains.push({
        hx,
        hy,
        x: startX + hx,
        y: startY + hy,
        vx: 0,
        vy: 0,
        release,
        life: 45 + Math.random() * 55,
        age: 0,
        color: `rgb(${pixels[o]}, ${pixels[o + 1]}, ${pixels[o + 2]})`,
        alpha: a / 255,
      });
    }
  }
  grains.sort((p, q) => p.release - q.release);

  let nextRelease = 0;
  let alive = 0;

  const loop = createLoop({
    step: (tick) => {
      // Let go of every grain whose time has come, and punch it out of the intact image.
      while (nextRelease < grains.length && grains[nextRelease].release <= tick) {
        const g = grains[nextRelease++];
        g.vx = 0.4 + Math.random() * 1.1;
        g.vy = -(0.2 + Math.random() * 0.9);
        rctx.clearRect(g.hx * sx, g.hy * sy, Math.ceil(grain * sx) + 1, Math.ceil(grain * sy) + 1);
        alive++;
      }
      // Drift: a breeze to the right, a little lift, and some curl so it swirls.
      for (let i = 0; i < nextRelease; i++) {
        const g = grains[i];
        if (g.age >= g.life) continue;
        g.age++;
        const curl = Math.sin(g.y * 0.03 + tick * 0.08) * 0.06;
        g.vx += 0.02 + curl;
        g.vy += -0.012 + Math.cos(g.x * 0.03 + tick * 0.07) * 0.04;
        g.vx *= 0.985;
        g.vy *= 0.985;
        g.x += g.vx;
        g.y += g.vy;
        if (g.age >= g.life) alive--;
      }
    },
    draw: () => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      if (nextRelease < grains.length) {
        ctx.drawImage(remaining, startX, startY, width, height);
      }
      for (let i = 0; i < nextRelease; i++) {
        const g = grains[i];
        if (g.age >= g.life) continue;
        const t = g.age / g.life;
        const size = grain * (1 - t * 0.6);
        ctx.globalAlpha = g.alpha * clamp(1 - t * t, 0, 1);
        ctx.fillStyle = g.color;
        ctx.fillRect(g.x, g.y, size, size);
      }
      ctx.globalAlpha = 1;
    },
    isSettled: () => nextRelease === grains.length && alive === 0,
    settleFrames: 1,
    onComplete,
  });

  return {
    start: loop.start,
    destroy: () => {
      loop.stop();
      // Release the big offscreen bitmap promptly.
      remaining.width = remaining.height = 0;
    },
  };
};
