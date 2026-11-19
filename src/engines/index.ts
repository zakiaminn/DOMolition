import { createGridEngine } from './grid';
import { createGlassEngine } from './glass';
import { createImplodeEngine } from './implode';
import { createCollapseEngine } from './collapse';
import { createSliceEngine } from './slice';
import { createMeltEngine } from './melt';
import { createDisintegrateEngine } from './disintegrate';
import type { ShatterEngineInstance, ShatterOptions } from './shared';

export type { ShatterEngineInstance, ShatterOptions } from './shared';

const ENGINES = {
  grid: createGridEngine,
  glass: createGlassEngine,
  implode: createImplodeEngine,
  collapse: createCollapseEngine,
  slice: createSliceEngine,
  melt: createMeltEngine,
  disintegrate: createDisintegrateEngine,
} satisfies Record<string, (opts: ShatterOptions) => ShatterEngineInstance>;

export type DestructionEffect = keyof typeof ENGINES;

/** Every effect name the library ships, handy for building pickers. */
export const EFFECTS = Object.keys(ENGINES) as DestructionEffect[];

export const getEngine = (effect: DestructionEffect) => ENGINES[effect] ?? createGlassEngine;
