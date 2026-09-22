"use client";
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { toCanvas } from 'html-to-image';
import { getEngine } from './engines';
import { drawGlassCracks } from './engines/glass';
import type { ShatterEngineInstance } from './engines/glass';

// Props for the wrapper. rows/cols dictate how many shards the UI breaks into.
export interface RageQuitWrapperProps {
  children: React.ReactNode;
  effect?: 'grid' | 'glass' | 'implode';
  isShattered?: boolean;
  shardCount?: number;
  rows?: number;
  cols?: number;
  onShatterComplete?: () => void;
}

// This lets parents call `ref.current.triggerShatter()` / `reset()` imperatively
export interface RageQuitRef {
  triggerShatter: () => void;
  reset: () => void;
}

// Does the user want us to sit down and be quiet?
const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const RageQuitWrapper = forwardRef<RageQuitRef, RageQuitWrapperProps>(
  ({ children, effect = 'glass', isShattered = false, shardCount = 150, rows = 10, cols = 8, onShatterComplete }, ref) => {
    // We need a bunch of refs to manage the DOM nodes and canvas
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null); // The actual UI we are capturing
    const canvasRef = useRef<HTMLCanvasElement>(null); // Where the physics simulation renders
    const engineRef = useRef<ShatterEngineInstance | null>(null);

    const [shattered, setShattered] = useState(isShattered);

    // Put the original UI back and tear down any running simulation.
    // Exposed via the ref so the effect can be triggered more than once.
    const restoreContent = () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
      if (contentRef.current) {
        contentRef.current.style.opacity = '';
        contentRef.current.style.pointerEvents = '';
      }
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    // Hook up the imperative handle so the parent component can drive the effect
    useImperativeHandle(ref, () => ({
      triggerShatter: () => setShattered(true),
      reset: () => {
        restoreContent();
        setShattered(false);
      },
    }));

    // Keep local state in sync with the declarative prop, in both directions
    useEffect(() => {
      setShattered(isShattered);
    }, [isShattered]);

    // The main explosion effect. Runs when `shattered` flips to true.
    useEffect(() => {
      if (!shattered || !contentRef.current || !canvasRef.current || !containerRef.current) return;

      const contentEl = contentRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Accessibility: if the user opted out of motion, skip the physics entirely.
      // We still hide the target and fire the completion callback so state stays consistent.
      if (prefersReducedMotion()) {
        contentEl.style.opacity = '0';
        contentEl.style.pointerEvents = 'none';
        onShatterComplete?.();
        return;
      }

      const startExplosion = async () => {
        try {
          // 1. Capture Phase: Take a picture of the DOM.
          const dpr = window.devicePixelRatio || 1;
          const sourceCanvas = await toCanvas(contentEl, {
            backgroundColor: 'transparent',
            pixelRatio: dpr,
          });

          // 2. The Swap: Hide the real UI but keep it in the DOM so layout doesn't collapse.
          // We set opacity to 0 and disable pointer events so the user can't click invisible buttons.
          contentEl.style.opacity = '0';
          contentEl.style.pointerEvents = 'none';

          // Figure out exactly where the element is on the screen so we can spawn the physics bodies there
          const rect = contentEl.getBoundingClientRect();
          const width = contentEl.offsetWidth;
          const height = contentEl.offsetHeight;

          const canvasWidth = window.innerWidth;
          const canvasHeight = window.innerHeight;

          // Make the canvas full screen and plop it on top of everything.
          // Back the store with device pixels (DPR) and draw in CSS pixels so shards stay crisp on retina.
          canvas.width = canvasWidth * dpr;
          canvas.height = canvasHeight * dpr;
          canvas.style.display = 'block';
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

          // 3. Physics Phase: Boot up Matter.js and tell it to start throwing the canvas shards around
          const startPhysics = () => {
            const engineFactory = getEngine(effect);
            const shatterEngine = engineFactory({
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
              onComplete: onShatterComplete,
            });

            engineRef.current = shatterEngine;
            shatterEngine.start();
          };

          // 4. Pre-Fracture Routing Logic
          if (effect === 'glass') {
            ctx.drawImage(sourceCanvas, rect.left, rect.top, width, height);
            // Draw the cracks instantly
            drawGlassCracks(ctx, width, height, shardCount, rect.left, rect.top);

            // Wait 250ms for the tension to build, then shatter
            setTimeout(() => {
              startPhysics();
            }, 250);
          } else {
            // Grid and Implode don't have pre-fracture cracks, so they fire instantly
            startPhysics();
          }
        } catch (error) {
          console.error('DOMolition Capture Failed:', error);
        }
      };

      // Fire the explosion sequence
      startExplosion();

      return () => {
        // Cleanup just in case the component unmounts while the animation is running
        if (engineRef.current) {
          engineRef.current.destroy();
          engineRef.current = null;
        }
      };
    }, [shattered, effect, shardCount, rows, cols, onShatterComplete]);

    return (
      <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
        <div ref={contentRef} style={{ transition: 'opacity 0.1s' }}>
          {children}
        </div>
        <canvas
          ref={canvasRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            display: shattered ? 'block' : 'none',
            zIndex: 9999,
          }}
        />
      </div>
    );
  }
);

RageQuitWrapper.displayName = 'RageQuitWrapper';
