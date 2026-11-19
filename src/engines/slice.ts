import Matter from 'matter-js';
import {
  addBounds,
  createLoop,
  createPolyBody,
  drawPolyBody,
  isBodyDone,
  type ShatterEngineInstance,
  type ShatterOptions,
} from './shared';

type Pt = { x: number; y: number };

// Timeline, in physics ticks (60 per second).
const SLASH_TICKS = 7; // the blade crosses the element
const HANG_TICKS = 26; // halves hover and slide apart along the cut, gravity off
const GLOW_FADE_TICKS = 24;

/** Split a convex polygon along the infinite line through `p` with direction `d`. */
const splitPolygon = (poly: Pt[], p: Pt, d: Pt) => {
  const side = (v: Pt) => d.x * (v.y - p.y) - d.y * (v.x - p.x);
  const a: Pt[] = [];
  const b: Pt[] = [];
  const hits: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const v0 = poly[i];
    const v1 = poly[(i + 1) % poly.length];
    const s0 = side(v0);
    const s1 = side(v1);
    if (s0 >= 0) a.push(v0);
    if (s0 <= 0) b.push(v0);
    if ((s0 > 0 && s1 < 0) || (s0 < 0 && s1 > 0)) {
      const t = s0 / (s0 - s1);
      const hit = { x: v0.x + (v1.x - v0.x) * t, y: v0.y + (v1.y - v0.y) * t };
      a.push(hit);
      b.push(hit);
      hits.push(hit);
    }
  }
  return { a, b, hits };
};

/**
 * One clean katana stroke. A blade of light crosses the element, the two halves
 * hang for a beat and slide apart along the cut, then drop.
 */
export const createSliceEngine = ({
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
  const engine = Matter.Engine.create({ enableSleeping: true });
  engine.gravity.y = 0;
  addBounds(engine, canvasWidth, canvasHeight);

  // A diagonal-ish cut through somewhere near the middle.
  const angle = ((12 + Math.random() * 20) * Math.PI) / 180 * (Math.random() < 0.5 ? -1 : 1);
  let dir: Pt = { x: Math.cos(angle), y: Math.sin(angle) };
  const through: Pt = {
    x: width * (0.5 + (Math.random() - 0.5) * 0.3),
    y: height * (0.5 + (Math.random() - 0.5) * 0.3),
  };
  const rect: Pt[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const { a, b, hits } = splitPolygon(rect, through, dir);

  // Sweep the blade left to right.
  const [h0, h1] = hits[0].x <= hits[1].x ? [hits[0], hits[1]] : [hits[1], hits[0]];
  const bladeFrom = { x: startX + h0.x, y: startY + h0.y };
  const bladeTo = { x: startX + h1.x, y: startY + h1.y };

  const opts = { restitution: 0.15, friction: 0.8, density: 0.05, frictionAir: 0.004 };
  const halves = [createPolyBody(a, startX, startY, opts), createPolyBody(b, startX, startY, opts)].filter(
    (x): x is Matter.Body => !!x
  );

  // `dir` points "downhill" (positive y) so the upper half slides down the slope.
  if (dir.y < 0) dir = { x: -dir.x, y: -dir.y };
  // Normal pointing up and away from the cut.
  const up: Pt = dir.x >= 0 ? { x: dir.y, y: -dir.x } : { x: -dir.y, y: dir.x };
  const cutMidY = startY + (h0.y + h1.y) / 2;

  let cutTick = -1;
  let glow = 0;
  let blade = 0; // 0..1 how far across the blade has travelled

  const loop = createLoop({
    step: (tick) => {
      if (tick < SLASH_TICKS) {
        blade = (tick + 1) / SLASH_TICKS;
        glow = 1;
        return;
      }
      if (cutTick < 0) {
        cutTick = tick;
        Matter.Composite.add(engine.world, halves);
        for (const half of halves) {
          // Upper half slides off down the slope; lower half eases the other way.
          const isUpper = half.position.y < cutMidY;
          const along = isUpper ? 0.9 : -0.35;
          const apart = isUpper ? 0.35 : -0.25;
          Matter.Body.setVelocity(half, {
            x: dir.x * along + up.x * apart,
            y: dir.y * along + up.y * apart,
          });
        }
      }
      const since = tick - cutTick;
      glow = Math.max(0, 1 - since / GLOW_FADE_TICKS);
      if (since === HANG_TICKS) {
        engine.gravity.y = 1;
        for (const half of halves) {
          const isUpper = half.position.y < cutMidY;
          Matter.Body.setAngularVelocity(half, (isUpper ? 1 : -1) * Math.sign(dir.x || 1) * (0.01 + Math.random() * 0.02));
        }
      }
      Matter.Engine.update(engine, 1000 / 60);
    },
    draw: () => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      if (cutTick < 0) {
        ctx.drawImage(sourceCanvas, startX, startY, width, height);
      } else {
        for (const half of halves) drawPolyBody(ctx, half, sourceCanvas, width, height);
      }

      if (glow > 0) {
        // The blade: a hot white line with a soft glow, overshooting the element a little.
        const over = 28;
        const len = Math.hypot(bladeTo.x - bladeFrom.x, bladeTo.y - bladeFrom.y) || 1;
        const ux = (bladeTo.x - bladeFrom.x) / len;
        const uy = (bladeTo.y - bladeFrom.y) / len;
        const sx = bladeFrom.x - ux * over;
        const sy = bladeFrom.y - uy * over;
        const reach = (len + over * 2) * blade;
        ctx.save();
        ctx.globalAlpha = glow;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
        ctx.shadowBlur = 18;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + ux * reach, sy + uy * reach);
        ctx.stroke();
        ctx.restore();
      }
    },
    isSettled: () =>
      cutTick >= 0 && glow === 0 && engine.gravity.y > 0 && halves.every((h) => isBodyDone(h, canvasWidth, canvasHeight)),
    onComplete,
  });

  return {
    engine,
    start: loop.start,
    destroy: () => {
      loop.stop();
      Matter.Engine.clear(engine);
      Matter.World.clear(engine.world, false);
    },
  };
};
