import { describe, expect, it } from 'vitest';
import { parsePageRange, parsePageRangeWithSkipped } from '../../src/core/options/pageRange.js';

describe('parsePageRange', () => {
  it('parses a single page', () => {
    expect(parsePageRange('3', 10)).toEqual([3]);
  });

  it('parses a hyphen range', () => {
    expect(parsePageRange('1-5', 10)).toEqual([1, 2, 3, 4, 5]);
  });

  it('parses comma-separated pages', () => {
    expect(parsePageRange('1,3,5', 10)).toEqual([1, 3, 5]);
  });

  it('parses mixed comma and range', () => {
    expect(parsePageRange('1-3,7,9-10', 10)).toEqual([1, 2, 3, 7, 9, 10]);
  });

  it('clamps to total pages', () => {
    expect(parsePageRange('1-100', 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('deduplicates and sorts', () => {
    expect(parsePageRange('5,1,3,1', 10)).toEqual([1, 3, 5]);
  });

  it('ignores whitespace', () => {
    expect(parsePageRange(' 1 , 3 - 4 ', 10)).toEqual([1, 3, 4]);
  });

  it('throws on non-numeric input', () => {
    expect(() => parsePageRange('abc', 10)).toThrow(/positive integer/);
  });

  it('throws on zero or negative pages', () => {
    expect(() => parsePageRange('0', 10)).toThrow(/positive integer/);
  });

  it('throws on reversed range', () => {
    expect(() => parsePageRange('5-1', 10)).toThrow(/malformed range/);
  });

  it('throws when nothing is in range', () => {
    expect(() => parsePageRange('11-20', 10)).toThrow(/no pages selected/);
  });

  it('throws on empty segment', () => {
    expect(() => parsePageRange('1,,3', 10)).toThrow(/empty segment/);
  });

  it('throws on a range with too many hyphens', () => {
    // segments.length !== 2 branch — three numbers separated by hyphens
    // is not a valid pdfvision range syntax.
    expect(() => parsePageRange('1-2-3', 10)).toThrow(/malformed range/);
  });
});

describe('parsePageRangeWithSkipped', () => {
  it('lists the in-range pages alongside the out-of-range skipped numbers', () => {
    const r = parsePageRangeWithSkipped('1-3,5,99', 4);
    expect(r.pages).toEqual([1, 2, 3]);
    expect(r.skipped).toEqual([5, 99]);
    expect(r.skippedTruncated).toBe(false);
  });

  it('returns an empty skipped list when nothing fell out of range', () => {
    const r = parsePageRangeWithSkipped('1-3', 10);
    expect(r.pages).toEqual([1, 2, 3]);
    expect(r.skipped).toEqual([]);
    expect(r.skippedTruncated).toBe(false);
  });

  it('caps `skipped` and flags truncation on adversarially large ranges', () => {
    // `--pages 1-1000000000` against a small doc would otherwise OOM by
    // enumerating 10^9 page numbers into the skipped Set. The cap stops
    // the walk at MAX_TRACKED_SKIPPED (=100) entries; `skippedTruncated`
    // tells the caller there were more, so the warning can hint at it.
    const r = parsePageRangeWithSkipped('1-1000000000', 4);
    expect(r.pages).toEqual([1, 2, 3, 4]);
    expect(r.skipped.length).toBe(100);
    expect(r.skipped[0]).toBe(5);
    expect(r.skippedTruncated).toBe(true);
  });

  it('still throws when every requested page is out of range', () => {
    // Behaviour preserved from parsePageRange — a request that matches
    // nothing is a usage error, not a warning.
    expect(() => parsePageRangeWithSkipped('11-20', 10)).toThrow(/no pages selected/);
  });
});
