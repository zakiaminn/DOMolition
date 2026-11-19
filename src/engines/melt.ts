import { clamp, createLoop, sourceScale, type ShatterEngineInstance, type ShatterOptions } from './shared';

/**
 * The UI loses structural integrity and drips off the screen. Narrow vertical
 * strips sag at slightly different rates (smoothed so neighbours drip
 * together), stretching as they go, like wax off a candle. No physics engine;
 * this one is pure canvas.
 */
export const createMeltEngine = ({
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
  const stripW = clamp(width / 220, 2, 6);
  const count = Math.ceil(width / stripW);

  // Smooth noise: random control values every ~50px, cosine-interpolated, so
  // neighbouring strips sag together into wide drips. Only a hint of per-strip
  // grit, or the text shreds apart instead of melting.
  const knotEvery = Math.max(3, Math.round(50 / stripW));
  const knots = Array.from({ length: Math.ceil(count / knotEvery) + 2 }, () => Math.random());
  const smooth = (i: number) => {
    const k = i / knotEvery;
    const k0 = Math.floor(k);
    const t = (1 - Math.cos((k - k0) * Math.PI)) / 2;
    return knots[k0] * (1 - t) + knots[k0 + 1] * t;
  };

  const strips = Array.from({ length: count }, (_, i) => {
    const n = smooth(i);
    return {
      x: i * stripW,
      w: Math.min(stripW, width - i * stripW),
      delay: (1 - n) * 30 + Math.random() * 1.5, // ticks before it starts to sag
      accel: 0.05 + n * 0.09 + Math.random() * 0.003, // px / tick²
      y: 0, // how far it has fallen
      v: 0,
    };
  });

  // Done once every strip's top edge has left the bottom of the screen.
  const exitDistance = canvasHeight - startY + 4;

  const loop = createLoop({
    step: (tick) => {
      for (const s of strips) {
        if (tick < s.delay) continue;
        s.v += s.accel;
        s.y += s.v;
      }
    },
    draw: () => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      for (const s of strips) {
        if (s.y > exitDistance) continue;
        // Stretch: the further it has fallen, the longer the drip.
        const stretch = 1 + Math.min(s.y / height, 1.5) * 0.6;
        const fade = clamp(1 - (s.y - height * 0.4) / (height * 1.2), 0, 1);
        if (fade <= 0) continue;
        ctx.globalAlpha = fade;
        ctx.drawImage(
          sourceCanvas,
          s.x * sx, 0, s.w * sx, height * sy,
          // +0.5 overlap hides seams between strips
          startX + s.x, startY + s.y, s.w + 0.5, height * stretch
        );
      }
      ctx.globalAlpha = 1;
    },
    isSettled: () =>
      strips.every((s) => s.y > exitDistance || s.y - height * 0.4 > height * 1.2),
    settleFrames: 1,
    onComplete,
  });

  return { start: loop.start, destroy: loop.stop };
};
