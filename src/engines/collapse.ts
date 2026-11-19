import Matter from 'matter-js';
import {
  addBounds,
  clamp,
  createGridBodies,
  createLoop,
  drawRectBody,
  isBodyDone,
  keepVisible,
  STEP_MS,
  type ShatterEngineInstance,
  type ShatterOptions,
} from './shared';

// How long the building rumbles before the charges go.
const RUMBLE_MS = 320;
const MAX_DUST = 160;

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  age: number;
  life: number;
}

/**
 * Controlled demolition. The structure shudders, then gives way from the bottom
 * up, caving in toward the middle, and settles into a heap in its own
 * footprint with a puff of dust where the rubble lands.
 */
export const createCollapseEngine = (opts: ShatterOptions): ShatterEngineInstance => {
  const { width, rows = 10, cols = 8, sourceCanvas, ctx, startX, canvasWidth, canvasHeight, onComplete } = opts;

  const engine = Matter.Engine.create({ enableSleeping: true });
  engine.gravity.y = 1;
  const floor = addBounds(engine, canvasWidth, canvasHeight);

  const bodies = keepVisible(
    createGridBodies(opts, rows, cols, {
      restitution: 0.05, // Masonry doesn't bounce
      friction: 0.9,
      density: 0.05,
    }).bodies,
    canvasHeight
  );

  // Release schedule: bottom rows first, and the middle columns a little before
  // the edges so the building folds in on itself instead of toppling over.
  const rowGapTicks = clamp(Math.round(36 / rows), 2, 6);
  const centreCol = (cols - 1) / 2;
  const rumbleTicks = Math.round(RUMBLE_MS / STEP_MS);
  const schedule = bodies
    .map((body) => {
      const { row, col } = body.plugin.domolition as { row: number; col: number };
      const fromBottom = rows - 1 - row;
      const edgeness = centreCol > 0 ? Math.abs(col - centreCol) / centreCol : 0;
      const at = rumbleTicks + fromBottom * rowGapTicks + Math.round(edgeness * 6 + Math.random() * 4);
      return { body, at, col };
    })
    .sort((a, b) => a.at - b.at);

  const released = new Set<Matter.Body>();
  let nextRelease = 0;
  const dust: Dust[] = [];
  const centerX = startX + width / 2;

  // Kick up dust where falling rubble meets the floor.
  Matter.Events.on(engine, 'collisionStart', (event) => {
    for (const pair of event.pairs) {
      const other = pair.bodyA === floor ? pair.bodyB : pair.bodyB === floor ? pair.bodyA : null;
      if (!other || other.speed < 2 || dust.length >= MAX_DUST) continue;
      const puffs = 3;
      for (let i = 0; i < puffs; i++) {
        dust.push({
          x: other.position.x + (Math.random() - 0.5) * 20,
          y: canvasHeight - 4,
          vx: (Math.random() - 0.5) * 2.4,
          vy: -(0.4 + Math.random() * 1.2),
          r: 6 + Math.random() * 10,
          age: 0,
          life: 50 + Math.random() * 40,
        });
      }
    }
  });

  let shakeX = 0;

  const loop = createLoop({
    step: (tick) => {
      // The rumble: the still-standing structure shudders before it goes.
      shakeX = tick < rumbleTicks ? (Math.random() - 0.5) * 3 * (tick / rumbleTicks) : 0;

      while (nextRelease < schedule.length && schedule[nextRelease].at <= tick) {
        const { body, col } = schedule[nextRelease++];
        Matter.Composite.add(engine.world, body);
        released.add(body);
        // Lean inward toward the centre line, plus a little scatter.
        const lean = (centerX - body.position.x) / Math.max(width, 1);
        Matter.Body.setVelocity(body, { x: lean * 2.5 + (Math.random() - 0.5) * 0.8, y: 0.5 });
        Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.06 + (col < centreCol ? 0.02 : -0.02));
      }

      Matter.Engine.update(engine, 1000 / 60);

      for (let i = dust.length - 1; i >= 0; i--) {
        const d = dust[i];
        d.age++;
        d.x += d.vx;
        d.y += d.vy;
        d.vx *= 0.97;
        d.vy *= 0.97;
        d.r += 0.35;
        if (d.age >= d.life) dust.splice(i, 1);
      }
    },
    draw: () => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      for (const { body } of schedule) {
        if (released.has(body)) {
          drawRectBody(ctx, body, sourceCanvas);
        } else {
          // Not yet blown: draw it where it stands (shaking during the rumble).
          ctx.save();
          ctx.translate(shakeX, 0);
          drawRectBody(ctx, body, sourceCanvas);
          ctx.restore();
        }
      }
      for (const d of dust) {
        const a = 0.28 * (1 - d.age / d.life);
        ctx.fillStyle = `rgba(150, 148, 136, ${a})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    isSettled: () =>
      nextRelease === schedule.length &&
      dust.length === 0 &&
      bodies.every((b) => isBodyDone(b, canvasWidth, canvasHeight)),
    onComplete,
  });

  return {
    engine,
    start: loop.start,
    destroy: () => {
      loop.stop();
      Matter.Events.off(engine, 'collisionStart');
      Matter.Engine.clear(engine);
      Matter.World.clear(engine.world, false);
    },
  };
};
