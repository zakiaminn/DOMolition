import Matter from 'matter-js';

export interface ShatterOptions {
  width: number;
  height: number;
  rows: number;
  cols: number;
  sourceCanvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  startX: number;
  startY: number;
  canvasWidth: number;
  canvasHeight: number;
  onComplete?: () => void;
}

export interface ShatterEngineInstance {
  engine: Matter.Engine;
  start: () => void;
  destroy: () => void;
}

export const createShatterEngine = ({
  width,
  height,
  rows,
  cols,
  sourceCanvas,
  ctx,
  startX,
  startY,
  canvasWidth,
  canvasHeight,
  onComplete,
}: ShatterOptions): ShatterEngineInstance => {
  const engine = Matter.Engine.create();
  engine.gravity.y = 1;

  const bodies: Matter.Body[] = [];
  const pieceWidth = width / cols;
  const pieceHeight = height / rows;

  // Floor boundary (slightly below the visible canvas or exactly at the bottom)
  const floor = Matter.Bodies.rectangle(
    canvasWidth / 2,
    canvasHeight + 50,
    canvasWidth * 2, // extra wide just in case
    100,
    { isStatic: true, friction: 0.8, restitution: 0.2 }
  );
  
  const leftWall = Matter.Bodies.rectangle(
    -50,
    canvasHeight / 2,
    100,
    canvasHeight * 2,
    { isStatic: true }
  );

  const rightWall = Matter.Bodies.rectangle(
    canvasWidth + 50,
    canvasHeight / 2,
    100,
    canvasHeight * 2,
    { isStatic: true }
  );

  Matter.Composite.add(engine.world, [floor, leftWall, rightWall]);

  // 1. The Fracture: create bodies for each grid cell
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const localX = col * pieceWidth;
      const localY = row * pieceHeight;

      // Start bodies at their absolute position on the screen
      const x = startX + localX;
      const y = startY + localY;

      const body = Matter.Bodies.rectangle(
        x + pieceWidth / 2,
        y + pieceHeight / 2,
        pieceWidth,
        pieceHeight,
        {
          restitution: 0.4,
          friction: 0.8,
          density: 0.05,
          plugin: {
            domolition: {
              sourceX: localX * (sourceCanvas.width / width),
              sourceY: localY * (sourceCanvas.height / height),
              sourceWidth: pieceWidth * (sourceCanvas.width / width),
              sourceHeight: pieceHeight * (sourceCanvas.height / height),
              width: pieceWidth,
              height: pieceHeight,
            },
          },
        }
      );
      bodies.push(body);
    }
  }

  Matter.Composite.add(engine.world, bodies);

  // 2. The Explosion: apply forces
  const centerX = startX + width / 2;
  const centerY = startY + height / 2;

  bodies.forEach((body) => {
    const dx = body.position.x - centerX;
    const dy = body.position.y - centerY;

    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const forceMagnitude = (0.01 + Math.random() * 0.02) * body.mass;

    Matter.Body.applyForce(body, body.position, {
      x: (dx / distance) * forceMagnitude,
      y: (dy / distance) * forceMagnitude - 0.01 * body.mass,
    });

    Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.5);
  });

  let renderFrameId: number;
  let lastTime = performance.now();
  let isDestroyed = false;
  let sleepCounter = 0;

  const renderLoop = (time: number) => {
    if (isDestroyed) return;
    renderFrameId = requestAnimationFrame(renderLoop);

    const delta = time - lastTime;
    lastTime = time;

    Matter.Engine.update(engine, 1000 / 60);

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    let allSleeping = true;

    bodies.forEach((body) => {
      if (body.speed > 0.1 || body.angularVelocity > 0.01) {
        allSleeping = false;
      }

      const customData = body.plugin.domolition;
      if (!customData) return;

      ctx.save();
      ctx.translate(body.position.x, body.position.y);
      ctx.rotate(body.angle);

      ctx.drawImage(
        sourceCanvas,
        customData.sourceX,
        customData.sourceY,
        customData.sourceWidth,
        customData.sourceHeight,
        -customData.width / 2,
        -customData.height / 2,
        customData.width,
        customData.height
      );

      ctx.restore();
    });

    // If pieces have stopped moving for a short duration, trigger complete
    if (allSleeping) {
      sleepCounter++;
      if (sleepCounter > 60) {
        if (renderFrameId) cancelAnimationFrame(renderFrameId);
        onComplete?.();
      }
    } else {
      sleepCounter = 0;
    }
  };

  return {
    engine,
    start: () => {
      lastTime = performance.now();
      renderFrameId = requestAnimationFrame(renderLoop);
    },
    destroy: () => {
      isDestroyed = true;
      if (renderFrameId) {
        cancelAnimationFrame(renderFrameId);
      }
      Matter.Engine.clear(engine);
      Matter.World.clear(engine.world, false);
    },
  };
};
