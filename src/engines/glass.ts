import Matter from 'matter-js';
import { Delaunay } from 'd3-delaunay';

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

/**
 * --- THE FIX: Deterministic Point Generator ---
 * Generates evenly distributed but jagged points using a fixed seed. 
 * This ensures the pre-fracture cracks perfectly match the falling shards, 
 * and prevents Matter.js from silently deleting microscopic slivers.
 */
const generatePoints = (width: number, height: number, targetCount: number) => {
  const ratio = width / height;
  const cols = Math.max(2, Math.round(Math.sqrt(targetCount * ratio)));
  const rows = Math.max(2, Math.round(targetCount / cols));
  const actualCount = rows * cols;
  
  const cellW = width / cols;
  const cellH = height / rows;
  
  const points = new Float64Array(actualCount * 2);
  let idx = 0;
  let seed = 42; // Fixed mathematical seed 
  
  // A simple, predictable pseudo-random number generator
  const random = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Jitter keeps them looking like organic glass, but guarantees volume
      const jitterX = (random() - 0.5) * cellW * 0.8;
      const jitterY = (random() - 0.5) * cellH * 0.8;
      points[idx++] = c * cellW + cellW / 2 + jitterX;
      points[idx++] = r * cellH + cellH / 2 + jitterY;
    }
  }
  return { points, actualCount };
};

export const drawGlassCracks = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  shardCount: number,
  startX: number,
  startY: number
) => {
  const { points, actualCount } = generatePoints(width, height, shardCount);
  const delaunay = new Delaunay(points);
  const voronoi = delaunay.voronoi([0, 0, width, height]);

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)"; 
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  for (let i = 0; i < actualCount; i++) {
    const polygon = voronoi.cellPolygon(i);
    if (!polygon) continue;
    
    polygon.forEach((p, j) => {
      if (j === 0) ctx.moveTo(startX + p[0], startY + p[1]);
      else ctx.lineTo(startX + p[0], startY + p[1]);
    });
  }

  ctx.stroke();
  ctx.restore();
};

export const createGlassEngine = ({
  width,
  height,
  shardCount = 150, 
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

  const wallThickness = 1000;
  const floor = Matter.Bodies.rectangle(canvasWidth / 2, canvasHeight + (wallThickness / 2), canvasWidth * 3, wallThickness, { isStatic: true, friction: 0.8, restitution: 0.2 });
  const leftWall = Matter.Bodies.rectangle(0 - (wallThickness / 2), canvasHeight / 2, wallThickness, canvasHeight * 4, { isStatic: true });
  const rightWall = Matter.Bodies.rectangle(canvasWidth + (wallThickness / 2), canvasHeight / 2, wallThickness, canvasHeight * 4, { isStatic: true });
  const ceiling = Matter.Bodies.rectangle(canvasWidth / 2, -1000, canvasWidth * 3, wallThickness, { isStatic: true });

  Matter.Composite.add(engine.world, [floor, leftWall, rightWall, ceiling]);

  const { points, actualCount } = generatePoints(width, height, shardCount);
  const delaunay = new Delaunay(points);
  const voronoi = delaunay.voronoi([0, 0, width, height]);

  const bodies: Matter.Body[] = [];

  for (let i = 0; i < actualCount; i++) {
    const polygon = voronoi.cellPolygon(i);
    if (!polygon) continue;

    const vertices = polygon.map(p => ({ x: p[0], y: p[1] }));
    const center = Matter.Vertices.centre(vertices);

    const body = Matter.Bodies.fromVertices(
      startX + center.x,
      startY + center.y,
      [vertices],
      {
        restitution: 0.3, // Brittle
        friction: 0.8,
        density: 0.05,
        frictionAir: 0.01, // Tiny drag prevents shards from reaching terminal "tunneling" velocity
        plugin: {
          domolition: {
            originalX: startX + center.x,
            originalY: startY + center.y,
          },
        },
      },
      true 
    );

    if (body) bodies.push(body);
  }

  Matter.Composite.add(engine.world, bodies);

  const centerX = startX + width / 2;
  const centerY = startY + height / 2;

  bodies.forEach((body) => {
    const dx = body.position.x - centerX;
    const dy = body.position.y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    
    // Lowered explosion force so it "drops" heavy rather than blasting off-screen
    const forceMagnitude = (0.003 + Math.random() * 0.005) * body.mass;

    Matter.Body.applyForce(body, body.position, {
      x: (dx / distance) * forceMagnitude,
      y: (dy / distance) * forceMagnitude - 0.002 * body.mass,
    });
    Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.4);
  });

  let renderFrameId: number;
  let lastTime = performance.now();
  let isDestroyed = false;
  let sleepCounter = 0;

  const renderLoop = (time: number) => {
    if (isDestroyed) return;
    renderFrameId = requestAnimationFrame(renderLoop);

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
      
      ctx.beginPath();
      body.vertices.forEach((v, i) => {
        if (i === 0) ctx.moveTo(v.x, v.y);
        else ctx.lineTo(v.x, v.y);
      });
      ctx.closePath();
      ctx.clip(); 

      ctx.translate(body.position.x, body.position.y);
      ctx.rotate(body.angle);

      const offsetX = startX - customData.originalX;
      const offsetY = startY - customData.originalY;

      ctx.drawImage(
        sourceCanvas,
        offsetX,
        offsetY, 
        width, 
        height
      );

      ctx.restore();
    });

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
      if (renderFrameId) cancelAnimationFrame(renderFrameId);
      Matter.Engine.clear(engine);
      Matter.World.clear(engine.world, false);
    },
  };
};