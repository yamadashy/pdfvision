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

describe('warning code lookup', () => {
  const CODES = ['text_overlap', 'off_page', 'large_raster_low_text_overlap', 'xfa_form', 'xfa_fields_only'];
  const resolve = (argv: string[]) => resolveDocsCommand(argv, KNOWN, CODES);

  it('prints one entry for `docs warnings <code>`', () => {
    expect(resolve(['docs', 'warnings', 'off_page'])).toEqual({ kind: 'warnings', codes: ['off_page'] });
  });

  it('keeps the request order and drops repeats for several codes', () => {
    expect(resolve(['docs', 'warnings', 'xfa_form', 'off_page', 'xfa_form'])).toEqual({
      kind: 'warnings',
      codes: ['xfa_form', 'off_page'],
    });
  });

  it('still prints the whole topic for a bare `docs warnings`', () => {
    expect(resolve(['docs', 'warnings'])).toEqual({ kind: 'topic', name: 'warnings' });
  });

  it.each([[['docs', 'warning', 'off_page']], [['docs', 'off_page']], [['docs', 'warnings', 'OFF-PAGE']]])(
    'forgives the natural slip %j',
    (argv) => {
      expect(resolve(argv)).toEqual({ kind: 'warnings', codes: ['off_page'] });
    },
  );

  it('fails on an unknown code instead of printing a partial answer', () => {
    expect(resolve(['docs', 'warnings', 'off_page', 'offpage'])).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('Unknown warning code "offpage"'),
    });
  });

  it('lists every plausible code for a shared word', () => {
    const command = resolve(['docs', 'warnings', 'overlap']);
    expect(command).toMatchObject({ kind: 'error' });
    expect(command).toMatchObject({ message: expect.stringContaining('"text_overlap"') });
    expect(command).toMatchObject({ message: expect.stringContaining('"large_raster_low_text_overlap"') });
  });

  it('suggests a code within a typo of the input', () => {
    expect(resolve(['docs', 'warnings', 'xfa_fom'])).toMatchObject({
      message: expect.stringContaining('"xfa_form"'),
    });
  });

  it('points back at the index when nothing is close', () => {
    const command = resolve(['docs', 'warnings', 'kubernetes']);
    expect(command).toMatchObject({ kind: 'error', message: expect.stringContaining('pdfvision docs warnings') });
    expect(command).not.toMatchObject({ message: expect.stringContaining('Close matches') });
  });

  it('does not let a bare code shadow a topic of the same name', () => {
    expect(resolveDocsCommand(['docs', 'ocr'], KNOWN, ['ocr'])).toEqual({ kind: 'topic', name: 'ocr' });
  });
});

describe('renderTopicIndex warning hint', () => {
  it('tells the reader how to look up one warning code', () => {
    expect(renderTopicIndex('1.2.3')).toContain('pdfvision docs warnings <code>');
  });
});
