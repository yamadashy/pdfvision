import { formatPageRange } from '../options/pageRange.js';

/**
 * Cumulative budget for the time a request spends *inside* regex matching.
 *
 * The per-page budget in `search/index.ts` bounds one page; multiplied by
 * the page count it stops bounding the *call*. A catastrophic pattern on
 * a 176-page document costs pages × 1s ≈ 3 minutes, which every MCP host
 * times out on and which makes the CLI look hung — the per-page guard
 * keeps its promise and the caller still never gets an answer.
 *
 * What is metered is search time, not the request's wall clock: only the
 * duration of each page's search pass is charged, so page extraction,
 * rasterisation, and OCR — which can dominate a long or scanned document
 * — cannot spend a budget they had no part in. Metering wall clock would
 * cut off an honest regex on a document whose extraction alone ran past
 * the limit, and would blame catastrophic backtracking for it.
 *
 * 12s is chosen against how the budget is spent, not against how long a
 * search normally takes: an honest regex over a large document runs in
 * well under a second in total, so nothing legitimate approaches this,
 * while a pattern that burns the full per-page budget gives up after ~12
 * pages instead of grinding through hundreds. It also leaves the call
 * inside the request timeout of the MCP hosts we know of, so the partial
 * result and its warning actually reach the caller.
 *
 * Only regex searches are metered. Literal-mode matching has no
 * pathological case — it never enters the per-page guard either — so
 * metering it would add a mechanism with nothing to catch.
 */
export const REGEX_SEARCH_REQUEST_BUDGET_MS = 12_000;

/** Marks the whole-request variant of a regex time-budget warning. */
export const REGEX_BUDGET_WARNING_PREFIX = 'regex search stopped:';

/**
 * True for the single summary warning a spent request budget emits.
 * Consumers that rank or reserve space for warnings treat it apart from
 * the per-page timeouts: there is at most one per request, it is emitted
 * last, and it is the one that says which pages went unsearched.
 */
export function isRegexBudgetWarning(message: string): boolean {
  return message.startsWith(REGEX_BUDGET_WARNING_PREFIX);
}

export interface RegexSearchBudget {
  /**
   * Run one page's search pass, charging what it costs to the budget.
   * Returns `undefined` when the budget was already spent, in which case
   * `search` is not run and the page counts as unsearched.
   */
  run<T>(pageNum: number, search: () => T): T | undefined;
  /** Emit the single summary warning, if any page went unsearched. */
  report(onWarning?: (message: string) => void): void;
}

/**
 * @param totalPages Pages selected for this request (not the document's
 * page count) — the denominator the warning reports against.
 */
export function createRegexSearchBudget(
  totalPages: number,
  budgetMs: number = REGEX_SEARCH_REQUEST_BUDGET_MS,
  /** Injectable clock so tests can spend the budget without waiting. */
  now: () => number = Date.now,
): RegexSearchBudget {
  let spent = 0;
  const searched = new Set<number>();
  const skipped = new Set<number>();
  return {
    run<T>(pageNum: number, search: () => T): T | undefined {
      if (spent >= budgetMs) {
        // A page can be run twice (native pass, then the OCR-supplement
        // pass). If the second run is refused the page was not searched
        // in full, so it counts as skipped and gives up its "searched"
        // slot — that keeps searched + skipped equal to the pages
        // selected.
        searched.delete(pageNum);
        skipped.add(pageNum);
        return undefined;
      }
      const started = now();
      try {
        const result = search();
        searched.add(pageNum);
        return result;
      } finally {
        // Charged even when the pass throws: the time was spent either
        // way, and the per-page guard reports its timeout as a return
        // rather than a throw.
        spent += now() - started;
      }
    },
    report(onWarning?: (message: string) => void): void {
      if (skipped.size === 0) return;
      // The page loop runs pages concurrently, so the unsearched set is
      // not necessarily a suffix and the selection itself may have holes
      // ("1,3,5"). Name the actual pages rather than a min-max span that
      // would sweep in pages that were searched or never selected.
      const resume = formatPageRange([...skipped]);
      onWarning?.(
        `${REGEX_BUDGET_WARNING_PREFIX} the ${budgetMs}ms budget for regex search time across this request was exhausted after searching ${searched.size} of ${totalPages} selected page(s). ` +
          `Matches found so far are kept; ${skipped.size} page(s) were not searched, so a zero result here is not evidence of absence. ` +
          `Simplify the pattern (catastrophic backtracking is the likely cause) or re-run over the unsearched pages with pages "${resume}".`,
      );
    },
  };
}
