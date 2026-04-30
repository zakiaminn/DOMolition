import Matter from 'matter-js';

export interface ShatterOptions {
  width: number;
  height: number;
  rows?: number;
  cols?: number;
  shardCount?: number;
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

// The Black Hole factory function
export const createImplodeEngine = ({
  width,
  height,
  rows = 15,
  cols = 15,
  sourceCanvas,
  ctx,
  startX,
  startY,
  canvasWidth,
  canvasHeight,
  onComplete,
}: ShatterOptions): ShatterEngineInstance => {
  // Setup the physics world. Zero gravity for the black hole effect.
  const engine = Matter.Engine.create();
  engine.gravity.y = 0; 
  engine.gravity.x = 0;

  const bodies: Matter.Body[] = [];
  
  // Figure out how big each "shard" is gonna be based on our grid
  const pieceWidth = width / cols;
  const pieceHeight = height / rows;

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
          frictionAir: 0.05, // Adds "drag" so they swirl instead of shooting straight in
          collisionFilter: {
            group: -1, // So pieces don't collide with each other
          },
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

  const centerX = startX + width / 2;
  const centerY = startY + height / 2;

  let renderFrameId: number;
  let lastTime = performance.now();
  let isDestroyed = false;
  let ticks = 0;

  // This syncs the Matter.js physics with our HTML5 canvas
  const renderLoop = (time: number) => {
    if (isDestroyed) return;
    renderFrameId = requestAnimationFrame(renderLoop);

    const delta = time - lastTime;
    lastTime = time;
    ticks++;

    // Step the physics simulation forward (assuming 60fps)
    Matter.Engine.update(engine, 1000 / 60);

    // Wipe the previous frame
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    let allCrushed = true;

    bodies.forEach((body) => {
      // 2. The Implosion: apply a massive force TOWARDS the center every frame
      const dx = centerX - body.position.x;
      const dy = centerY - body.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;

      // If the piece is further than 5 pixels from the center, keep pulling it in
      if (distance > 5) {
        allCrushed = false;
        
        // The closer it gets, the stronger the pull (like real gravity)
        const pullStrength = 0.0005 * body.mass; 
        
        Matter.Body.applyForce(body, body.position, {
          x: (dx / distance) * pullStrength,
          y: (dy / distance) * pullStrength,
        });

        Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.8);
      } else {
        // If it hits the absolute center singularity, shrink it out of existence
        Matter.Body.scale(body, 0.8, 0.8); 
      }

      const customData = body.plugin.domolition;
      if (!customData) return;

      ctx.save();
      // Standard canvas matrix math: move to the body's center, rotate, draw, then restore
      ctx.translate(body.position.x, body.position.y);
      ctx.rotate(body.angle);
      
      // Calculate how small to draw the piece based on the shrinking area
      const scale = body.area / (pieceWidth * pieceHeight);
      ctx.scale(scale, scale);

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
    if (allCrushed && ticks > 60) {
      if (renderFrameId) cancelAnimationFrame(renderFrameId);
      onComplete?.();
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