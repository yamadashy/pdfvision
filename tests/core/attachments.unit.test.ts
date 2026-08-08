import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { resolveAttachment } from '../../src/core/document/attachmentContent.js';
import {
  buildAttachments,
  buildAttachmentsWithContent,
  catalogAttachmentsToRecord,
  mergeAttachmentRecords,
} from '../../src/core/document/attachments.js';

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

  it('converts catalog attachment maps and loads their content lazily', async () => {
    const getContent = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const record = await catalogAttachmentsToRecord(
      new Map([['attachment-id', { filename: 'report.txt', description: 'Report' }]]),
      getContent,
    );

    expect(buildAttachments(record)).toEqual([{ name: 'report.txt', description: 'Report', size: 3 }]);
    expect(getContent).toHaveBeenCalledWith('attachment-id');
  });

  it('deduplicates equivalent attachment records from multiple PDF sources', () => {
    const merged = mergeAttachmentRecords(
      { named: { filename: 'supplement.txt', content: new Uint8Array([65, 66]) } },
      { annotated: { filename: 'supplement.txt', content: new Uint8Array([65, 66]) } },
      { other: { filename: 'notes.txt', content: new Uint8Array([67]) } },
    );

    expect(buildAttachments(merged)).toEqual([
      { name: 'notes.txt', size: 1 },
      { name: 'supplement.txt', size: 2 },
    ]);
  });

  it('writes attachment bytes to sanitized filenames when an output directory is provided', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdfvision-attachments-unit-'));
    try {
      const attachments = buildAttachments(
        {
          first: { filename: '../report.txt', content: new Uint8Array([65, 66]) },
          second: { filename: '../report.txt', content: new Uint8Array([67]) },
        },
        { outputDir: dir },
      );

      expect(attachments.map((attachment) => basename(attachment.path as string))).toEqual([
        '.._report.txt',
        '.._report.txt-2',
      ]);
      expect(readFileSync(attachments[0].path as string, 'utf8')).toBe('AB');
      expect(readFileSync(attachments[1].path as string, 'utf8')).toBe('C');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps saved filenames unique on case-insensitive filesystems', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdfvision-attachments-case-unit-'));
    try {
      const attachments = buildAttachments(
        {
          first: { filename: 'Report.txt', content: new Uint8Array([65]) },
          second: { filename: 'report.txt', content: new Uint8Array([66]) },
        },
        { outputDir: dir },
      );
      const byName = new Map(attachments.map((attachment) => [attachment.name, basename(attachment.path as string)]));

      expect(byName.get('Report.txt')).toBe('Report.txt');
      expect(byName.get('report.txt')).toBe('report.txt-2');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('carries bytes only for entries the document actually embeds', () => {
    const list = buildAttachmentsWithContent({
      embedded: { filename: 'a.txt', content: new Uint8Array([65]) },
      referenced: { filename: 'b.txt' },
    });

    expect(list.map((entry) => entry.name)).toEqual(['a.txt', 'b.txt']);
    expect(list[0].content?.toString('utf8')).toBe('A');
    expect('content' in list[1]).toBe(false);
  });

  it('refuses to write attachment bytes into a symlinked output directory', () => {
    if (process.platform === 'win32') return;
    const dir = mkdtempSync(join(tmpdir(), 'pdfvision-attachments-symlink-unit-'));
    const target = join(dir, 'target');
    const link = join(dir, 'link');
    mkdirSync(target);
    symlinkSync(target, link);
    try {
      expect(() =>
        buildAttachments({ first: { filename: 'report.txt', content: new Uint8Array([65]) } }, { outputDir: link }),
      ).toThrow(/symlink/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveAttachment', () => {
  const embedded = { name: 'invoice.xml', size: 3, content: Buffer.from('abc') };
  const referenced = { name: 'linked.dat', size: 0 };

  it('resolves a 1-based index in listed order', () => {
    const result = resolveAttachment([embedded, { name: 'stamp.png', size: 1, content: Buffer.from('x') }], '2');
    expect(result).toMatchObject({ found: true, attachment: { name: 'stamp.png' } });
  });

  it('matches names case-insensitively without host-locale surprises', () => {
    expect(resolveAttachment([embedded], 'INVOICE.XML')).toMatchObject({ found: true });
  });

  it('reports a listed-but-not-embedded match by name instead of calling it a miss', () => {
    // A FileAttachment annotation may reference a file the PDF never
    // embeds. Calling that "no attachment" while listing the very name
    // the caller asked for would contradict itself.
    expect(resolveAttachment([embedded, referenced], 'linked.dat')).toEqual({
      found: false,
      matchedName: 'linked.dat',
      available: [
        { name: 'invoice.xml', size: 3 },
        { name: 'linked.dat', size: 0 },
      ],
    });
  });

  it('omits matchedName on a plain miss, including an out-of-range index', () => {
    expect(resolveAttachment([embedded], 'nope.txt')).not.toHaveProperty('matchedName');
    expect(resolveAttachment([embedded], '5')).not.toHaveProperty('matchedName');
  });
});
