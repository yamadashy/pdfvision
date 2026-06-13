#!/usr/bin/env node
import { run } from '../cli/cli.js';

// pdfjs-dist emits raw "Warning: ..." lines for non-fatal PDF quirks.
// Suppress those CLI side-channel lines; processor.ts separately captures
// selected font-map warnings into structured pages[].warnings.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const msg = String(args[0]);
  if (msg.startsWith('Warning:')) return;
  originalWarn(...args);
};

run().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error('Fatal Error:', error.message);
  } else {
    console.error('Fatal Error:', error);
  }
  process.exit(1);
});
