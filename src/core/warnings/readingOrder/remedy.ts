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

/**
 * The character-reorder detector's variant. Same advice, qualified: that
 * warning is about superscripts, radicals, and inline math read out of
 * order within one block, where only exact sequence is at stake.
 *
 * Kept as its own string rather than folded into the shared one so that
 * structured output stays byte-identical — a `message` is a public field
 * of `pages[].warnings[]`, and rewording it for no behavioural reason
 * would churn every JSON, XML, and TOON consumer.
 */
export const READING_ORDER_REMEDY_EXACT = 'prefer layout.blocks order when exact sequence matters';

/**
 * Every clause a reading-order message can end with, for surfaces that
 * substitute their own. Both are matched, not just the current one: the
 * extraction cache is content-addressed and its version is independent of
 * this wording, so a `DocumentResult` written by an older pdfvision — or
 * one a library caller held onto — is re-formatted long after the clause
 * it carries stopped being the one a detector would emit today.
 */
export const READING_ORDER_REMEDIES = [READING_ORDER_REMEDY_EXACT, READING_ORDER_REMEDY] as const;
