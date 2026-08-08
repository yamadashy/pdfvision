import { afterEach, describe, expect, it, vi } from 'vitest';
import { capturePdfJsWarnings } from '../../src/core/processor/pdfJsWarnings.js';

const pristineWarn = console.warn;

afterEach(() => {
  console.warn = pristineWarn;
  vi.restoreAllMocks();
});

describe('capturePdfJsWarnings', () => {
  it('collects only pdf.js warning lines', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out: string[] = [];
    const release = capturePdfJsWarnings(out);
    console.warn('Warning: bad CMap');
    console.warn('something else');
    release();
    expect(out).toEqual(['Warning: bad CMap']);
  });

  it('still forwards to the original console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const release = capturePdfJsWarnings([]);
    console.warn('Warning: forwarded');
    release();
    expect(spy).toHaveBeenCalledWith('Warning: forwarded');
  });

  it('restores console.warn once the last capture is released', () => {
    const before = console.warn;
    const releaseA = capturePdfJsWarnings([]);
    const releaseB = capturePdfJsWarnings([]);
    releaseA();
    expect(console.warn).not.toBe(before);
    releaseB();
    expect(console.warn).toBe(before);
  });

  // Concurrent extractions are what MCP tool calls do. The previous
  // implementation had each capture restore whatever it saw on entry, so
  // whichever finished first tore down the other's wrapper and the other
  // reinstated the finished one — leaking a wrapper that pushed into an
  // already-returned array for the rest of the process.
  it('keeps capturing for a still-open sink after an overlapping one closes', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const first: string[] = [];
    const second: string[] = [];
    const releaseFirst = capturePdfJsWarnings(first);
    const releaseSecond = capturePdfJsWarnings(second);

    releaseFirst();
    console.warn('Warning: after first closed');
    releaseSecond();

    expect(second).toContain('Warning: after first closed');
    expect(first).not.toContain('Warning: after first closed');
  });

  it('does not leak into a released sink', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const released: string[] = [];
    const open: string[] = [];
    const releaseA = capturePdfJsWarnings(released);
    const releaseB = capturePdfJsWarnings(open);
    releaseA();
    console.warn('Warning: later');
    releaseB();
    console.warn('Warning: after everything');
    expect(released).toEqual([]);
    expect(open).toEqual(['Warning: later']);
  });

  it('keeps collecting into an array two captures share', () => {
    // Nothing stops overlapping captures from passing the same array.
    // Keyed by identity alone, the first release removed it and the
    // still-open capture silently stopped collecting.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const shared: string[] = [];
    const releaseFirst = capturePdfJsWarnings(shared);
    const releaseSecond = capturePdfJsWarnings(shared);

    releaseFirst();
    console.warn('Warning: still open');
    releaseSecond();
    console.warn('Warning: after both');

    expect(shared).toEqual(['Warning: still open']);
  });

  it('tolerates a double release without dropping another sink', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const other: string[] = [];
    const releaseA = capturePdfJsWarnings([]);
    const releaseB = capturePdfJsWarnings(other);
    releaseA();
    releaseA();
    console.warn('Warning: still captured');
    releaseB();
    expect(other).toEqual(['Warning: still captured']);
  });
});
