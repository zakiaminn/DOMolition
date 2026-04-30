import Matter from 'matter-js';

// Configuration for the explosion. Mostly passed down from the React wrapper.
export interface ShatterOptions {
  width: number;
  height: number;
  rows?: number;
  cols?: number;
  shardCount?: number; // Optional fallback for other engines
  sourceCanvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  startX: number;
  startY: number;
  canvasWidth: number;
  canvasHeight: number;
  onComplete?: () => void;
}

// What we hand back to the React component so it can manage the lifecycle
export interface ShatterEngineInstance {
  engine: Matter.Engine;
  start: () => void;
  destroy: () => void;
}

// The classic grid factory function
export const createGridEngine = ({
  width,
  height,
  rows = 10,
  cols = 8,
  sourceCanvas,
  ctx,
  startX,
  startY,
  canvasWidth,
  canvasHeight,
  onComplete,
}: ShatterOptions): ShatterEngineInstance => {
  // Setup the physics world. Standard gravity pointing down.
  const engine = Matter.Engine.create();
  engine.gravity.y = 1;

  const bodies: Matter.Body[] = [];
  
  // Figure out how big each "shard" is gonna be based on our grid
  const pieceWidth = width / cols;
  const pieceHeight = height / rows;

  // Invisible boundaries so the pieces bounce around a bit instead of 
  // just falling into the void instantly. Floor is slightly below the screen.
  const floor = Matter.Bodies.rectangle(canvasWidth / 2, canvasHeight + 50, canvasWidth * 2, 100, { isStatic: true, friction: 0.8, restitution: 0.2 });
  const leftWall = Matter.Bodies.rectangle(-50, canvasHeight / 2, 100, canvasHeight * 2, { isStatic: true });
  const rightWall = Matter.Bodies.rectangle(canvasWidth + 50, canvasHeight / 2, 100, canvasHeight * 2, { isStatic: true });

  Matter.Composite.add(engine.world, [floor, leftWall, rightWall]);

  // 1. The Fracture: chop the UI into a grid of physical bodies
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const localX = col * pieceWidth;
      const localY = row * pieceHeight;

      // Start bodies exactly where they were on the screen before the explosion
      const x = startX + localX;
      const y = startY + localY;

      const body = Matter.Bodies.rectangle(
        x + pieceWidth / 2,
        y + pieceHeight / 2,
        pieceWidth,
        pieceHeight,
        {
          restitution: 0.4, // Bounciness
          friction: 0.8,
          density: 0.05,
          // We stash the canvas slice info here so the render loop knows what to draw
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

  // 2. The Explosion: apply an outward force from the center of the element
  const centerX = startX + width / 2;
  const centerY = startY + height / 2;

  bodies.forEach((body) => {
    // Vector from the center to this specific piece
    const dx = body.position.x - centerX;
    const dy = body.position.y - centerY;

    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    // Randomize the force a bit so it doesn't look too uniform/fake
    const forceMagnitude = (0.01 + Math.random() * 0.02) * body.mass;

    // Give it a push, with a slight bias upwards (-0.01) so it pops into the air
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

  // This syncs the Matter.js physics with our HTML5 canvas
  const renderLoop = (time: number) => {
    if (isDestroyed) return;
    renderFrameId = requestAnimationFrame(renderLoop);

    const delta = time - lastTime;
    lastTime = time;

    // Step the physics simulation forward (assuming 60fps)
    Matter.Engine.update(engine, 1000 / 60);

    // Wipe the previous frame
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    let allSleeping = true;

    bodies.forEach((body) => {
      // Check if things are still moving
      if (body.speed > 0.1 || body.angularVelocity > 0.01) {
        allSleeping = false;
      }

      const customData = body.plugin.domolition;
      if (!customData) return;

      ctx.save();
      // Standard canvas matrix math: move to the body's center, rotate, draw, then restore
      ctx.translate(body.position.x, body.position.y);
      ctx.rotate(body.angle);

      ctx.drawImage(
        sourceCanvas,
        customData.sourceX,
        customData.sourceY,
        customData.sourceWidth,
        customData.sourceHeight,
        -customData.width / 2, // draw offset so it rotates around its center
        -customData.height / 2,
        customData.width,
        customData.height
      );

      ctx.restore();
    });

    // We don't want the rAF loop running forever in the background.
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
      // Clean up everything so we don't leak memory if the component unmounts
      isDestroyed = true;
      if (renderFrameId) cancelAnimationFrame(renderFrameId);
      Matter.Engine.clear(engine);
      Matter.World.clear(engine.world, false);
    },
  };
};