/**
 * Wall-clock budget for the regex-mode search of a whole request.
 *
 * The per-page budget in `search/index.ts` bounds one page; multiplied by
 * the page count it stops bounding the *call*. A catastrophic pattern on
 * a 176-page document costs pages × 1s ≈ 3 minutes, which every MCP host
 * times out on and which makes the CLI look hung — the per-page guard
 * keeps its promise and the caller still never gets an answer.
 *
 * 12s is chosen against how the budget is spent, not against how long a
 * search normally takes: an honest regex over a large document runs in
 * well under a second in total, so nothing legitimate approaches this,
 * while a pattern that burns the full per-page budget gives up after ~12
 * pages instead of grinding through hundreds. It also sits inside the
 * request timeout of the MCP hosts we know of, so the partial result and
 * its warning actually reach the caller.
 *
 * Only regex searches are metered. Literal-mode matching has no
 * pathological case — it never enters the per-page guard either — so
 * spending a deadline check on it would add a mechanism with nothing to
 * catch.
 */
export const REGEX_SEARCH_REQUEST_BUDGET_MS = 12_000;

/** Marks the whole-request variant of a regex time-budget warning. */
export const REGEX_BUDGET_WARNING_PREFIX = 'regex search stopped:';

export interface RegexSearchBudget {
  /**
   * Take the budget for one page. `false` means the deadline has passed
   * and the caller must skip that page's search.
   */
  claimPage(pageNum: number): boolean;
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
  /** Injectable clock so tests can cross the deadline without waiting. */
  now: () => number = Date.now,
): RegexSearchBudget {
  const deadline = now() + budgetMs;
  const searched = new Set<number>();
  const skipped = new Set<number>();
  return {
    claimPage(pageNum: number): boolean {
      if (now() < deadline) {
        searched.add(pageNum);
        return true;
      }
      // A page can be claimed twice (native pass, then the OCR-supplement
      // pass). If the second claim is refused the page was not searched
      // in full, so it counts as skipped and gives up its "searched" slot
      // — that keeps searched + skipped equal to the pages selected.
      searched.delete(pageNum);
      skipped.add(pageNum);
      return false;
    },
    report(onWarning?: (message: string) => void): void {
      if (skipped.size === 0) return;
      const remaining = [...skipped].sort((a, b) => a - b);
      const resume = `${remaining[0]}-${remaining[remaining.length - 1]}`;
      onWarning?.(
        `${REGEX_BUDGET_WARNING_PREFIX} the ${budgetMs}ms whole-request regex time budget was exhausted after searching ${searched.size} of ${totalPages} selected page(s). ` +
          `Matches found so far are kept; ${skipped.size} page(s) were not searched, so a zero result here is not evidence of absence. ` +
          `Simplify the pattern (catastrophic backtracking is the likely cause) or re-run over the remaining pages with pages "${resume}".`,
      );
    },
  };
}
