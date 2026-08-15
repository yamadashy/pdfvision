import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOcrSession } from '../../src/core/ocr/index.js';

/**
 * tesseract.js delivers a failed traineddata fetch as a worker message,
 * not as a rejection of the promise the caller holds: `createWorker`'s
 * internal chain swallows the rejection, so the awaited promise never
 * settles, and without an `errorHandler` the library rethrows from its
 * message handler — an uncaught exception that kills the process
 * (issue #185). These tests drive that exact shape through a fake
 * tesseract module: no network, no traineddata, no real worker.
 */

interface FakeWorkerOptions {
  errorHandler?: (cause: unknown) => void;
  logger?: (arg: unknown) => void;
}

const createWorker = vi.fn();

vi.mock('tesseract.js', () => ({ createWorker: (...args: unknown[]) => createWorker(...args) }));

/** Never settles — mirrors the promise tesseract leaves the caller with. */
function pending<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

let unhandled: unknown[];
let onUnhandled: (reason: unknown) => void;

beforeEach(() => {
  createWorker.mockReset();
  unhandled = [];
  onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
});

afterEach(() => {
  process.off('unhandledRejection', onUnhandled);
});

/** Give any stray rejection a turn to be reported before asserting. */
async function settleMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
  global.gc?.();
}

describe('createOcrSession worker failures', () => {
  it('rejects with an actionable error when language data cannot be fetched', async () => {
    createWorker.mockImplementation((_langs: string[], _oem: unknown, options: FakeWorkerOptions) => {
      setTimeout(() => {
        options.errorHandler?.(
          'Error: Network error while fetching https://cdn.jsdelivr.net/npm/@tesseract.js-data/xyz/4.0.0_best_int/xyz.traineddata.gz. Response code: 404',
        );
      }, 0);
      return pending();
    });

    await expect(createOcrSession('xyz')).rejects.toThrow(/OCR language data for "xyz" could not be downloaded/);
    await expect(createOcrSession('xyz')).rejects.toThrow(/not a language tesseract publishes/);
    await settleMicrotasks();
    expect(unhandled).toEqual([]);
  });

  it('passes an errorHandler so tesseract never rethrows from its message handler', async () => {
    createWorker.mockImplementation((_langs: string[], _oem: unknown, options: FakeWorkerOptions) => {
      setTimeout(() => options.errorHandler?.('Network error while fetching eng.traineddata'), 0);
      return pending();
    });

    await expect(createOcrSession('eng')).rejects.toThrow(/could not be downloaded/);
    expect(createWorker).toHaveBeenCalledWith(['eng'], undefined, expect.any(Object));
    const options = createWorker.mock.calls[0][2] as FakeWorkerOptions;
    expect(options.errorHandler).toBeTypeOf('function');
  });

  it('names every requested language and points at the network for a non-404 failure', async () => {
    createWorker.mockImplementation((_langs: string[], _oem: unknown, options: FakeWorkerOptions) => {
      setTimeout(() => options.errorHandler?.('Error: getaddrinfo ENOTFOUND cdn.jsdelivr.net'), 0);
      return pending();
    });

    await expect(createOcrSession('eng+jpn')).rejects.toThrow(/OCR language data for "eng\+jpn"/);
    await expect(createOcrSession('eng+jpn')).rejects.toThrow(/Check network access to the traineddata CDN/);
  });

  it('does not mislabel a non-fetch worker failure as a download problem', async () => {
    createWorker.mockImplementation((_langs: string[], _oem: unknown, options: FakeWorkerOptions) => {
      setTimeout(() => options.errorHandler?.('Cannot find module wasm core'), 0);
      return pending();
    });

    await expect(createOcrSession('eng')).rejects.toThrow(/OCR worker for language "eng" failed: Cannot find module/);
  });

  it('fails the in-flight recognize when the worker dies after boot', async () => {
    // The late-failure window: createWorker already resolved, so nothing
    // is awaiting the boot promise when the worker reports its failure.
    let fireFailure: (() => void) | undefined;
    createWorker.mockImplementation(async (_langs: string[], _oem: unknown, options: FakeWorkerOptions) => {
      fireFailure = () => options.errorHandler?.('Network error while fetching eng.traineddata. Response code: 500');
      return {
        recognize: () => pending(),
        terminate: async () => {},
      };
    });

    const session = await createOcrSession('eng');
    const recognizing = session.recognize(Buffer.alloc(0), {
      scale: 1,
      pageView: [0, 0, 100, 100],
      // biome-ignore lint/suspicious/noExplicitAny: the transform's viewport is unused on this path
      viewport: { width: 100, height: 100 } as any,
    });
    fireFailure?.();

    await expect(recognizing).rejects.toThrow(/OCR language data for "eng" could not be downloaded/);
    await settleMicrotasks();
    expect(unhandled).toEqual([]);
  });

  it('fails later pages with the recorded error instead of hanging', async () => {
    let fireFailure: (() => void) | undefined;
    createWorker.mockImplementation(async (_langs: string[], _oem: unknown, options: FakeWorkerOptions) => {
      fireFailure = () => options.errorHandler?.('Network error while fetching eng.traineddata');
      return { recognize: () => pending(), terminate: async () => {} };
    });

    const session = await createOcrSession('eng');
    fireFailure?.();
    await settleMicrotasks();

    await expect(
      session.recognize(Buffer.alloc(0), {
        scale: 1,
        pageView: [0, 0, 100, 100],
        // biome-ignore lint/suspicious/noExplicitAny: the transform's viewport is unused on this path
        viewport: { width: 100, height: 100 } as any,
      }),
    ).rejects.toThrow(/could not be downloaded/);
    // A failure with no call in flight must not become an unhandled
    // rejection — that is the same process-level crash by another route.
    expect(unhandled).toEqual([]);
  });

  it('normalises a bare string job rejection into an Error', async () => {
    createWorker.mockImplementation(async () => ({
      recognize: () => Promise.reject('tesseract said no'),
      terminate: async () => {},
    }));

    const session = await createOcrSession('eng');

    await expect(
      session.recognize(Buffer.alloc(0), {
        scale: 1,
        pageView: [0, 0, 100, 100],
        // biome-ignore lint/suspicious/noExplicitAny: the transform's viewport is unused on this path
        viewport: { width: 100, height: 100 } as any,
      }),
    ).rejects.toThrow(/tesseract said no/);
  });
});
