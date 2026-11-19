import { toCanvas } from 'html-to-image';
import { getEngine, type DestructionEffect, type ShatterEngineInstance } from './engines';

export { EFFECTS } from './engines';
export type { DestructionEffect } from './engines';

export interface ShatterConfig {
  /** Which destruction engine to run. Default `'glass'`. */
  effect?: DestructionEffect;
  /** Number of shards for `glass`. Default 150. */
  shardCount?: number;
  /** Grid rows for `grid`, `implode` and `collapse`. Default 10. */
  rows?: number;
  /** Grid columns for `grid`, `implode` and `collapse`. Default 8. */
  cols?: number;
  /** Called once when the effect finishes (rubble settled, or the element fully gone). */
  onComplete?: () => void;
  /**
   * Fade the leftover rubble away this many ms after the effect finishes.
   * Handy for "delete" flows. By default the rubble stays until `reset()`.
   */
  clearRubbleAfter?: number;
  /** z-index of the full-screen effect canvas. Default 2147483000 (above nearly everything). */
  zIndex?: number;
  /**
   * How to treat the user's `prefers-reduced-motion` setting.
   * - `'respect'` (default): skip the animation and fade the element out quickly instead.
   * - `'ignore'`: always play the full effect. Only use this when the user explicitly
   *   asked to see the animation (e.g. a "play anyway" control), never as a blanket default.
   */
  reducedMotion?: 'respect' | 'ignore';
}

// How long the reduced-motion fade takes. Short, and opacity only: no movement.
const REDUCED_MOTION_FADE_MS = 200;

export interface ShatterHandle {
  /** Resolves when the effect finishes, or when `reset()` is called first. Rejects if capture fails. */
  finished: Promise<void>;
  /** Put the element back exactly as it was and tear down the effect canvas. Safe to call any time. */
  reset: () => void;
}

/** True when the user has asked their OS/browser for reduced motion. */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Blow up a DOM element. Snapshots it, hides the real one (layout is kept, so
 * nothing jumps), and plays the chosen effect on a full-screen canvas overlay.
 *
 * ```js
 * import { shatter } from 'domolition/vanilla';
 * const handle = shatter(document.querySelector('#card'), { effect: 'disintegrate' });
 * await handle.finished;
 * handle.reset(); // bring it back
 * ```
 */
export const shatter = (element: HTMLElement, config: ShatterConfig = {}): ShatterHandle => {
  const {
    effect = 'glass',
    shardCount = 150,
    rows = 10,
    cols = 8,
    onComplete,
    clearRubbleAfter,
    zIndex = 2147483000,
    reducedMotion = 'respect',
  } = config;

  // Remember the inline styles we touch so reset() restores them exactly.
  const prevOpacity = element.style.opacity;
  const prevPointerEvents = element.style.pointerEvents;
  const prevTransition = element.style.transition;

  let engine: ShatterEngineInstance | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let isReset = false;
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveFinished!: () => void;
  let rejectFinished!: (e: unknown) => void;
  const finished = new Promise<void>((res, rej) => {
    resolveFinished = res;
    rejectFinished = rej;
  });

  const hideElement = () => {
    element.style.opacity = '0';
    element.style.pointerEvents = 'none';
  };

  const removeCanvas = () => {
    engine?.destroy();
    engine = null;
    canvas?.remove();
    canvas = null;
  };

  const finish = () => {
    onComplete?.();
    resolveFinished();
    if (clearRubbleAfter != null && canvas) {
      const c = canvas;
      fadeTimer = setTimeout(() => {
        c.style.transition = 'opacity 400ms ease';
        c.style.opacity = '0';
        fadeTimer = setTimeout(removeCanvas, 420);
      }, clearRubbleAfter);
    }
  };

  const reset = () => {
    if (isReset) return;
    isReset = true;
    clearTimeout(fadeTimer);
    removeCanvas();
    element.style.transition = prevTransition;
    element.style.opacity = prevOpacity;
    element.style.pointerEvents = prevPointerEvents;
    resolveFinished();
  };

  // Accessibility: if the user opted out of motion, skip the animation. A short
  // opacity fade (no movement) makes it read as intentional rather than broken.
  // We still report completion so app state stays consistent.
  if (reducedMotion === 'respect' && prefersReducedMotion()) {
    element.style.transition = `opacity ${REDUCED_MOTION_FADE_MS}ms ease`;
    hideElement();
    fadeTimer = setTimeout(() => {
      if (!isReset) finish();
    }, REDUCED_MOTION_FADE_MS);
    return { finished, reset };
  }

  (async () => {
    try {
      // 1. Capture: take a high-fidelity picture of the element.
      const dpr = window.devicePixelRatio || 1;
      const sourceCanvas = await toCanvas(element, { backgroundColor: 'transparent', pixelRatio: dpr });
      if (isReset) return;

      // 2. The swap: hide the real element but keep it in the layout.
      const rect = element.getBoundingClientRect();
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      const canvasWidth = window.innerWidth;
      const canvasHeight = window.innerHeight;

      canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.dataset.domolition = effect;
      Object.assign(canvas.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: String(zIndex),
      });
      // Back the store with device pixels and draw in CSS pixels so pieces stay crisp on retina.
      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('DOMolition: 2D canvas context unavailable');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      document.body.appendChild(canvas);
      hideElement();

      // 3. Simulation: hand the bitmap to the chosen engine.
      engine = getEngine(effect)({
        width,
        height,
        shardCount,
        rows,
        cols,
        sourceCanvas,
        ctx,
        startX: rect.left,
        startY: rect.top,
        canvasWidth,
        canvasHeight,
        onComplete: () => {
          if (!isReset) finish();
        },
      });
      engine.start();
    } catch (error) {
      // Leave the page as we found it.
      removeCanvas();
      element.style.transition = prevTransition;
      element.style.opacity = prevOpacity;
      element.style.pointerEvents = prevPointerEvents;
      rejectFinished(error);
    }
  })();

  return { finished, reset };
};
