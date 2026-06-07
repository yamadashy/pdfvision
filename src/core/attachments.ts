import type { DocumentAttachment } from '../types/index.js';

interface PdfAttachment {
  filename?: unknown;
  rawFilename?: unknown;
  description?: unknown;
  content?: unknown;
}

interface BuildAttachmentsOptions {
  normalizeText?: (value: string) => string;
}

export function buildAttachments(
  attachments: Record<string, unknown> | null | undefined,
  options: BuildAttachmentsOptions = {},
): DocumentAttachment[] {
  if (!attachments) return [];

  return Object.entries(attachments)
    .map(([key, value]) => buildAttachment(key, value as PdfAttachment, options))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildAttachment(key: string, attachment: PdfAttachment, options: BuildAttachmentsOptions): DocumentAttachment {
  const name = textValue(attachment.filename, options.normalizeText) ?? textValue(key, options.normalizeText) ?? key;
  const rawName = textValue(attachment.rawFilename, options.normalizeText);
  const description = textValue(attachment.description, options.normalizeText);

  return {
    name,
    ...(rawName !== undefined && rawName !== name && { rawName }),
    ...(description !== undefined && { description }),
    size: byteLength(attachment.content),
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
