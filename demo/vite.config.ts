import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// The demo eats its own dog food: it consumes the library straight from source,
// not from a built tarball. That means editing the engine and this page in the
// same breath, no rebuild step wedged in between.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Point the package name at the TS source. `import { RageQuitWrapper } from
    // 'domolition'` here === importing ../src directly.
    alias: {
      domolition: path.resolve(__dirname, '../src/index.ts'),
    },
    // One React or bust. The library and the app MUST share a single copy,
    // otherwise the imperative ref (and every hook) throws.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    // The library source sits one level up, outside this demo root, so let Vite
    // reach past the folder boundary to read it.
    fs: { allow: ['..'] },
  },
});
