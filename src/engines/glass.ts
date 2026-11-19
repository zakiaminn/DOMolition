import Matter from 'matter-js';
import { Delaunay } from 'd3-delaunay';
import {
  addBounds,
  createLoop,
  createPolyBody,
  drawPolyBody,
  isBodyDone,
  seededRandom,
  type ShatterEngineInstance,
  type ShatterOptions,
} from './shared';

// Kept for backwards compatibility with anything importing types from here.
export type { ShatterEngineInstance, ShatterOptions } from './shared';

// How long the cracked pane holds before it lets go.
const PRE_FRACTURE_MS = 250;

/**
 * Deterministic point generator.
 * Evenly distributed but jagged points from a fixed seed, so the pre-fracture
 * cracks line up exactly with the shards that fall, and no cell is so tiny that
 * Matter throws it away.
 */
const generatePoints = (width: number, height: number, targetCount: number) => {
  const ratio = width / height;
  const cols = Math.max(2, Math.round(Math.sqrt(targetCount * ratio)));
  const rows = Math.max(2, Math.round(targetCount / cols));
  const actualCount = rows * cols;
  const cellW = width / cols;
  const cellH = height / rows;

  const points = new Float64Array(actualCount * 2);
  const random = seededRandom(42);
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Jitter keeps it looking like organic glass, but guarantees volume.
      points[idx++] = c * cellW + cellW / 2 + (random() - 0.5) * cellW * 0.8;
      points[idx++] = r * cellH + cellH / 2 + (random() - 0.5) * cellH * 0.8;
    }
  }
  return { points, actualCount };
};

const buildVoronoi = (width: number, height: number, shardCount: number) => {
  const { points, actualCount } = generatePoints(width, height, shardCount);
  return { voronoi: new Delaunay(points).voronoi([0, 0, width, height]), actualCount };
};

export const drawGlassCracks = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  shardCount: number,
  startX: number,
  startY: number
) => {
  const { voronoi, actualCount } = buildVoronoi(width, height, shardCount);
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
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

// Brittle fracture: cracks appear, hold for a beat, then the pane shatters.
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
  const engine = Matter.Engine.create({ enableSleeping: true });
  engine.gravity.y = 1;
  addBounds(engine, canvasWidth, canvasHeight);

  const { voronoi, actualCount } = buildVoronoi(width, height, shardCount);
  const bodies: Matter.Body[] = [];
  for (let i = 0; i < actualCount; i++) {
    const polygon = voronoi.cellPolygon(i);
    if (!polygon) continue;
    // d3 closes the ring by repeating the first point; Matter doesn't want that.
    const vertices = polygon.slice(0, -1).map((p) => ({ x: p[0], y: p[1] }));
    const body = createPolyBody(vertices, startX, startY, {
      restitution: 0.3, // Brittle
      friction: 0.8,
      density: 0.05,
      frictionAir: 0.01, // A little drag keeps shards from tunnelling at terminal velocity
    });
    if (body && body.bounds.min.y < canvasHeight) bodies.push(body);
  }

  const centerX = startX + width / 2;
  const centerY = startY + height / 2;
  const blast = () => {
    for (const body of bodies) {
      const dx = body.position.x - centerX;
      const dy = body.position.y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      // Gentle force so it drops heavy rather than blasting off-screen.
      const forceMagnitude = (0.003 + Math.random() * 0.005) * body.mass;
      Matter.Body.applyForce(body, body.position, {
        x: (dx / distance) * forceMagnitude,
        y: (dy / distance) * forceMagnitude - 0.002 * body.mass,
      });
      Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.4);
    }
  };

  const loop = createLoop({
    step: () => Matter.Engine.update(engine, 1000 / 60),
    draw: () => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      for (const body of bodies) drawPolyBody(ctx, body, sourceCanvas, width, height);
    },
    isSettled: (tick) => tick > 30 && bodies.every((b) => isBodyDone(b, canvasWidth, canvasHeight)),
    onComplete,
  });

  let fractureTimer: ReturnType<typeof setTimeout> | undefined;

  return {
    engine,
    start: () => {
      // Pre-fracture: show the intact UI with cracks drawn over it, then let go.
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.drawImage(sourceCanvas, startX, startY, width, height);
      drawGlassCracks(ctx, width, height, shardCount, startX, startY);
      fractureTimer = setTimeout(() => {
        Matter.Composite.add(engine.world, bodies);
        blast();
        loop.start();
      }, PRE_FRACTURE_MS);
    },
    destroy: () => {
      clearTimeout(fractureTimer);
      loop.stop();
      Matter.Engine.clear(engine);
      Matter.World.clear(engine.world, false);
    },
  };
};
