import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextAvailableName, resolveFlatRenderPaths } from '../../src/core/processor/flatRenderPaths.js';

describe('resolveFlatRenderPaths', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pdfvision-flat-paths-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('uses the plain page-N.png names in an empty dir and emits no note', () => {
    const notes: string[] = [];
    const paths = resolveFlatRenderPaths(dir, [1, 2, 3], undefined, (m) => notes.push(m));
    expect(paths.map((p) => basename(p))).toEqual(['page-1.png', 'page-2.png', 'page-3.png']);
    expect(notes).toEqual([]);
  });

  it('disambiguates against a pre-existing file and notes the rename', () => {
    writeFileSync(join(dir, 'page-1.png'), 'x');
    const notes: string[] = [];
    const paths = resolveFlatRenderPaths(dir, [1], undefined, (m) => notes.push(m));
    expect(basename(paths[0])).toBe('page-1-2.png');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('page-1-2.png');
    expect(notes[0]).toContain('page-1.png');
  });

  it('keeps bumping the suffix past multiple pre-existing collisions', () => {
    writeFileSync(join(dir, 'page-1.png'), 'x');
    writeFileSync(join(dir, 'page-1-2.png'), 'x');
    const paths = resolveFlatRenderPaths(dir, [1], undefined);
    expect(basename(paths[0])).toBe('page-1-3.png');
  });

  it('reserves within-run picks so two pages never resolve to the same file', () => {
    // Pre-plant page-2.png so page-2 has to move; page-1 keeps its base
    // name and the two never collide with each other.
    writeFileSync(join(dir, 'page-2.png'), 'x');
    const paths = resolveFlatRenderPaths(dir, [1, 2], undefined);
    expect(paths.map((p) => basename(p))).toEqual(['page-1.png', 'page-2-2.png']);
  });

  it('preserves the coordinate-suffixed name for region renders', () => {
    const paths = resolveFlatRenderPaths(dir, [3], { x: 50, y: 100, width: 400, height: 300 });
    expect(basename(paths[0])).toBe('page-3_x50_y100_w400_h300.png');
  });
});

describe('nextAvailableName', () => {
  it('appends the suffix at the end when the name has no extension', () => {
    // Every current caller passes `.png` names, but the helper must not
    // mangle an extension-less base (lastIndexOf('.') === -1 would
    // otherwise slice at -1 and corrupt the stem).
    expect(nextAvailableName('page-1', (name) => name === 'page-1')).toBe('page-1-2');
  });

  it('keeps the extension in place for dotted names', () => {
    expect(nextAvailableName('page-1.png', (name) => name === 'page-1.png')).toBe('page-1-2.png');
  });

  it('returns the base name untouched when it is free', () => {
    expect(nextAvailableName('page-1.png', () => false)).toBe('page-1.png');
  });
});
