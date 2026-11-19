import Matter from 'matter-js';

// Configuration every engine receives. Mostly passed down from the React wrapper.
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

// What we hand back to the React component so it can manage the lifecycle.
// `engine` is only present for the Matter-backed effects.
export interface ShatterEngineInstance {
  engine?: Matter.Engine;
  start: () => void;
  destroy: () => void;
}

// One physics tick. Matter is happiest with a fixed step, so we accumulate real
// frame time and step in fixed slices. That keeps 120Hz screens from running
// the simulation at double speed.
export const STEP_MS = 1000 / 60;

interface LoopConfig {
  /** Advance the simulation by one fixed tick. `tick` counts from 0. */
  step: (tick: number) => void;
  /** Paint the current state. Called once per animation frame. */
  draw: () => void;
  /** True once nothing interesting is moving any more. */
  isSettled: (tick: number) => boolean;
  onComplete?: () => void;
  /** Hard stop so a jittery pile can never keep the loop alive forever. */
  maxDurationMs?: number;
  /** How many consecutive settled frames count as "done". */
  settleFrames?: number;
}

/**
 * The shared render loop. It stops itself once the scene settles (or the hard
 * time limit passes), fires `onComplete` exactly once, and leaves the last
 * frame on the canvas so the rubble stays put.
 */
export const createLoop = ({
  step,
  draw,
  isSettled,
  onComplete,
  maxDurationMs = 9000,
  settleFrames = 20,
}: LoopConfig) => {
  let rafId = 0;
  let last = 0;
  let acc = 0;
  let tick = 0;
  let calm = 0;
  let stopped = false;

  const frame = (now: number) => {
    if (stopped) return;
    // Clamp huge gaps (tab switched away) so we don't fast-forward wildly.
    acc += Math.min(now - last, 100);
    last = now;

    let steps = 0;
    while (acc >= STEP_MS && steps < 4) {
      step(tick++);
      acc -= STEP_MS;
      steps++;
    }
    if (steps === 4) acc = 0;

    draw();

    calm = isSettled(tick) ? calm + 1 : 0;
    if (calm >= settleFrames || tick * STEP_MS >= maxDurationMs) {
      stopped = true;
      onComplete?.();
      return;
    }
    rafId = requestAnimationFrame(frame);
  };

  return {
    start: () => {
      last = performance.now();
      // Take one step right away so the first painted frame already shows motion.
      step(tick++);
      rafId = requestAnimationFrame(frame);
    },
    stop: () => {
      stopped = true;
      cancelAnimationFrame(rafId);
    },
  };
};

/** Thick static walls, floor and ceiling around the viewport. Thick so fast pieces can't tunnel. */
export const addBounds = (engine: Matter.Engine, canvasWidth: number, canvasHeight: number) => {
  const t = 1000;
  const floor = Matter.Bodies.rectangle(canvasWidth / 2, canvasHeight + t / 2, canvasWidth * 3, t, {
    isStatic: true,
    friction: 0.8,
    restitution: 0.2,
  });
  const leftWall = Matter.Bodies.rectangle(-t / 2, canvasHeight / 2, t, canvasHeight * 6, { isStatic: true });
  const rightWall = Matter.Bodies.rectangle(canvasWidth + t / 2, canvasHeight / 2, t, canvasHeight * 6, { isStatic: true });
  const ceiling = Matter.Bodies.rectangle(canvasWidth / 2, -canvasHeight * 2 - t / 2, canvasWidth * 3, t, { isStatic: true });
  Matter.Composite.add(engine.world, [floor, leftWall, rightWall, ceiling]);
  return floor;
};

/** A body counts as done once it's asleep or has left the visible area. */
export const isBodyDone = (body: Matter.Body, canvasWidth: number, canvasHeight: number) =>
  body.isSleeping ||
  body.bounds.min.y > canvasHeight + 20 ||
  body.bounds.max.x < -20 ||
  body.bounds.min.x > canvasWidth + 20;

/**
 * Pieces that start entirely below the viewport would spawn inside the floor
 * and get flung out. Nobody can see them anyway, so drop them.
 */
export const keepVisible = (bodies: Matter.Body[], canvasHeight: number) =>
  bodies.filter((b) => b.bounds.min.y < canvasHeight);

/** Pixels in the captured bitmap per CSS pixel of the element. */
export const sourceScale = (sourceCanvas: HTMLCanvasElement, width: number, height: number) => ({
  sx: sourceCanvas.width / width,
  sy: sourceCanvas.height / height,
});

