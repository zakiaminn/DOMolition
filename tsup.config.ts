import { defineConfig } from 'tsup';

export default defineConfig([
  // The React entry. esbuild strips module directives when bundling, so we put
  // "use client" back as a banner, otherwise Next.js App Router users would
  // hit "useState only works in Client Components" on import.
  {
    entry: { index: 'src/index.ts' },
    format: ['cjs', 'esm'],
    dts: true,
    banner: { js: '"use client";' },
  },
  // Framework-free entry: `import { shatter } from 'domolition/vanilla'`.
  // Never imports React, so it works in Vue, Svelte, Astro, plain HTML...
  {
    entry: { vanilla: 'src/vanilla.ts' },
    format: ['cjs', 'esm'],
    dts: true,
  },
  // Drop-in <script> build with everything bundled, exposed as window.DOMolition.
  // Served by unpkg/jsdelivr, so CodePens and bookmarklets can just load it.
  {
    entry: { domolition: 'src/vanilla.ts' },
    format: ['iife'],
    globalName: 'DOMolition',
    platform: 'browser',
    noExternal: [/.*/],
    minify: true,
    target: 'es2019',
  },
]);
