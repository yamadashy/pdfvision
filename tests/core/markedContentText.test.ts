import { describe, expect, it } from 'vitest';
import { buildMarkedContentTextMap } from '../../src/core/document/markedContentText.js';

describe('buildMarkedContentTextMap', () => {
  it('walks nested markers and skips Artifact content', () => {
    const text = buildMarkedContentTextMap({
      items: [
        { type: 'beginMarkedContentProps', tag: 'P', id: 'mc0' },
        { str: 'Visible' },
        { type: 'beginMarkedContent', tag: 'Artifact' },
        { str: 'page decoration' },
        { type: 'endMarkedContent' },
        { type: 'beginMarkedContentProps', tag: 'Span', id: null },
        { str: 'text' },
        { type: 'endMarkedContent' },
        { type: 'endMarkedContent' },
      ],
    });

    expect(text.get('mc0')).toBe('Visible text');
  });

  it('discards whitespace filler items and joins real chunks with spaces', () => {
    const text = buildMarkedContentTextMap({
      items: [
        { type: 'beginMarkedContentProps', tag: 'Span', id: 'mc1' },
        { str: ' ', width: 500, height: 0 },
        { str: 'Sydney' },
        { str: '  ' },
        { str: 'Harbour' },
        { type: 'endMarkedContent' },
      ],
    });

    expect(text.get('mc1')).toBe('Sydney Harbour');
  });

  it('preserves an empty entry for an mcid with no text items', () => {
    const text = buildMarkedContentTextMap({
      items: [{ type: 'beginMarkedContentProps', tag: 'Span', id: 'empty' }, { type: 'endMarkedContent' }],
    });

    expect(text.has('empty')).toBe(true);
    expect(text.get('empty')).toBe('');
  });
});
