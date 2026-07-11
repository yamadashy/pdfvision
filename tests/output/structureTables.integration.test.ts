import { resolve } from 'node:path';
import { decode } from '@toon-format/toon';
import { describe, expect, it } from 'vitest';
import { processDocument } from '../../src/core/processor.js';
import { formatJson } from '../../src/output/json.js';
import { formatMarkdown } from '../../src/output/markdown.js';
import { formatToon } from '../../src/output/toon.js';
import { formatXml } from '../../src/output/xml.js';

const TAGGED_TABLE_PDF = resolve(__dirname, '../fixtures/sample-tagged-table.pdf');

describe('tagged table output integration', () => {
  it('extracts the fixture grid and preserves it across markdown, JSON, XML, and TOON', async () => {
    const result = await processDocument(TAGGED_TABLE_PDF, { noCache: true, structure: true });
    const expectedTables = [
      {
        rows: [
          {
            cells: [
              { text: 'Region', header: 'column' },
              { text: 'Q1', header: 'column' },
              { text: 'Q2', header: 'column' },
            ],
          },
          { cells: [{ text: 'North', header: 'row' }, { text: '10' }, { text: '' }] },
          { cells: [{ text: 'South', header: 'row' }, { text: '20' }, { text: '30' }] },
        ],
      },
    ];

    expect(result.pages[0].structureTables).toEqual(expectedTables);
    expect(JSON.parse(formatJson(result)).pages[0].structureTables).toEqual(expectedTables);
    expect(decode(formatToon(result))).toEqual(JSON.parse(formatJson(result)));

    const markdown = formatMarkdown(result);
    expect(markdown).toContain('| Region | Q1 | Q2 |\n| --- | --- | --- |');
    expect(markdown).toContain('| North | 10 |  |\n| South | 20 | 30 |');

    const xml = formatXml(result);
    expect(xml).toContain('<structureTables>');
    expect(xml).toContain('<cell header="row">North</cell>');
    expect(xml).toContain('<cell></cell>');
  });

  it('does not expose reconstructed tables unless structure extraction is requested', async () => {
    const result = await processDocument(TAGGED_TABLE_PDF, { noCache: true });
    expect(result.pages[0].structure).toBeUndefined();
    expect(result.pages[0].structureTables).toBeUndefined();
  });
});
