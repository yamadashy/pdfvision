interface TextContentLike {
  items: unknown[];
}

interface MarkedContentMarker {
  type?: unknown;
  id?: unknown;
  tag?: unknown;
}

interface TextItemLike {
  str: string;
}

interface MarkedContentFrame {
  id?: string;
  artifact: boolean;
}

interface BuildMarkedContentTextOptions {
  normalizeText?: (value: string) => string;
}

export function buildMarkedContentTextMap(
  content: TextContentLike,
  options: BuildMarkedContentTextOptions = {},
): ReadonlyMap<string, string> {
  const stack: MarkedContentFrame[] = [];
  const chunks = new Map<string, string[]>();

  for (const item of content.items) {
    if (isBeginMarker(item)) {
      const id = typeof item.id === 'string' && item.id.length > 0 ? item.id : undefined;
      stack.push({ id, artifact: item.tag === 'Artifact' });
      if (id && !chunks.has(id)) chunks.set(id, []);
      continue;
    }
    if (isEndMarker(item)) {
      stack.pop();
      continue;
    }
    if (!isTextItem(item) || stack.some((frame) => frame.artifact)) continue;

    const id = activeMarkedContentId(stack);
    if (!id) continue;
    const normalized = options.normalizeText ? options.normalizeText(item.str) : item.str;
    const text = normalized.trim();
    if (text.length > 0) chunks.get(id)?.push(text);
  }

  return new Map([...chunks].map(([id, values]) => [id, values.join(' ')]));
}

function activeMarkedContentId(stack: readonly MarkedContentFrame[]): string | undefined {
  for (let index = stack.length - 1; index >= 0; index--) {
    if (stack[index].id) return stack[index].id;
  }
  return undefined;
}

function isBeginMarker(item: unknown): item is MarkedContentMarker {
  if (!item || typeof item !== 'object') return false;
  const type = (item as MarkedContentMarker).type;
  return type === 'beginMarkedContent' || type === 'beginMarkedContentProps';
}

function isEndMarker(item: unknown): boolean {
  return !!item && typeof item === 'object' && (item as MarkedContentMarker).type === 'endMarkedContent';
}

function isTextItem(item: unknown): item is TextItemLike {
  return !!item && typeof item === 'object' && typeof (item as TextItemLike).str === 'string';
}
