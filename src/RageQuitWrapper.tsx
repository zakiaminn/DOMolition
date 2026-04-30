"use client";
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { toCanvas } from 'html-to-image';
import { getEngine } from './engines';
import type { ShatterEngineInstance } from './engines/glass';
//import html2canvas from 'html2canvas';
//import { createShatterEngine, ShatterEngineInstance } from './physics';
//import { sanitizeColorsAndClone } from './utils';

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

// This lets parents call `ref.current.triggerShatter()` imperatively
export interface RageQuitRef {
  triggerShatter: () => void;
}

export const RageQuitWrapper = forwardRef<RageQuitRef, RageQuitWrapperProps>(
  ({ children, effect = 'glass', isShattered = false, shardCount = 150, rows = 10, cols = 8, onShatterComplete }, ref) => {
    // We need a bunch of refs to manage the DOM nodes and canvas
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null); // The actual UI we are capturing
    const canvasRef = useRef<HTMLCanvasElement>(null); // Where the physics simulation renders
    const engineRef = useRef<ShatterEngineInstance | null>(null);
    
    const [shattered, setShattered] = useState(isShattered);
    
    // Hook up the imperative handle so the parent component can trigger the explosion
    useImperativeHandle(ref, () => ({
      triggerShatter: () => setShattered(true)
    }));

    // Sync the declarative prop to our local state just in case it changes
    useEffect(() => {
      if (isShattered) {
        setShattered(true);
      }
    }, [isShattered]);

    // The main explosion effect. Runs when `shattered` flips to true.
    useEffect(() => {
      if (!shattered || !contentRef.current || !canvasRef.current || !containerRef.current) return;

      const contentEl = contentRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const startExplosion = async () => {
        // 1. Capture Phase: Take a picture of the DOM. 
        // We have to use our custom sanitizer because html2canvas crashes on modern CSS colors (like oklch)
        /*const sourceCanvas = await sanitizeColorsAndClone(contentEl, html2canvas, {
          backgroundColor: null,
          scale: window.devicePixelRatio || 1,
        });*/
        const sourceCanvas = await toCanvas(contentEl, {
          backgroundColor: 'transparent',
          pixelRatio: window.devicePixelRatio || 1,
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
        
        // Make the canvas full screen and plop it on top of everything
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        canvas.style.display = 'block';

        // 3. Physics Phase: Boot up Matter.js and tell it to start throwing the canvas shards around
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
          onComplete: onShatterComplete
        });
        
        engineRef.current = shatterEngine;
        shatterEngine.start();
      };

      //startExplosion();
      try {
        startExplosion();
      } catch (error) {
        console.error("DOMolition Capture Failed:", error);
      }

      return () => {
        // Cleanup just in case the component unmounts while the animation is running
        if (engineRef.current) {
          engineRef.current.destroy();
          engineRef.current = null;
        }
      };
    }, [shattered, rows, cols, onShatterComplete]);

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
            zIndex: 9999
          }}
        />
      </div>
    );
  }
);

RageQuitWrapper.displayName = 'RageQuitWrapper';
