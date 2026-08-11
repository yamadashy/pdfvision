import { describe, expect, it } from 'vitest';
import { renderTopicIndex, resolveDocsCommand } from '../../src/cli/docsCommand.js';

const KNOWN = ['options', 'warnings', 'ocr'];

describe('resolveDocsCommand', () => {
  it('lists the topics on a bare `docs`', () => {
    expect(resolveDocsCommand(['docs'], KNOWN)).toEqual({ kind: 'index' });
  });

  it('prints a known topic', () => {
    expect(resolveDocsCommand(['docs', 'warnings'], KNOWN)).toEqual({ kind: 'topic', name: 'warnings' });
  });

  it.each([['-h'], ['--help']])('shows subcommand help for `docs %s`', (flag) => {
    expect(resolveDocsCommand(['docs', flag], KNOWN)).toEqual({ kind: 'help' });
  });

  it.each([['-v'], ['--version']])('honors the calling convention for `docs %s`', (flag) => {
    expect(resolveDocsCommand(['docs', flag], KNOWN)).toEqual({ kind: 'version' });
  });

  // Falling back to the index would read as "that topic is empty" rather
  // than "you typed it wrong", which is the more expensive mistake.
  it('fails on an unknown topic instead of falling back to the index', () => {
    const command = resolveDocsCommand(['docs', 'warning'], KNOWN);
    expect(command?.kind).toBe('error');
  });

  it.each([
    ['warning', 'warnings'],
    ['option', 'options'],
    ['ocrs', 'ocr'],
    ['optionss', 'options'],
  ])('suggests the closest topic for `%s`', (typo, expected) => {
    expect(resolveDocsCommand(['docs', typo], KNOWN)).toMatchObject({
      kind: 'error',
      message: expect.stringContaining(`"${expected}"`),
    });
  });

  it('does not invent a suggestion for something unrelated', () => {
    const command = resolveDocsCommand(['docs', 'kubernetes'], KNOWN);
    expect(command).toMatchObject({ kind: 'error' });
    expect(command).not.toMatchObject({ message: expect.stringContaining('Did you mean') });
  });

  it('rejects more than one topic rather than silently reading the first', () => {
    expect(resolveDocsCommand(['docs', 'options', 'warnings'], KNOWN)).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('"options" "warnings"'),
    });
  });

  it.each([[[]], [['doc.pdf']], [['--help']], [['./docs']], [['docs.pdf']], [['doc.pdf', 'docs']]])(
    'leaves %j to the extraction CLI',
    (argv) => {
      expect(resolveDocsCommand(argv, KNOWN)).toBeUndefined();
    },
  );
});

describe('renderTopicIndex', () => {
  it('names the installed version, since that is the point of asking the binary', () => {
    expect(renderTopicIndex('1.2.3')).toContain('1.2.3');
  });

  it('tells the reader how to open one', () => {
    expect(renderTopicIndex('1.2.3')).toContain('pdfvision docs <topic>');
  });
});

describe('terminal flags alongside a topic', () => {
  it.each([
    [['docs', 'options', '--help'], 'help'],
    [['docs', '--help', 'options'], 'help'],
    [['docs', 'options', '--version'], 'version'],
  ])('resolves %j as %s, since both are promised to work anywhere', (argv, kind) => {
    expect(resolveDocsCommand(argv, KNOWN)).toEqual({ kind });
  });

  it('still rejects an option that is not a terminal flag', () => {
    expect(resolveDocsCommand(['docs', 'options', '--json'], KNOWN)).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('"--json"'),
    });
  });

  it('does not suggest an alphabetically earlier topic that merely contains a short input', () => {
    const known = ['document-features', 'flags', 'mcp'];
    expect(resolveDocsCommand(['docs', 'flag'], known)).toMatchObject({
      message: expect.stringContaining('"flags"'),
    });
  });
});

describe('suggestion confidence', () => {
  const REAL = ['document-features', 'flags', 'formats', 'layout', 'library', 'mcp', 'ocr', 'options', 'search'];

  it('prefers an unambiguous prefix over a substring hit elsewhere', () => {
    // "la" is inside "flags" and starts "layout"; the prefix is the real intent.
    expect(resolveDocsCommand(['docs', 'la'], REAL)).toMatchObject({
      message: expect.stringContaining('"layout"'),
    });
  });

  it.each([['r'], ['a'], ['o']])('offers nothing for the ambiguous input `%s`', (input) => {
    expect(resolveDocsCommand(['docs', input], REAL)).not.toMatchObject({
      message: expect.stringContaining('Did you mean'),
    });
  });
});
