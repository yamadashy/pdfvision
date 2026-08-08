import type { AttachmentContent } from '../core/document/attachmentContent.js';
import { BODY_CHAR_CAP, MAX_TOTAL_IMAGE_BYTES } from './limits.js';
import { type ToolBlock, type ToolResult, textBlock, toolResult } from './result.js';

/**
 * What can usefully cross into a model's context, and what cannot.
 *
 * An embedded XML or CSV is often the *authoritative* payload — a
 * Factur-X invoice's pages are a rendering of its attached XML — so
 * refusing it would leave the machine-readable truth unreachable from a
 * shell-less host. A spreadsheet or archive is the opposite: delivering
 * its bytes into a context window accomplishes nothing, and the honest
 * answer is to name the command that writes it to disk.
 */

const IMAGE_SIGNATURES: { mimeType: string; magic: number[] }[] = [
  { mimeType: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { mimeType: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { mimeType: 'image/gif', magic: [0x47, 0x49, 0x46, 0x38] },
];

function imageMimeType(content: Uint8Array): string | undefined {
  for (const { mimeType, magic } of IMAGE_SIGNATURES) {
    if (magic.every((byte, index) => content[index] === byte)) return mimeType;
  }
  // WebP is RIFF-framed: "RIFF" .... "WEBP".
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];
  if (riff.every((b, i) => content[i] === b) && webp.every((b, i) => content[i + 8] === b)) return 'image/webp';
  return undefined;
}

/**
 * Decoded text, or undefined when the bytes are not text.
 *
 * Sniffed rather than taken from the file extension: the payload that
 * matters is often named for its standard (`factur-x`, `xrechnung`)
 * rather than its syntax, and an extension allowlist would refuse those
 * while accepting a `.txt` full of binary.
 */
function decodeText(content: Uint8Array): string | undefined {
  if (content.includes(0)) return undefined;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    return undefined;
  }
}

function describe(attachment: AttachmentContent): string {
  const description = attachment.description ? ` — ${attachment.description}` : '';
  return `# Attachment \`${attachment.name}\`${description}\n\n_${attachment.size.toLocaleString('en-US')} bytes._`;
}

export function attachmentResult(attachment: AttachmentContent): ToolResult {
  const text = decodeText(attachment.content);
  if (text !== undefined) {
    const clipped =
      text.length > BODY_CHAR_CAP
        ? `${text.slice(0, BODY_CHAR_CAP)}\n\n[pdfvision] Attachment clipped at the ${BODY_CHAR_CAP.toLocaleString('en-US')}-char response budget (${(text.length - BODY_CHAR_CAP).toLocaleString('en-US')} chars omitted). Extract it whole with \`pdfvision <file> --attachments --attachment-output <dir>\`.`
        : text;
    return toolResult(`${describe(attachment)}\n\n\`\`\`\n${clipped}\n\`\`\``);
  }

  const mimeType = imageMimeType(attachment.content);
  if (mimeType) {
    if (attachment.content.byteLength > MAX_TOTAL_IMAGE_BYTES) {
      return toolResult(
        `${describe(attachment)}\n\n[pdfvision] Image attachment is over the ${Math.round(MAX_TOTAL_IMAGE_BYTES / 1024 / 1024)} MB response budget. Save it with \`pdfvision <file> --attachments --attachment-output <dir>\`.`,
      );
    }
    const blocks: ToolBlock[] = [
      textBlock(`Attachment ${attachment.name}:`),
      { type: 'image', mimeType, data: Buffer.from(attachment.content).toString('base64') },
    ];
    return toolResult(describe(attachment), blocks);
  }

  // Neither text nor an image the host can display. Say so plainly and
  // name the command that does deliver it, rather than emitting bytes
  // nothing downstream can use.
  return toolResult(
    `${describe(attachment)}\n\n[pdfvision] This attachment is neither text nor a displayable image, so its bytes cannot be delivered into context. Write it to disk with \`pdfvision <file> --attachments --attachment-output <dir>\` and open it with the right tool.`,
  );
}
