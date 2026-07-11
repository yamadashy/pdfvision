export interface TextRenderingOps {
  save: number;
  restore: number;
  formBegin: number;
  formEnd: number;
  setTextRenderingMode: number;
  textShowOps: ReadonlySet<number>;
}

export interface InvisibleTextEvidence {
  runCount: number;
  sampleText?: string;
}

const INVISIBLE_RENDERING_MODE = 3;
const MAX_SAMPLE_LENGTH = 160;

export function collectInvisibleTextEvidence(
  fnArray: readonly number[],
  argsArray: readonly unknown[][],
  ops: TextRenderingOps,
): InvisibleTextEvidence | undefined {
  let renderingMode = 0;
  const stack: number[] = [];
  const samples: string[] = [];
  let sampleLength = 0;
  let runCount = 0;

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    if (fn === ops.save || fn === ops.formBegin) {
      stack.push(renderingMode);
    } else if (fn === ops.restore || fn === ops.formEnd) {
      const restored = stack.pop();
      if (restored !== undefined) renderingMode = restored;
    } else if (fn === ops.setTextRenderingMode) {
      const mode = args?.[0];
      if (typeof mode === 'number' && Number.isFinite(mode)) renderingMode = mode;
    } else if (renderingMode === INVISIBLE_RENDERING_MODE && ops.textShowOps.has(fn)) {
      const text = operatorText(args).replace(/\s+/gu, ' ').trim();
      if (text.length === 0) continue;
      runCount++;
      if (sampleLength < MAX_SAMPLE_LENGTH) {
        const remaining = MAX_SAMPLE_LENGTH - sampleLength;
        samples.push(text.slice(0, remaining));
        sampleLength += Math.min(text.length, remaining);
      }
    }
  }

  if (runCount === 0) return undefined;
  const sampleText = samples.join(' ').trim();
  return {
    runCount,
    ...(sampleText.length > 0 && { sampleText }),
  };
}

function operatorText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(operatorText).join('');
  if (!value || typeof value !== 'object') return '';
  const unicode = (value as { unicode?: unknown }).unicode;
  return typeof unicode === 'string' ? unicode : '';
}
