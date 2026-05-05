#!/usr/bin/env node
import { run } from '../cli/cli.js';

// pdfjs-dist emits "Warning: ..." lines for non-fatal PDF quirks (missing
// font tables, malformed structures, etc.) that aren't actionable for end
// users. Suppress them at the CLI boundary only — library consumers keep
// the original behaviour.
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
