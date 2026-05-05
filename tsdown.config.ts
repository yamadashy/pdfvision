import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'bin/pdfvision': 'src/bin/pdfvision.ts',
  },
  outDir: 'dist',
  format: 'esm',
  target: 'node20',
  platform: 'node',
  clean: true,
  dts: true,
  sourcemap: false,
  deps: {
    neverBundle: ['@napi-rs/canvas', 'pdfjs-dist'],
  },
});
