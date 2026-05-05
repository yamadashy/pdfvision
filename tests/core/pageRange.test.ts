import { describe, expect, it } from 'vitest';
import { parsePageRange } from '../../src/core/pageRange.js';

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
});
