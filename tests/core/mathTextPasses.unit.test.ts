import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout/index.js';
import { attachScripts } from '../../src/core/text/scripts.js';
import type { RawTextItem } from '../../src/core/text/textItems.js';
import type { TextSpan } from '../../src/types/index.js';

/** A text item whose baseline is `y` (PDF space, up is positive). */
function item(str: string, x: number, width: number, y: number, size: number): RawTextItem {
  return { str, width, height: size, transform: [size, 0, 0, size, x, y], fontName: 'f1', hasEOL: false };
}

const texts = (items: unknown[]) => (items as RawTextItem[]).map((entry) => entry.str);

describe('attachScripts — big operators', () => {
  it('leaves the limits of a sum to the math pass instead of attaching them as scripts', () => {
    // A math font draws ∑ hanging from its origin, so its upper limit looks lowered against it.
    const items = [item('∑', 202, 10, 532, 9.7), item('T', 212, 4.6, 535, 6.8), item('f', 227, 7.7, 525, 9.7)];
    expect(texts(attachScripts(items))).toEqual(['∑', 'T', 'f']);
  });

  it('still attaches a script to an ordinary base', () => {
    const items = [item('x', 100, 5, 600, 11), item('2', 105, 4, 604, 7)];
    expect(texts(attachScripts(items))).toEqual(['x^2']);
  });
});

/** A span whose box runs from its baseline up by its size. */
function span(text: string, x: number, baseline: number, size = 11, width = text.length * size * 0.5): TextSpan {
  return { text, x, y: baseline - size, width, height: size, fontSize: size };
}

describe('column detection — centred display lines', () => {
  it('reads display equations between prose in page order, not as a column of their own', () => {
    const spans = [
      span('A running head on the left', 90, 50, 9, 120),
      span('III. ESTIMATION', 234, 85, 10.5, 143),
      span('For a source at redshift z the luminosity distance is', 104, 111, 11, 348),
      span('d_L(z) = c z / H_0, (1)', 236, 142, 11, 285),
      span('where the expansion rate is measured from the catalogue of events,', 90, 175, 11, 396),
      span('and the likelihood over all of the events of the catalogue is', 90, 190, 11, 396),
      span('ln L = − Σ (d − μ)^2, (2)', 231, 231, 11, 290),
      span('with flat priors on both of the parameters of the cosmological model.', 90, 268, 11, 439),
      span('A. Results', 90, 300, 10.5, 132),
      span('The nearest event lies at the distance quoted in the table below here.', 90, 330, 11, 434),
    ];
    const order = buildLayout(spans, 612, 792).blocks.map((block) => block.text.split('\n')[0]);
    expect(order.indexOf('III. ESTIMATION')).toBeLessThan(
      order.indexOf('For a source at redshift z the luminosity distance is'),
    );
    expect(order.indexOf('d_L(z) = c z / H_0, (1)')).toBeLessThan(
      order.indexOf('where the expansion rate is measured from the catalogue of events,'),
    );
  });
});
