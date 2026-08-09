/**
 * The remedy clause every `reading_order_divergence` message ends with.
 *
 * It is right for a consumer holding structured output — JSON, XML, TOON —
 * which has `layout.blocks` next to `pages[].text` and a choice about
 * which one to read. It is wrong for a consumer that has already been
 * handed the rebuilt order, which is every Markdown consumer including
 * the MCP tools: there the advice names an artifact the caller cannot
 * request and a step pdfvision already took.
 *
 * A detector cannot know which of those is downstream, so it states the
 * divergence and appends this default; the surface that has already
 * applied the remedy swaps the clause out. Exported so that swap matches
 * an exact string rather than guessing at the message's shape.
 */
export const READING_ORDER_REMEDY = 'prefer layout.blocks order when sequence matters';
