import { createGridEngine } from './grid';
import { createGlassEngine } from './glass';
import { createImplodeEngine } from './implode';

export type DestructionEffect = 'grid' | 'glass' | 'implode';

export const getEngine = (effect: DestructionEffect) => {
  switch (effect) {
    case 'grid':
      return createGridEngine;
    case 'glass':
      return createGlassEngine;
    case 'implode':
      return createImplodeEngine; 
      return createGlassEngine; // Fallback for now
    default:
      return createGlassEngine;
  }
};