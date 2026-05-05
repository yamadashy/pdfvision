import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // index.ts is just a re-export barrel; covering it adds noise without
      // exercising real logic. The bin entry is a thin shell over the CLI
      // that's already tested via processFile/CLI integration.
      exclude: ['src/index.ts', 'src/bin/**'],
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {
        // Lines / statements / functions are the primary signal for "is this
        // code exercised at all?". 85% is a strong bar that's met with room.
        lines: 85,
        statements: 85,
        functions: 85,
        // Branches sit a notch lower because pdfvision keeps a fair amount of
        // defensive `?? fallback` and OS-conditional code (POSIX vs Windows
        // permission paths, parseArgs default-vs-explicit value branches)
        // whose "other" side is genuinely unreachable in normal runs.
        branches: 80,
      },
    },
  },
});
