import { describe, expect, it } from 'vitest';
import { buildAttachments } from '../../src/core/attachments.js';

describe('buildAttachments', () => {
  it('extracts attachment metadata without carrying content bytes', () => {
    const attachments = buildAttachments(
      {
        raw: {
          filename: 'Ｓｕｐｐｌｅｍｅｎｔ.txt',
          rawFilename: 'raw-name.txt',
          description: 'Ｄｅｓｃ',
          content: new Uint8Array([1, 2, 3]),
        },
      },
      { normalizeText: (value) => value.normalize('NFKC') },
    );

    expect(attachments).toEqual([
      {
        name: 'Supplement.txt',
        rawName: 'raw-name.txt',
        description: 'Desc',
        size: 3,
      },
    ]);
    expect(JSON.stringify(attachments)).not.toContain('1,2,3');
  });

  it('returns an empty array when the PDF has no embedded file attachments', () => {
    expect(buildAttachments(null)).toEqual([]);
  });
});
