import { describe, expect, it } from 'vitest';
import { suppressContainedCandidates } from '../../src/core/visualRegions/suppression.js';
import type { Candidate } from '../../src/core/visualRegions/types.js';

describe('visual region candidate suppression', () => {
  it('suppresses unlabeled vector-only subregions contained in mixed chart regions', () => {
    const mixedChart: Candidate = {
      kind: 'mixed',
      x: 144,
      y: 660,
      width: 300,
      height: 180,
      priority: 2,
      reason: 'vector chart with raster text strip',
      sources: [
        { type: 'imageBox', index: 1 },
        { type: 'vectorBox', index: 10 },
        { type: 'vectorBox', index: 11 },
      ],
    };
    const vectorSubregion: Candidate = {
      kind: 'vector',
      x: 167,
      y: 730,
      width: 88,
      height: 68,
      priority: 2,
      reason: 'nearby vector drawing operations',
      sources: [{ type: 'vectorBox', index: 12 }],
    };

    expect(suppressContainedCandidates([mixedChart, vectorSubregion])).toEqual([mixedChart]);
  });
});
