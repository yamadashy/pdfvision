export function shortTextSample(text: string): string {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  return normalized.length > 40 ? `${normalized.slice(0, 37)}...` : normalized;
}
