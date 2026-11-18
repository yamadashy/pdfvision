import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { run } from '../../src/cli/cli.js';
import { CLI_TOPIC_BODIES, CLI_WARNING_ENTRIES } from '../../src/cli/docs/topicBodies.generated.js';
import { CLI_TOPIC_INDEX, CLI_WARNING_CODES } from '../../src/cli/docs/topicIndex.generated.js';
import { CLI_PARSE_OPTIONS } from '../../src/cli/optionSpec.js';

/**
 * `--help` reached 20 KB — roughly 5k tokens on every agent's first contact —
 * one careful paragraph at a time, and no reviewer ever saw the moment it
 * became too big. These caps are the backstop: raising one is a decision
 * someone has to make on purpose, in a diff.
 */
const HELP_BYTE_CAP = 6 * 1024;
const USAGE_ERROR_BYTE_CAP = 6 * 1024;

/**
 * Options a first pass is chosen from. A blanket "every option is documented
 * somewhere" check would pass with all of them moved into a topic, which is
 * how a short help becomes a useless one.
 */
const MUST_STAY_IN_SHORT_HELP = [
  '--pages',
  '--format',
  '--render',
  '--render-region',
  '--map',
  '--search',
  '--matches-only',
  '--ocr',
  '--layout',
  '--visual-regions',
  '--remote',
  '--password',
  '--no-cache',
];

const SUBCOMMANDS = ['docs', 'clear-cache', 'mcp'];

/**
 * A literal, not a derived one. Anything derived would come from the same
 * generator as the index and the bodies, so deleting a topic would shrink the
 * expectation alongside the actual set and every check would still pass.
 * Written out, a deletion has to be made here too, in the diff.
 */
const EXPECTED_TOPICS = [
  'document-features',
  'flags',
  'formats',
  'interactive',
  'layout',
  'library',
  'mcp',
  'ocr',
  'options',
  'schema',
  'search',
  'security',
  'visual',
  'warnings',
];

