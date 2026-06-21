import { formatJson } from '../../output/json.js';
import { formatMarkdown } from '../../output/markdown.js';
import { formatToon } from '../../output/toon.js';
import { formatXml } from '../../output/xml.js';
import type { DocumentResult, ProcessOptions } from '../../types/index.js';

/** Render a structured DocumentResult into the caller-requested string format. */
export function renderResult(result: DocumentResult, options: ProcessOptions): string {
  const { format } = options;
  switch (format) {
    case 'json':
      return formatJson(result);
    case 'xml':
      return formatXml(result);
    case 'toon':
      return formatToon(result);
    default:
      return formatMarkdown(result, { stripRepeated: options.stripRepeated });
  }
}
