import Matter from 'matter-js';
import {
  createGridBodies,
  createLoop,
  drawRectBody,
  type ShatterEngineInstance,
  type ShatterOptions,
} from './shared';

// The black hole: zero gravity, every piece is dragged into the centre and crushed.
export const createImplodeEngine = (opts: ShatterOptions): ShatterEngineInstance => {
  const { width, height, rows = 15, cols = 15, sourceCanvas, ctx, startX, startY, canvasWidth, canvasHeight, onComplete } = opts;

  const engine = Matter.Engine.create();
  engine.gravity.y = 0;
  engine.gravity.x = 0;

  const { bodies, pieceWidth, pieceHeight } = createGridBodies(opts, rows, cols, {
    frictionAir: 0.05, // Drag so they swirl instead of shooting straight in
    collisionFilter: { group: -1 }, // Pieces pass through each other
  });
  Matter.Composite.add(engine.world, bodies);

  const centerX = startX + width / 2;
  const centerY = startY + height / 2;
  const fullArea = pieceWidth * pieceHeight;
  const crushed = new Set<Matter.Body>();

  const loop = createLoop({
    step: () => {
      for (const body of bodies) {
        if (crushed.has(body)) continue;
        const dx = centerX - body.position.x;
        const dy = centerY - body.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        if (distance > 5) {
          const pullStrength = 0.0005 * body.mass;
          Matter.Body.applyForce(body, body.position, {
            x: (dx / distance) * pullStrength,
            y: (dy / distance) * pullStrength,
          });
          Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.8);
        } else {
          // Hit the singularity: shrink out of existence.
          Matter.Body.scale(body, 0.8, 0.8);
          if (body.area / fullArea < 0.002) crushed.add(body);
        }
      }
      Matter.Engine.update(engine, 1000 / 60);
    },
    draw: () => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      for (const body of bodies) {
        if (crushed.has(body)) continue;
        drawRectBody(ctx, body, sourceCanvas, Math.sqrt(body.area / fullArea));
      }
    },
    isSettled: (tick) => tick > 60 && crushed.size === bodies.length,
    settleFrames: 1,
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
