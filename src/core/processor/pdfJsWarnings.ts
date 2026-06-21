export function capturePdfJsWarnings(out: string[]): () => void {
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const msg = args.map(String).join(' ');
    if (msg.startsWith('Warning:')) out.push(msg);
    originalWarn(...args);
  };
  return () => {
    console.warn = originalWarn;
  };
}
