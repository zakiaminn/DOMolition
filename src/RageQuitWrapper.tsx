"use client";
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import html2canvas from 'html2canvas';
import { createShatterEngine, ShatterEngineInstance } from './physics';
import { sanitizeColorsAndClone } from './utils';

export interface RageQuitWrapperProps {
  children: React.ReactNode;
  isShattered?: boolean;
  rows?: number;
  cols?: number;
  onShatterComplete?: () => void;
}

export interface RageQuitRef {
  triggerShatter: () => void;
}

export const RageQuitWrapper = forwardRef<RageQuitRef, RageQuitWrapperProps>(
  ({ children, isShattered = false, rows = 10, cols = 8, onShatterComplete }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<ShatterEngineInstance | null>(null);
    
    const [shattered, setShattered] = useState(isShattered);
    
    useImperativeHandle(ref, () => ({
      triggerShatter: () => setShattered(true)
    }));

    useEffect(() => {
      if (isShattered) {
        setShattered(true);
      }
    }, [isShattered]);

    useEffect(() => {
      if (!shattered || !contentRef.current || !canvasRef.current || !containerRef.current) return;

      const contentEl = contentRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const startExplosion = async () => {
        // 1. Capture Phase
        const sourceCanvas = await sanitizeColorsAndClone(contentEl, html2canvas, {
          backgroundColor: null,
          scale: window.devicePixelRatio || 1,
        });

        // 2. The Swap
        contentEl.style.opacity = '0';
        contentEl.style.pointerEvents = 'none';
        
        const rect = contentEl.getBoundingClientRect();
        const width = contentEl.offsetWidth;
        const height = contentEl.offsetHeight;
        
        const canvasWidth = window.innerWidth;
        const canvasHeight = window.innerHeight;
        
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        canvas.style.display = 'block';

        // 3. Physics & Explosion Phase via external utility
        const shatterEngine = createShatterEngine({
          width,
          height,
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

      startExplosion();

      return () => {
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
