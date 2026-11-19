"use client";
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { shatter, type ShatterHandle } from './vanilla';
import type { DestructionEffect } from './engines';

// Props for the wrapper. rows/cols dictate how many shards the UI breaks into.
export interface RageQuitWrapperProps {
  children: React.ReactNode;
  effect?: DestructionEffect;
  isShattered?: boolean;
  shardCount?: number;
  rows?: number;
  cols?: number;
  onShatterComplete?: () => void;
  /**
   * `'respect'` (default) skips the animation for users with reduced motion on and
   * fades the UI out instead. `'ignore'` always plays it: only for an explicit
   * "play anyway" choice by the user.
   */
  reducedMotion?: 'respect' | 'ignore';
}

// This lets parents call `ref.current.triggerShatter()` / `reset()` imperatively
export interface RageQuitRef {
  triggerShatter: () => void;
  reset: () => void;
}

export const RageQuitWrapper = forwardRef<RageQuitRef, RageQuitWrapperProps>(
  (
    { children, effect = 'glass', isShattered = false, shardCount = 150, rows = 10, cols = 8, onShatterComplete, reducedMotion = 'respect' },
    ref
  ) => {
    const contentRef = useRef<HTMLDivElement>(null); // The actual UI we are capturing
    const handleRef = useRef<ShatterHandle | null>(null);
    const [shattered, setShattered] = useState(isShattered);

    // Latest props, read at the moment the effect fires. Keeping them out of the
    // effect's dependency list means a parent re-render (say, an inline
    // onShatterComplete arrow, or flipping state when the rubble settles) can't
    // re-run the demolition on the already-hidden element.
    const latest = useRef({ effect, shardCount, rows, cols, onShatterComplete, reducedMotion });
    latest.current = { effect, shardCount, rows, cols, onShatterComplete, reducedMotion };

    // Hook up the imperative handle so the parent component can drive the effect
    useImperativeHandle(ref, () => ({
      triggerShatter: () => setShattered(true),
      reset: () => {
        handleRef.current?.reset();
        handleRef.current = null;
        setShattered(false);
      },
    }));

    // Keep local state in sync with the declarative prop, in both directions
    useEffect(() => {
      setShattered(isShattered);
    }, [isShattered]);

    // The main explosion. Runs when `shattered` flips to true; flipping back
    // (or unmounting) puts the UI back and removes the effect canvas.
    useEffect(() => {
      if (!shattered || !contentRef.current) return;
      const { effect, shardCount, rows, cols, reducedMotion } = latest.current;
      const handle = shatter(contentRef.current, {
        effect,
        shardCount,
        rows,
        cols,
        reducedMotion,
        zIndex: 9999,
        onComplete: () => latest.current.onShatterComplete?.(),
      });
      handleRef.current = handle;
      handle.finished.catch((error) => console.error('DOMolition Capture Failed:', error));

      return () => {
        handle.reset();
        if (handleRef.current === handle) handleRef.current = null;
      };
    }, [shattered]);

    return (
      <div ref={contentRef} style={{ display: 'inline-block', transition: 'opacity 0.1s' }}>
        {children}
      </div>
    );
  }
);

RageQuitWrapper.displayName = 'RageQuitWrapper';
