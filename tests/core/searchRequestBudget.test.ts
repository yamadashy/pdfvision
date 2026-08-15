import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processDocument } from '../../src/core/processor.js';
import { isRegexTimeoutWarning } from '../../src/core/search/index.js';
import {
  createRegexSearchBudget,
  REGEX_SEARCH_REQUEST_BUDGET_MS,
  resolveRegexSearchBudgetMs,
} from '../../src/core/search/requestBudget.js';

const SAMPLE_JA_PDF = resolve(__dirname, '../fixtures/sample-ja.pdf');

/** Hand-cranked clock so spent time is exact, not slept for. */
function clock(start = 1_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('createRegexSearchBudget', () => {
  /** A search pass that "costs" `ms` on the injected clock. */
  const costing = (time: ReturnType<typeof clock>, ms: number, value = 'searched') => {
    return () => {
      time.advance(ms);
      return value;
    };
  };

  it('runs pages until the budget is spent, then refuses the rest', () => {
    const time = clock();
    const budget = createRegexSearchBudget(4, 1000, time.now);

    expect(budget.run(1, costing(time, 400))).toBe('searched');
    expect(budget.run(2, costing(time, 599))).toBe('searched');
    // 999ms spent — still under, so this page runs and overshoots.
    expect(budget.run(3, costing(time, 5000))).toBe('searched');
    let ran = false;
    expect(
      budget.run(4, () => {
        ran = true;
        return 'searched';
      }),
    ).toBeUndefined();
    expect(ran).toBe(false);
  });

  it('charges only the search itself, not time spent between pages', () => {
    // Extraction, rasterisation, and OCR run between passes on a real
    // document; a budget that counted them would cut off an honest regex
    // on a long or scanned file and then blame the pattern.
    const time = clock();
    const budget = createRegexSearchBudget(3, 100, time.now);

    budget.run(1, costing(time, 10));
    time.advance(60_000);
    budget.run(2, costing(time, 10));
    time.advance(60_000);
    expect(budget.run(3, costing(time, 10))).toBe('searched');

    const warnings: string[] = [];
    budget.report((message) => warnings.push(message));
    expect(warnings).toEqual([]);
  });

  it('charges a pass that threw, and lets the error through', () => {
    const time = clock();
    const budget = createRegexSearchBudget(2, 100, time.now);

    expect(() =>
      budget.run(1, () => {
        time.advance(100);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(budget.run(2, costing(time, 1))).toBeUndefined();
  });

  it('reports what was searched, what was left, and where to resume', () => {
    const time = clock();
    const budget = createRegexSearchBudget(5, 100, time.now);
    budget.run(1, costing(time, 50));
    budget.run(2, costing(time, 50));
    budget.run(3, costing(time, 1));
    budget.run(4, costing(time, 1));
    budget.run(5, costing(time, 1));

    const warnings: string[] = [];
    budget.report((message) => warnings.push(message));

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('100ms budget for regex search time across this request');
    expect(warnings[0]).toContain('after searching 2 of 5 selected page(s)');
    expect(warnings[0]).toContain('3 page(s) were not searched');
    expect(warnings[0]).toContain('pages "3-5"');
    // Ranked with the per-page timeout class: same consequence for the
    // caller (a zero that is not evidence of absence) and same reason to
    // keep the partial result out of the cache.
    expect(isRegexTimeoutWarning(warnings[0])).toBe(true);
  });

  it('names non-contiguous unsearched pages instead of spanning them', () => {
    // Pages complete out of order and a selection can have holes, so the
    // unsearched set is not necessarily a contiguous run.
    const time = clock();
    const budget = createRegexSearchBudget(4, 100, time.now);
    budget.run(1, costing(time, 1));
    budget.run(3, costing(time, 99));
    budget.run(5, costing(time, 1));
    budget.run(7, costing(time, 1));
    budget.run(8, costing(time, 1));

    const warnings: string[] = [];
    budget.report((message) => warnings.push(message));

    expect(warnings[0]).toContain('pages "5, 7-8"');
  });

  it('stays silent when every page was searched in time', () => {
    const time = clock();
    const budget = createRegexSearchBudget(2, 1000, time.now);
    budget.run(1, costing(time, 1));
    budget.run(2, costing(time, 1));

    const warnings: string[] = [];
    budget.report((message) => warnings.push(message));

    expect(warnings).toEqual([]);
  });

  it('counts a page whose second pass was refused as unsearched', () => {
    // Native pass makes it in, the OCR-supplement pass does not: the page
    // was not searched in full, and searched + skipped must still add up.
    const time = clock();
    const budget = createRegexSearchBudget(2, 100, time.now);
    budget.run(1, costing(time, 1));
    budget.run(2, costing(time, 99));
    expect(budget.run(2, costing(time, 1))).toBeUndefined();

    const warnings: string[] = [];
    budget.report((message) => warnings.push(message));

    expect(warnings[0]).toContain('after searching 1 of 2 selected page(s)');
    expect(warnings[0]).toContain('1 page(s) were not searched');
  });

  it('defaults to a budget that leaves room for honest searches', () => {
    expect(REGEX_SEARCH_REQUEST_BUDGET_MS).toBeGreaterThanOrEqual(10_000);
    expect(REGEX_SEARCH_REQUEST_BUDGET_MS).toBeLessThanOrEqual(15_000);
  });
});

describe('resolveRegexSearchBudgetMs', () => {
  it('accepts a value that tightens the bound', () => {
    expect(resolveRegexSearchBudgetMs(0)).toBe(0);
    expect(resolveRegexSearchBudgetMs(250)).toBe(250);
    expect(resolveRegexSearchBudgetMs(REGEX_SEARCH_REQUEST_BUDGET_MS)).toBe(REGEX_SEARCH_REQUEST_BUDGET_MS);
  });

  it('refuses anything that would loosen or remove the bound', () => {
    // The override rides on the public options object, so a library
    // caller — or a wrapper forwarding its own caller's options — can
    // reach it. None of these may switch the ReDoS bound off.
    for (const override of [Number.POSITIVE_INFINITY, Number.NaN, -1, REGEX_SEARCH_REQUEST_BUDGET_MS + 1, 1e9]) {
      expect(resolveRegexSearchBudgetMs(override)).toBe(REGEX_SEARCH_REQUEST_BUDGET_MS);
    }
  });

  it('falls back to the default when unset', () => {
    expect(resolveRegexSearchBudgetMs(undefined)).toBe(REGEX_SEARCH_REQUEST_BUDGET_MS);
  });
});

describe('processDocument regex search budget', () => {
  it('searches every page under the default budget', async () => {
    const warnings: string[] = [];
    const result = await processDocument(SAMPLE_JA_PDF, {
      search: 'ページ|pdfvision|テスト',
      searchRegex: true,
      noCache: true,
      onWarning: (message) => warnings.push(message),
    });

    expect(result.pages).toHaveLength(3);
    expect(result.pages.some((p) => (p.matches?.length ?? 0) > 0)).toBe(true);
    expect(warnings.filter(isRegexTimeoutWarning)).toEqual([]);
  });

  it('stops searching once the whole-request budget is gone and says so', async () => {
    const warnings: string[] = [];
    const result = await processDocument(SAMPLE_JA_PDF, {
      search: 'ページ|pdfvision|テスト',
      searchRegex: true,
      // Already spent before the first page is reached.
      regexSearchBudgetMs: 0,
      noCache: true,
      onWarning: (message) => warnings.push(message),
    });

    // Extraction still completes — only the search stops.
    expect(result.pages).toHaveLength(3);
    expect(result.pages[0].text.length).toBeGreaterThan(0);
    for (const page of result.pages) expect(page.matches).toEqual([]);

    const budgetWarnings = warnings.filter(isRegexTimeoutWarning);
    expect(budgetWarnings).toHaveLength(1);
    expect(budgetWarnings[0]).toContain('after searching 0 of 3 selected page(s)');
    expect(budgetWarnings[0]).toContain('pages "1-3"');
  });

  it('does not meter literal searches', async () => {
    // Literal matching has no pathological case, so a spent budget must
    // not silence it.
    const warnings: string[] = [];
    const result = await processDocument(SAMPLE_JA_PDF, {
      search: 'pdfvision',
      regexSearchBudgetMs: 0,
      noCache: true,
      onWarning: (message) => warnings.push(message),
    });

    expect(result.pages.some((p) => (p.matches?.length ?? 0) > 0)).toBe(true);
    expect(warnings.filter(isRegexTimeoutWarning)).toEqual([]);
  });

  it('keeps an interrupted search out of the cache', async () => {
    // The budget warning is classified as a regex-timeout warning, so the
    // partial (zero-match) result must not be served to the next caller.
    // Runs against its own cache root: an entry left by an earlier run
    // would serve the first call complete results and pass this test
    // without ever exercising the interrupted path.
    const sandbox = mkdtempSync(join(tmpdir(), 'pdfvision-search-budget-cache-'));
    const previousCacheRoot = process.env.PDFVISION_CACHE_DIR;
    process.env.PDFVISION_CACHE_DIR = join(sandbox, 'cache');
    try {
      const first = await processDocument(SAMPLE_JA_PDF, {
        search: 'ページ|pdfvision|テスト',
        searchRegex: true,
        regexSearchBudgetMs: 0,
        noCache: false,
      });
      expect(first.pages.every((p) => p.matches?.length === 0)).toBe(true);

      const second = await processDocument(SAMPLE_JA_PDF, {
        search: 'ページ|pdfvision|テスト',
        searchRegex: true,
        noCache: false,
      });

      expect(second.pages.some((p) => (p.matches?.length ?? 0) > 0)).toBe(true);
    } finally {
      if (previousCacheRoot === undefined) delete process.env.PDFVISION_CACHE_DIR;
      else process.env.PDFVISION_CACHE_DIR = previousCacheRoot;
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
