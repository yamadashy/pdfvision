import { closeSync, constants as fsConstants, lstatSync, mkdirSync, openSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DocumentAttachment } from '../types/index.js';
import { atomicWrite } from './cache.js';

interface PdfAttachment {
  filename?: unknown;
  rawFilename?: unknown;
  description?: unknown;
  content?: unknown;
}

interface BuildAttachmentsOptions {
  normalizeText?: (value: string) => string;
  outputDir?: string;
}

export function buildAttachments(
  attachments: Record<string, unknown> | null | undefined,
  options: BuildAttachmentsOptions = {},
): DocumentAttachment[] {
  if (!attachments) return [];

  const usedFilenames = new Set<string>();
  return Object.entries(attachments)
    .map(([key, value], index) => buildAttachment(key, value as PdfAttachment, index + 1, usedFilenames, options))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildAttachment(
  key: string,
  attachment: PdfAttachment,
  index: number,
  usedFilenames: Set<string>,
  options: BuildAttachmentsOptions,
): DocumentAttachment {
  const name = textValue(attachment.filename, options.normalizeText) ?? textValue(key, options.normalizeText) ?? key;
  const rawName = textValue(attachment.rawFilename, options.normalizeText);
  const description = textValue(attachment.description, options.normalizeText);
  const content = bytes(attachment.content);
  const path =
    options.outputDir && content
      ? writeAttachment(options.outputDir, safeAttachmentFilename(name, index, usedFilenames), content)
      : undefined;

  return {
    name,
    ...(rawName !== undefined && rawName !== name && { rawName }),
    ...(description !== undefined && { description }),
    size: content?.byteLength ?? byteLength(attachment.content),
    ...(path !== undefined && { path }),
  };
}

function textValue(value: unknown, normalizeText: ((value: string) => string) | undefined): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return normalizeText ? normalizeText(value) : value;
}

function byteLength(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  const maybe = value as { byteLength?: unknown; length?: unknown };
  if (typeof maybe.byteLength === 'number' && Number.isFinite(maybe.byteLength)) return maybe.byteLength;
  if (typeof maybe.length === 'number' && Number.isFinite(maybe.length)) return maybe.length;
  return 0;
}

function bytes(value: unknown): Buffer | undefined {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return undefined;
}

function writeAttachment(outputDir: string, filename: string, content: Buffer): string {
  const dir = resolve(outputDir);
  mkdirSync(dir, { recursive: true });
  assertSafeAttachmentDir(dir);

  const outPath = join(dir, filename);
  atomicWrite(outPath, content);
  return outPath;
}

function assertSafeAttachmentDir(dir: string): void {
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to write attachments into ${dir}: path is a symlink`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Refusing to write attachments into ${dir}: path exists but is not a directory`);
  }
  if (process.platform === 'win32') return;

  const flags = fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW;
  let fd: number;
  try {
    fd = openSync(dir, flags);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error(`Refusing to write attachments into ${dir}: path is a symlink`);
    }
    throw error;
  }
  closeSync(fd);
}

function safeAttachmentFilename(name: string, index: number, used: Set<string>): string {
  const cleaned = [...name]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      return char === '/' || char === '\\' || code < 32 || code === 127 ? '_' : char;
    })
    .join('')
    .trim();
  const fallback = `attachment-${index}`;
  const base = cleaned === '' || cleaned === '.' || cleaned === '..' ? fallback : cleaned;

  let candidate = base;
  let suffix = 2;
  while (used.has(canonicalAttachmentFilename(candidate))) {
    candidate = `${base}-${suffix}`;
    suffix++;
  }
  used.add(canonicalAttachmentFilename(candidate));
  return candidate;
}

function canonicalAttachmentFilename(filename: string): string {
  return filename.toLocaleLowerCase('en-US');
}
