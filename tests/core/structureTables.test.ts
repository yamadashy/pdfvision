import { describe, expect, it } from 'vitest';
import { buildStructureTables } from '../../src/core/document/structureTables.js';
import type { PageStructureContent, PageStructureNode } from '../../src/types/index.js';

const content = (id: string): PageStructureContent => ({ type: 'content', id });
const node = (role: string, children: PageStructureNode['children'] = []): PageStructureNode => ({ role, children });

describe('buildStructureTables', () => {
  it('reconstructs THead/TBody rows and header directions', () => {
    const structure = node('Root', [
      node('Table', [
        node('THead', [node('TR', [node('TH', [node('P', [content('corner')])]), node('TH', [content('city')])])]),
        node('TBody', [
          node('TR', [node('TH', [content('day')]), node('TD', [content('value')])]),
          node('TR', [node('TH'), node('TD')]),
        ]),
      ]),
    ]);

    expect(
      buildStructureTables(
        structure,
        new Map([
          ['corner', ''],
          ['city', 'Sydney'],
          ['day', 'Monday'],
          ['value', '23'],
        ]),
      ),
    ).toEqual([
      {
        rows: [
          {
            cells: [
              { text: '', header: 'column' },
              { text: 'Sydney', header: 'column' },
            ],
          },
          { cells: [{ text: 'Monday', header: 'row' }, { text: '23' }] },
          { cells: [{ text: '', header: 'row' }, { text: '' }] },
        ],
      },
    ]);
  });

  it('treats an all-TH first bare row as column headers and later TH cells as row headers', () => {
    const structure = node('Table', [
      node('TR', [node('TH', [content('h1')]), node('TH', [content('h2')])]),
      node('TR', [node('TH', [content('r1')]), node('TD')]),
    ]);

    expect(
      buildStructureTables(
        structure,
        new Map([
          ['h1', 'Heading 1'],
          ['h2', 'Heading 2'],
          ['r1', 'Body 1'],
        ]),
      ),
    ).toEqual([
      {
        rows: [
          {
            cells: [
              { text: 'Heading 1', header: 'column' },
              { text: 'Heading 2', header: 'column' },
            ],
          },
          { cells: [{ text: 'Body 1', header: 'row' }, { text: '' }] },
        ],
      },
    ]);
  });

  it('joins paragraphs with breaks and flattens a nested table into its parent cell text', () => {
    const nestedTable = node('Table', [
      node('TR', [node('TD', [node('P', [content('nested-a'), content('nested-b')])])]),
    ]);
    const structure = node('Table', [
      node('TR', [
        node('TD', [node('P', [content('p1-a'), content('p1-b')]), node('P', [content('p2')])]),
        node('TD', [nestedTable]),
      ]),
    ]);
    const tables = buildStructureTables(
      structure,
      new Map([
        ['p1-a', 'First'],
        ['p1-b', 'paragraph'],
        ['p2', 'Second paragraph'],
        ['nested-a', 'Nested'],
        ['nested-b', 'value'],
      ]),
    );

    expect(tables[0].rows[0].cells).toEqual([
      { text: 'First paragraph<br>Second paragraph' },
      { text: 'Nested value' },
    ]);
    expect(tables[1].rows[0].cells).toEqual([{ text: 'Nested value' }]);
  });
});
