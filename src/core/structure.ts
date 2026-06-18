import type { PageStructureContent, PageStructureItem, PageStructureNode } from '../types/index.js';

interface BuildStructureOptions {
  normalizeText?: (value: string) => string;
  pageHeight?: number;
  viewMinX?: number;
  viewMinY?: number;
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function bboxValue(value: unknown, options: BuildStructureOptions): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const numbers = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  if (numbers.length !== value.length || numbers.length === 0) return undefined;
  if (numbers.length !== 4 || !Number.isFinite(options.pageHeight) || (options.pageHeight as number) <= 0) {
    return numbers;
  }

  const [x1, y1, x2, y2] = numbers;
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const viewMinX = options.viewMinX ?? 0;
  const viewMinY = options.viewMinY ?? 0;
  return [
    round2(minX - viewMinX),
    round2((options.pageHeight as number) - (maxY - viewMinY)),
    round2(maxX - minX),
    round2(maxY - minY),
  ];
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
  const bbox = bboxValue(value.bbox, options);
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
