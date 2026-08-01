import { UNTRUSTED_BANNER } from './limits.js';

// Declared as type aliases, not interfaces: the SDK's CallToolResult
// carries an index signature, and only aliases get the implicit one that
// makes them assignable to it.
export type TextBlock = {
  type: 'text';
  text: string;
};

export type ImageBlock = {
  type: 'image';
  mimeType: string;
  data: string;
};

export type ToolBlock = TextBlock | ImageBlock;

export type ToolResult = {
  content: ToolBlock[];
  isError?: boolean;
};

export function textBlock(text: string): TextBlock {
  return { type: 'text', text };
}

/** Every successful payload leads with the untrusted-data boundary. */
export function toolResult(body: string, extra: ToolBlock[] = []): ToolResult {
  return { content: [textBlock(`${UNTRUSTED_BANNER}\n\n${body}`), ...extra] };
}

/**
 * Errors stay in-band (`isError`) rather than as protocol errors so the
 * model sees them and can retry, and every message names the fix.
 */
export function toolError(message: string): ToolResult {
  return { content: [textBlock(`pdfvision error: ${message}`)], isError: true };
}
