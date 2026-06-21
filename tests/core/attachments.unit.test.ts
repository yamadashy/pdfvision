import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAttachments } from '../../src/core/document/attachments.js';

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
