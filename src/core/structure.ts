import type { PageStructureContent, PageStructureItem, PageStructureNode } from '../types/index.js';

interface BuildStructureOptions {
  normalizeText?: (value: string) => string;
}

interface PdfStructTreeNode {
  role?: unknown;
  alt?: unknown;
  mathML?: unknown;
  lang?: unknown;
  bbox?: unknown;
  children?: unknown;
}

interface PdfStructTreeContent {
  type?: unknown;
  id?: unknown;
}

function textValue(value: unknown, options: BuildStructureOptions): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const normalized = options.normalizeText ? options.normalizeText(value) : value;
  const sanitized = dropControlBytes(normalized);
  return sanitized.length > 0 ? sanitized : undefined;
}

function dropControlBytes(value: string): string {
  let out = '';
  for (const char of value) {
    const cp = char.codePointAt(0) as number;
    if (!isControlByte(cp)) out += char;
  }
  return out;
}

function isControlByte(cp: number): boolean {
  if (cp < 0x20) return cp !== 0x09 && cp !== 0x0a && cp !== 0x0d;
  return cp === 0x7f || (cp >= 0x80 && cp <= 0x9f);
}

function bboxValue(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const numbers = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  return numbers.length === value.length && numbers.length > 0 ? numbers : undefined;
}

function contentValue(value: PdfStructTreeContent, options: BuildStructureOptions): PageStructureContent | undefined {
  const type = textValue(value.type, options);
  const id = textValue(value.id, options);
  return type && id ? { type, id } : undefined;
}

function structureItem(value: unknown, options: BuildStructureOptions): PageStructureItem | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as PdfStructTreeNode & PdfStructTreeContent;
  if (typeof raw.role === 'string') return structureNode(raw, options);
  return contentValue(raw, options);
}

function structureNode(value: PdfStructTreeNode, options: BuildStructureOptions): PageStructureNode | undefined {
  const role = textValue(value.role, options);
  if (!role) return undefined;
  const alt = textValue(value.alt, options);
  const mathML = textValue(value.mathML, options);
  const lang = textValue(value.lang, options);
  const bbox = bboxValue(value.bbox);
  const children = Array.isArray(value.children)
    ? value.children
        .map((child) => structureItem(child, options))
        .filter((child): child is PageStructureItem => child !== undefined)
    : [];

  return {
    role,
    ...(alt !== undefined && { alt }),
    ...(mathML !== undefined && { mathML }),
    ...(lang !== undefined && { lang }),
    ...(bbox !== undefined && { bbox }),
    children,
  };
}

export function buildPageStructure(tree: unknown, options: BuildStructureOptions = {}): PageStructureNode | null {
  if (!tree) return null;
  return structureNode(tree as PdfStructTreeNode, options) ?? null;
}

export function countStructureNodes(structure: PageStructureNode | null | undefined): number {
  if (!structure) return 0;
  return (
    1 +
    structure.children.reduce((sum, child) => {
      return 'role' in child ? sum + countStructureNodes(child) : sum;
    }, 0)
  );
}
