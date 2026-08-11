import { beforeEach, describe, expect, it } from 'vitest';
import { clearRefs, forgetRefs, lookupRef, matchRef, regionRef, rememberRef } from '../../src/mcp/refs.js';

const region = { x: 1, y: 2, width: 3, height: 4 };

describe('refs', () => {
  beforeEach(() => {
    clearRefs();
  });

  it('numbers match and region refs from one', () => {
    expect(matchRef(47, 0)).toBe('p47m1');
    expect(regionRef(5, 1)).toBe('p5r2');
  });

  it('round-trips a remembered target', () => {
    rememberRef('doc.pdf', 'p47m1', { page: 47, region, origin: 'search hit' });
    expect(lookupRef('doc.pdf', 'p47m1')).toEqual({ page: 47, region, origin: 'search hit' });
  });

  it('matches a ref case-insensitively', () => {
    rememberRef('doc.pdf', 'p47m1', { page: 47, region, origin: 'search hit' });
    expect(lookupRef('doc.pdf', 'P47M1')?.page).toBe(47);
  });

  it('scopes refs to their source document', () => {
    rememberRef('a.pdf', 'p1m1', { page: 1, region, origin: 'a' });
    expect(lookupRef('b.pdf', 'p1m1')).toBeUndefined();
  });

  it('returns undefined for an unknown ref', () => {
    expect(lookupRef('doc.pdf', 'nope')).toBeUndefined();
  });

  it('evicts the oldest entries past the cap', () => {
    for (let index = 0; index < 600; index += 1) {
      rememberRef('doc.pdf', `p1m${index}`, { page: 1, region, origin: 'bulk' });
    }
    expect(lookupRef('doc.pdf', 'p1m0')).toBeUndefined();
    expect(lookupRef('doc.pdf', 'p1m599')).toBeDefined();
  });

  it('refreshes an entry that is written again', () => {
    rememberRef('doc.pdf', 'keep', { page: 1, region, origin: 'first' });
    for (let index = 0; index < 499; index += 1) {
      rememberRef('doc.pdf', `p1m${index}`, { page: 1, region, origin: 'bulk' });
    }
    rememberRef('doc.pdf', 'keep', { page: 1, region, origin: 'refreshed' });
    rememberRef('doc.pdf', 'extra', { page: 1, region, origin: 'bulk' });
    expect(lookupRef('doc.pdf', 'keep')?.origin).toBe('refreshed');
  });

  it('refreshes an entry that is merely read', () => {
    // Eviction has to follow use, not insertion: a ref the caller keeps
    // rendering was otherwise pushed out by 500 newer ones it never
    // touched, and the next render_pdf failed with "unknown ref".
    rememberRef('doc.pdf', 'keep', { page: 1, region, origin: 'first' });
    for (let index = 0; index < 499; index += 1) {
      rememberRef('doc.pdf', `p1m${index}`, { page: 1, region, origin: 'bulk' });
    }
    expect(lookupRef('doc.pdf', 'keep')).toBeDefined();
    rememberRef('doc.pdf', 'extra', { page: 1, region, origin: 'bulk' });
    expect(lookupRef('doc.pdf', 'keep')?.origin).toBe('first');
    expect(lookupRef('doc.pdf', 'p1m0')).toBeUndefined();
  });

  it('drops a whole set of refs when a new response replaces it', () => {
    rememberRef('a.pdf', 'p1m1', { page: 1, region, origin: 'search hit for old' });
    rememberRef('a.pdf', 'p1m5', { page: 1, region, origin: 'search hit for old' });
    rememberRef('b.pdf', 'p1m1', { page: 1, region, origin: 'other document' });

    forgetRefs('a.pdf');
    rememberRef('a.pdf', 'p1m1', { page: 1, region, origin: 'search hit for new' });

    // The replacement is visible, the leftover from the wider previous
    // set is gone, and another document's refs are untouched.
    expect(lookupRef('a.pdf', 'p1m1')?.origin).toBe('search hit for new');
    expect(lookupRef('a.pdf', 'p1m5')).toBeUndefined();
    expect(lookupRef('b.pdf', 'p1m1')?.origin).toBe('other document');
  });

  it('matches the source spelling the way lookups do', () => {
    rememberRef('./a.pdf', 'p1m1', { page: 1, region, origin: 'search hit' });
    forgetRefs(' ./a.pdf ');
    expect(lookupRef('./a.pdf', 'p1m1')).toBeUndefined();
  });
});
