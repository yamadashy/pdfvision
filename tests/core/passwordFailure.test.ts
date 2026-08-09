import { describe, expect, it } from 'vitest';
import { formatCliErrorMessage } from '../../src/cli/errors.js';
import { classifyPasswordFailure } from '../../src/core/errors/passwordFailure.js';
import { formatMcpErrorMessage } from '../../src/mcp/errors.js';

function pdfjsError(message: string, code?: number): Error {
  const error = new Error(message);
  error.name = 'PasswordException';
  if (code !== undefined) Object.assign(error, { code });
  return error;
}

describe('classifyPasswordFailure', () => {
  it('classifies a missing password from the pdf.js code', () => {
    expect(classifyPasswordFailure(pdfjsError('No password given', 1))).toBe('missing');
  });

  it('classifies a wrong password from the pdf.js code', () => {
    expect(classifyPasswordFailure(pdfjsError('Incorrect Password', 2))).toBe('incorrect');
  });

  it('falls back to the message when the code is lost in rewrapping', () => {
    expect(classifyPasswordFailure(new Error('No password given'))).toBe('missing');
    expect(classifyPasswordFailure(new Error('Incorrect Password'))).toBe('incorrect');
  });

  it('leaves unrelated failures alone, including ones that merely mention passwords', () => {
    expect(classifyPasswordFailure(new Error('Invalid Root reference.'))).toBeUndefined();
    expect(classifyPasswordFailure(new Error('--password-stdin received no input'))).toBeUndefined();
    expect(classifyPasswordFailure('not an error at all')).toBeUndefined();
  });
});

describe('surface-specific password remedies', () => {
  it('names flags on the CLI', () => {
    expect(formatCliErrorMessage(pdfjsError('No password given', 1))).toContain('--password');
    expect(formatCliErrorMessage(pdfjsError('Incorrect Password', 2))).toContain('--password');
  });

  it('names the parameter over MCP, never a flag a shell-less caller cannot run', () => {
    const missing = formatMcpErrorMessage(pdfjsError('No password given', 1));
    expect(missing).toContain('password: "…"');
    expect(missing).not.toContain('--password');

    const incorrect = formatMcpErrorMessage(pdfjsError('Incorrect Password', 2));
    expect(incorrect).toContain('`password`');
    expect(incorrect).not.toContain('--password');
  });

  it('distinguishes a missing password from a wrong one, since the recovery differs', () => {
    expect(formatMcpErrorMessage(pdfjsError('No password given', 1))).not.toEqual(
      formatMcpErrorMessage(pdfjsError('Incorrect Password', 2)),
    );
  });

  it('passes other messages through unchanged on both surfaces', () => {
    const other = new Error('Invalid Root reference.');
    expect(formatCliErrorMessage(other)).toBe('Invalid Root reference.');
    expect(formatMcpErrorMessage(other)).toBe('Invalid Root reference.');
  });
});