// Data stashed on a polygon body so the renderer knows which slice of the bitmap it owns.
export interface PolyPiece {
  // Where the body's centre of mass sat, in element-local CSS px, before anything moved.
  homeX: number;
  homeY: number;
  // The piece's local bounding box (element-local CSS px), used to blit only what's needed.
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Build a convex polygon body from element-local vertices.
 * Matter's `fromVertices` ignores the x/y you hand it for single-part bodies,
 * so we pass world-space vertices and read the real centre back afterwards.
 */
export const createPolyBody = (
  localVertices: { x: number; y: number }[],
  startX: number,
  startY: number,
  options: Matter.IChamferableBodyDefinition = {}
): Matter.Body | null => {
  const world = localVertices.map((p) => ({ x: p.x + startX, y: p.y + startY }));
  const centre = Matter.Vertices.centre(world);
  const body = Matter.Bodies.fromVertices(centre.x, centre.y, [world], options, true);
  if (!body) return null;
  // Defensive: make sure the centre is where we think, whatever path Matter took.
  Matter.Body.setPosition(body, centre);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of localVertices) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const piece: PolyPiece = {
    homeX: body.position.x - startX,
    homeY: body.position.y - startY,
    minX, minY, maxX, maxY,
  };
  body.plugin = { ...(body.plugin || {}), domolition: piece };
  return body;
};

/** Paint a polygon body: clip to its current outline, then blit its slice of the bitmap. */
export const drawPolyBody = (
  ctx: CanvasRenderingContext2D,
  body: Matter.Body,
  sourceCanvas: HTMLCanvasElement,
  width: number,
  height: number
) => {
  const piece: PolyPiece | undefined = body.plugin?.domolition;
  if (!piece) return;
  const { sx, sy } = sourceScale(sourceCanvas, width, height);

  ctx.save();
  ctx.beginPath();
  const v = body.vertices;
  ctx.moveTo(v[0].x, v[0].y);
  for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
  ctx.closePath();
  ctx.clip();

  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);

  // Pad by a pixel so neighbouring pieces don't show hairline seams.
  const x0 = Math.max(0, piece.minX - 1);
  const y0 = Math.max(0, piece.minY - 1);
  const x1 = Math.min(width, piece.maxX + 1);
  const y1 = Math.min(height, piece.maxY + 1);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w > 0 && h > 0) {
    ctx.drawImage(sourceCanvas, x0 * sx, y0 * sy, w * sx, h * sy, x0 - piece.homeX, y0 - piece.homeY, w, h);
  }
  ctx.restore();
};

// Data stashed on a rectangle body (grid-style effects).
export interface RectPiece {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
}

/** Chop the element into a rows × cols grid of rectangle bodies, positioned where they sit on screen. */
export const createGridBodies = (
  opts: Pick<ShatterOptions, 'width' | 'height' | 'sourceCanvas' | 'startX' | 'startY'>,
  rows: number,
  cols: number,
  bodyOptions: Matter.IChamferableBodyDefinition = {}
) => {
  const { width, height, sourceCanvas, startX, startY } = opts;
  const { sx, sy } = sourceScale(sourceCanvas, width, height);
  const pw = width / cols;
  const ph = height / rows;
  const bodies: Matter.Body[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const lx = col * pw;
      const ly = row * ph;
      const piece: RectPiece = {
        sourceX: lx * sx,
        sourceY: ly * sy,
        sourceWidth: pw * sx,
        sourceHeight: ph * sy,
        width: pw,
        height: ph,
      };
      const body = Matter.Bodies.rectangle(startX + lx + pw / 2, startY + ly + ph / 2, pw, ph, {
        ...bodyOptions,
        plugin: { domolition: { ...piece, row, col } },
      });
      bodies.push(body);
    }
  }
  return { bodies, pieceWidth: pw, pieceHeight: ph };
};

/** Paint a rectangle body at its current position/rotation, optionally scaled. */
export const drawRectBody = (
  ctx: CanvasRenderingContext2D,
  body: Matter.Body,
  sourceCanvas: HTMLCanvasElement,
  scale = 1
) => {
  const d: RectPiece | undefined = body.plugin?.domolition;
  if (!d) return;
  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.drawImage(
    sourceCanvas,
    d.sourceX, d.sourceY, d.sourceWidth, d.sourceHeight,
    -d.width / 2, -d.height / 2, d.width, d.height
  );
  ctx.restore();
};

/** Small seeded PRNG so effects can be deterministic where it matters (glass cracks ↔ shards). */
export const seededRandom = (seed: number) => {
  let s = seed;
  return () => {
    const x = Math.sin(s++) * 10000;
    return x - Math.floor(x);
  };
};

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