/** `--render` is a prefix of `--render-output`; match the whole token. */
function documentsOption(text: string, option: string): boolean {
  const escaped = option.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\w-])${escaped}(?![\\w-])`, 'm').test(text);
}

async function capture(argv: string[]): Promise<{ stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map((a) => String(a)).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderr.push(args.map((a) => String(a)).join(' '));
  });
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('__cli_exit__');
  }) as never);

  try {
    await run(argv);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== '__cli_exit__') throw error;
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  }
  return { stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

describe('--help stays one screen', () => {
  it('fits the byte cap', async () => {
    const { stdout } = await capture(['--help']);
    expect(Buffer.byteLength(stdout, 'utf8')).toBeLessThanOrEqual(HELP_BYTE_CAP);
  });

  it('keeps the no-input usage error within the same cap', async () => {
    const { stderr } = await capture([]);
    expect(Buffer.byteLength(stderr, 'utf8')).toBeLessThanOrEqual(USAGE_ERROR_BYTE_CAP);
  });

  it.each(MUST_STAY_IN_SHORT_HELP)(
    'still names %s itself, not just a longer flag that starts with it',
    async (flag) => {
      const { stdout } = await capture(['--help']);
      expect(documentsOption(stdout, flag)).toBe(true);
    },
  );

  it.each(SUBCOMMANDS)('still names the %s subcommand', async (subcommand) => {
    const { stdout } = await capture(['--help']);
    expect(stdout).toContain(subcommand);
  });

  it('lists every documentation topic so the index is reachable without a second guess', async () => {
    const { stdout } = await capture(['--help']);
    for (const topic of CLI_TOPIC_INDEX) {
      expect(stdout).toContain(topic.name);
    }
  });

  it('points at the topic that holds what it no longer prints', async () => {
    const { stdout } = await capture(['--help']);
    expect(stdout).toContain('pdfvision docs options');
  });
});

describe('every option is documented somewhere reachable', () => {
  it.each(Object.keys(CLI_PARSE_OPTIONS))('documents --%s', async (option) => {
    const { stdout } = await capture(['--help']);
    const documented =
      documentsOption(stdout, `--${option}`) || documentsOption(CLI_TOPIC_BODIES.options, `--${option}`);
    expect(documented).toBe(true);
  });

  it.each(SUBCOMMANDS)('documents the %s subcommand in the options topic too', (subcommand) => {
    expect(CLI_TOPIC_BODIES.options).toContain(subcommand);
  });
});

describe('topics', () => {
  it('ships exactly the topics it is supposed to', () => {
    expect(CLI_TOPIC_INDEX.map((topic) => topic.name).sort()).toEqual(EXPECTED_TOPICS);
  });

  it('has a body for every indexed topic and no orphan bodies', () => {
    expect(Object.keys(CLI_TOPIC_BODIES).sort()).toEqual(CLI_TOPIC_INDEX.map((topic) => topic.name).sort());
  });

  it.each(CLI_TOPIC_INDEX.map((topic) => topic.name))('strips the frontmatter from %s', (name) => {
    expect(CLI_TOPIC_BODIES[name].startsWith('---')).toBe(false);
    expect(CLI_TOPIC_BODIES[name]).not.toContain('\ndescription:');
  });

  it.each(CLI_TOPIC_INDEX)('describes $name well enough to choose it', ({ description }) => {
    expect(description.length).toBeGreaterThan(40);
  });

  it('leaves no reference to the skill layout an installed CLI does not ship', () => {
    for (const body of Object.values(CLI_TOPIC_BODIES)) {
      expect(body).not.toContain('references/');
    }
  });
});

/**
 * A generous ceiling, not a target: it exists so a topic cannot quietly
 * become a second 20 KB help. `warnings` once reached ~53 KB because it
 * carried the shape and the full catalog of every code, so an agent holding
 * one code paid ~12k tokens to look it up. The catalog now lives in one entry
 * per code (`pdfvision docs warnings <code>`) and the topic keeps only the
 * shape, the code index, and the raw signals. The largest remaining topics
 * sit around 23 KB; when one needs more, split it the same way rather than
 * raising this.
 */
const TOPIC_BYTE_CEILING = 28 * 1024;

/**
 * One warning entry is what an agent pays for a single code, so it gets its
 * own, much smaller ceiling. The largest entries (`text_under_opaque_fill`,
 * `xfa_form`) are ~4 KB because their limits are the contract; an entry that
 * outgrows this is carrying material that belongs to more than one code.
 */
const WARNING_ENTRY_BYTE_CEILING = 6 * 1024;

/**
 * Read from the type rather than from the generator, so a code added to the
 * union without an entry — or an entry left behind for a removed code — fails
 * here instead of shipping documentation for the wrong set.
 */
function pageWarningCodes(): string[] {
  const source = readFileSync(new URL('../../src/types/warnings.ts', import.meta.url), 'utf8');
  const union = /interface PageWarning \{[\s\S]*?\n {2}code:([\s\S]*?);/.exec(source)?.[1] ?? '';
  return [...union.matchAll(/'([a-z0-9_]+)'/g)].map((match) => match[1]).sort();
}

describe('warning entries', () => {
  it('reads a non-trivial code union from the type', () => {
    expect(pageWarningCodes().length).toBeGreaterThan(30);
  });

  it('has exactly one entry per PageWarning code', () => {
    expect([...CLI_WARNING_CODES].sort()).toEqual(pageWarningCodes());
    expect(Object.keys(CLI_WARNING_ENTRIES).sort()).toEqual(pageWarningCodes());
  });

  it('indexes every code in the warnings topic', () => {
    expect(CLI_TOPIC_BODIES.warnings).not.toContain('<!-- warning-index -->');
    for (const code of CLI_WARNING_CODES) {
      expect(CLI_TOPIC_BODIES.warnings).toContain(`- \`${code}\` [`);
    }
  });

  it.each(CLI_WARNING_CODES)('keeps the %s entry under its ceiling', (code) => {
    expect(Buffer.byteLength(CLI_WARNING_ENTRIES[code], 'utf8')).toBeLessThanOrEqual(WARNING_ENTRY_BYTE_CEILING);
  });

  it('prints one entry, not the topic, for `docs warnings <code>`', async () => {
    const { stdout } = await capture(['docs', 'warnings', 'text_overlap']);
    expect(stdout).toBe(CLI_WARNING_ENTRIES.text_overlap);
    expect(stdout).toContain('# Warning `text_overlap`');
    expect(stdout).not.toContain('## Code index');
  });

  it('prints several entries in the order asked', async () => {
    const { stdout } = await capture(['docs', 'warnings', 'off_page', 'text_overlap']);
    expect(stdout.indexOf('`off_page`')).toBeLessThan(stdout.indexOf('`text_overlap`'));
    expect(stdout).toContain(CLI_WARNING_ENTRIES.off_page);
    expect(stdout).toContain(CLI_WARNING_ENTRIES.text_overlap);
  });

  it('exits 1 on an unknown code and names the close matches', async () => {
    const { stdout, stderr } = await capture(['docs', 'warnings', 'text_overlapp']);
    expect(stdout).toBe('');
    expect(stderr).toContain('Unknown warning code "text_overlapp"');
    expect(stderr).toContain('"text_overlap"');
  });
});

function prefixKeys(record: Record<string, string>, prefix: string): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [`${prefix}${key}`, value]));
}

describe('no topic grows into a second oversized help', () => {
  it.each(CLI_TOPIC_INDEX.map((topic) => topic.name))('keeps %s under the ceiling', (name) => {
    expect(Buffer.byteLength(CLI_TOPIC_BODIES[name], 'utf8')).toBeLessThanOrEqual(TOPIC_BYTE_CEILING);
  });

  it('resolves every cross-reference to a topic or warning code that exists', () => {
    const names = new Set(CLI_TOPIC_INDEX.map((topic) => topic.name));
    const codes = new Set(CLI_WARNING_CODES);
    const documents = { ...CLI_TOPIC_BODIES, ...prefixKeys(CLI_WARNING_ENTRIES, 'warnings/') };
    for (const [name, body] of Object.entries(documents)) {
      for (const [, target] of body.matchAll(/pdfvision docs ([a-z][a-z0-9-]*)/g)) {
        expect({ topic: name, target, known: names.has(target) }).toEqual({ topic: name, target, known: true });
      }
      for (const [, code] of body.matchAll(/pdfvision docs warnings ([a-z][a-z0-9_]*)/g)) {
        expect({ topic: name, code, known: codes.has(code) }).toEqual({ topic: name, code, known: true });
      }
    }
  });
});
