import type { DocumentResult } from '../types/index.js';

export function formatJson(result: DocumentResult): string {
  return JSON.stringify(result, null, 2);
}
