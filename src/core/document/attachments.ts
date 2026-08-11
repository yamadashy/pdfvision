import { createHash } from 'node:crypto';
import { closeSync, constants as fsConstants, lstatSync, mkdirSync, openSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DocumentAttachment } from '../../types/index.js';
import { atomicWrite } from '../io/atomicWrite.js';

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

export async function catalogAttachmentsToRecord(
  attachments: ReadonlyMap<string, unknown> | null | undefined,
  getContent: (id: string) => Promise<unknown>,
): Promise<Record<string, unknown> | null> {
  if (!attachments || attachments.size === 0) return null;

  // Null-prototype for the same reason as the merge below: the key is a
  // PDF-supplied EmbeddedFiles name, and `__proto__` assigned onto a
  // plain object sets the prototype instead of becoming an entry — the
  // attachment would vanish from `Object.entries`, taking
  // `attachmentCount` down with it.
  const record: Record<string, unknown> = Object.create(null);
  for (const [id, value] of attachments) {
    const attachment = value as PdfAttachment;
    const content = attachment.content === undefined ? await getContent(id) : attachment.content;
    record[id] = {
      ...attachment,
      ...(content !== undefined && { content }),
    };
  }
  return record;
}

export function buildAttachments(
  attachments: Record<string, unknown> | null | undefined,
  options: BuildAttachmentsOptions = {},
): DocumentAttachment[] {
  if (!attachments) return [];

  const usedFilenames = new Set<string>();
  return Object.entries(attachments)
    .map(([key, value], index) => buildAttachment(key, value as PdfAttachment, index + 1, usedFilenames, options))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-US'));
}

/**
 * Same list as {@link buildAttachments}, in the same order, but carrying
 * the embedded bytes.
 *
 * Kept out of `DocumentAttachment` on purpose: `DocumentResult` is
 * `JSON.stringify`-ed whole by the JSON formatter, so a `Uint8Array`
 * anywhere inside it would serialise as `{"0":80,"1":75,...}`. Callers
 * that need the bytes ask for them here and never through the document
 * result.
 */
export function buildAttachmentsWithContent(
  attachments: Record<string, unknown> | null | undefined,
  options: BuildAttachmentsOptions = {},
): (DocumentAttachment & { content?: Buffer })[] {
  if (!attachments) return [];

  const usedFilenames = new Set<string>();
  return Object.entries(attachments)
    .map(([key, value], index) => {
      const attachment = value as PdfAttachment;
      const content = bytes(attachment.content);
      return {
        ...buildAttachment(key, attachment, index + 1, usedFilenames, options, content),
        ...(content !== undefined && { content }),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en-US'));
}

export function mergeAttachmentRecords(
  ...records: (Record<string, unknown> | null | undefined)[]
): Record<string, unknown> | null {
  const merged: Record<string, unknown> = Object.create(null);
  const seen = new Set<string>();
  let fallbackIndex = 1;

  for (const record of records) {
    if (!record) continue;
    for (const [key, value] of Object.entries(record)) {
      const attachment = value as PdfAttachment;
      const identity = attachmentIdentity(key, attachment);
      if (seen.has(identity)) continue;
      seen.add(identity);
      merged[uniqueRecordKey(key || `attachment-${fallbackIndex}`, merged)] = value;
      fallbackIndex++;
    }
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

function buildAttachment(
  key: string,
  attachment: PdfAttachment,
  index: number,
  usedFilenames: Set<string>,
  options: BuildAttachmentsOptions,
  // Defaulted so callers that already converted the bytes (Buffer.from
  // copies a Uint8Array) can hand them in instead of paying for a
  // second copy per attachment.
  content: Buffer | undefined = bytes(attachment.content),
): DocumentAttachment {
  const name = textValue(attachment.filename, options.normalizeText) ?? textValue(key, options.normalizeText) ?? key;
  const rawName = textValue(attachment.rawFilename, options.normalizeText);
  const description = textValue(attachment.description, options.normalizeText);
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

/**
 * Identity used to drop the same embedded file when it reaches us from
 * more than one place (the name tree and a FileAttachment annotation
 * both list it).
 *
 * Name plus byte length is not enough: two genuinely different files can
 * share a name and a size — two `report.csv` exports of the same shape —
 * and dropping one of them loses data silently, which is worse than
 * listing a duplicate. Hash the bytes when we have them and fall back to
 * the length only when the content was not embedded.
 */
function attachmentIdentity(key: string, attachment: PdfAttachment): string {
  const name = rawText(attachment.filename) ?? rawText(attachment.rawFilename) ?? key;
  const content = bytes(attachment.content);
  const fingerprint = content
    ? createHash('sha256').update(content).digest('hex')
    : `len:${byteLength(attachment.content)}`;
  return `${name}\u0000${fingerprint}`;
}

function rawText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function uniqueRecordKey(key: string, record: Record<string, unknown>): string {
  let candidate = key;
  let suffix = 2;
  while (Object.hasOwn(record, candidate)) {
    candidate = `${key}-${suffix}`;
    suffix++;
  }
  return candidate;
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
