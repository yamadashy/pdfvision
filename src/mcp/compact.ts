/**
 * Strip the "we looked and found nothing" stanzas from a Markdown body.
 *
 * The CLI emits them on purpose: a user who typed `--form-fields` needs
 * to see that the pass ran and the page had none. Under MCP nobody typed
 * a flag — the server requests form fields, links, and annotations on
 * every read so that pages which *do* have them come back complete in
 * one call. Paying three empty sections per page for that is the whole
 * cost of the flagless design, so it is removed here rather than pushed
 * back onto the model as an `include` parameter.
 *
 * The sentinel sentences are matched exactly and covered by tests, so a
 * wording change in the formatter fails loudly instead of silently
 * leaking noise back into every response.
 */

const EMPTY_SECTIONS = [
  '_No interactive form fields found._',
  '_No clickable links found._',
  '_No non-link annotations found._',
  '_No crop-ready visual regions found._',
] as const;

/** Zero-valued density fragments for the same three passes. */
const ZERO_FRAGMENTS = /( · (?:formFields|links|annotations): 0\b)/g;

export function compactBody(markdown: string): string {
  let output = markdown;
  for (const sentinel of EMPTY_SECTIONS) {
    // Remove the sentinel together with the `### Heading` that introduces
    // it and the blank lines either side.
    const pattern = new RegExp(`\\n*^###[^\\n]*\\n\\n${escapeRegExp(sentinel)}\\n?`, 'gm');
    output = output.replace(pattern, '\n');
  }
  return output.replace(ZERO_FRAGMENTS, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Exposed so a test can assert the formatter still emits exactly these. */
export const EMPTY_SECTION_SENTINELS: readonly string[] = EMPTY_SECTIONS;
