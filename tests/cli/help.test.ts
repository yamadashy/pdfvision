import { describe, expect, it, vi } from 'vitest';
import { run } from '../../src/cli/cli.js';
import { CLI_TOPIC_BODIES } from '../../src/cli/docs/topicBodies.generated.js';
import { CLI_TOPIC_INDEX } from '../../src/cli/docs/topicIndex.generated.js';
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
 * Pinned rather than derived: the index and the bodies come from the same
 * generator, so deleting a topic and regenerating would shrink the expected
 * set alongside the actual one and every check would still pass.
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
 * become a second 20 KB help. `warnings` is the current outlier at ~36 KB
 * because it carries both the shape and the catalog of every code.
 */
const TOPIC_BYTE_CEILING = 48 * 1024;

describe('no topic grows into a second oversized help', () => {
  it.each(CLI_TOPIC_INDEX.map((topic) => topic.name))('keeps %s under the ceiling', (name) => {
    expect(Buffer.byteLength(CLI_TOPIC_BODIES[name], 'utf8')).toBeLessThanOrEqual(TOPIC_BYTE_CEILING);
  });

  it('resolves every cross-reference to a topic that exists', () => {
    const names = new Set(CLI_TOPIC_INDEX.map((topic) => topic.name));
    for (const [name, body] of Object.entries(CLI_TOPIC_BODIES)) {
      for (const [, target] of body.matchAll(/pdfvision docs ([a-z][a-z0-9-]*)/g)) {
        expect({ topic: name, target, known: names.has(target) }).toEqual({ topic: name, target, known: true });
      }
    }
  });
});
