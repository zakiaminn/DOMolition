import Matter from 'matter-js';
import {
  addBounds,
  createGridBodies,
  createLoop,
  drawRectBody,
  isBodyDone,
  keepVisible,
  type ShatterEngineInstance,
  type ShatterOptions,
} from './shared';

// The classic: a clean grid of rectangles, blown outward from the centre.
export const createGridEngine = (opts: ShatterOptions): ShatterEngineInstance => {
  const { width, height, rows = 10, cols = 8, sourceCanvas, ctx, startX, startY, canvasWidth, canvasHeight, onComplete } = opts;

  // Sleeping lets resting rubble go still for real, so the loop can end.
  const engine = Matter.Engine.create({ enableSleeping: true });
  engine.gravity.y = 1;
  addBounds(engine, canvasWidth, canvasHeight);

  const bodies = keepVisible(
    createGridBodies(opts, rows, cols, {
      restitution: 0.4, // Bounciness
      friction: 0.8,
      density: 0.05,
    }).bodies,
    canvasHeight
  );
  Matter.Composite.add(engine.world, bodies);

  // The explosion: push every piece away from the element's centre.
  const centerX = startX + width / 2;
  const centerY = startY + height / 2;
  bodies.forEach((body) => {
    const dx = body.position.x - centerX;
    const dy = body.position.y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    // Randomise the force a bit so it doesn't look uniform/fake.
    const forceMagnitude = (0.01 + Math.random() * 0.02) * body.mass;
    // Slight upward bias so it pops into the air before falling.
    Matter.Body.applyForce(body, body.position, {
      x: (dx / distance) * forceMagnitude,
      y: (dy / distance) * forceMagnitude - 0.01 * body.mass,
    });
    Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.5);
  });

  const loop = createLoop({
    step: () => Matter.Engine.update(engine, 1000 / 60),
    draw: () => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      for (const body of bodies) drawRectBody(ctx, body, sourceCanvas);
    },
    isSettled: (tick) => tick > 30 && bodies.every((b) => isBodyDone(b, canvasWidth, canvasHeight)),
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
