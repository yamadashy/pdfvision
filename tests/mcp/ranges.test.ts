import { describe, expect, it } from 'vitest';
import { formatPageRanges } from '../../src/mcp/ranges.js';

describe('formatPageRanges', () => {
  it('returns an empty string for no pages', () => {
    expect(formatPageRanges([])).toBe('');
  });

  it('collapses a contiguous run', () => {
    expect(formatPageRanges([1, 2, 3, 4])).toBe('1-4');
  });

  it('keeps isolated pages separate', () => {
    expect(formatPageRanges([1, 3, 5])).toBe('1, 3, 5');
  });

  it('mixes runs and singletons', () => {
    expect(formatPageRanges([12, 13, 14, 20, 31, 32])).toBe('12-14, 20, 31-32');
  });

  it('sorts and deduplicates', () => {
    expect(formatPageRanges([5, 1, 3, 1, 2])).toBe('1-3, 5');
  });

  it('renders a two-page run as a range', () => {
    expect(formatPageRanges([7, 8])).toBe('7-8');
  });
});
