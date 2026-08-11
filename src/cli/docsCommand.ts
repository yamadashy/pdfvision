import { CLI_TOPIC_INDEX } from './docs/topicIndex.generated.js';
import { resolveTerminalFlags } from './subcommandFlags.js';

/**
 * Dispatch for the `pdfvision docs` subcommand — the built-in documentation
 * for the installed version.
 *
 * Only the index is reachable from here; topic bodies are loaded by the
 * caller through a dynamic import, so a normal extraction never parses
 * them. Resolved before `parseArgs` for the same reason as `mcp` and
 * `clear-cache`: reading documentation is not an option on reading a PDF.
 */
export type DocsCommand =
  | { kind: 'index' }
  | { kind: 'topic'; name: string }
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'error'; message: string };

export const DOCS_SUBCOMMAND = 'docs';

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * A wrong topic name has to fail loudly: an agent that mistypes and gets the
 * index back reads it as "this topic is empty" rather than "look again".
 */
function suggest(name: string, known: readonly string[]): string | undefined {
  const contains = known.find((topic) => topic.includes(name) || name.includes(topic));
  if (contains) return contains;

  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const topic of known) {
    const distance = editDistance(name, topic);
    if (distance < bestDistance) {
      best = topic;
      bestDistance = distance;
    }
  }
  return bestDistance <= Math.max(2, Math.floor(name.length / 3)) ? best : undefined;
}

/**
 * Returns `undefined` when this is not a `docs` invocation, leaving the
 * arguments to the normal extraction CLI. A file named `docs` therefore has
 * to be passed as `./docs`, the same as `mcp` and `clear-cache`.
 */
export function resolveDocsCommand(
  argv: readonly string[],
  known: readonly string[] = CLI_TOPIC_INDEX.map((topic) => topic.name),
): DocsCommand | undefined {
  if (argv[0] !== DOCS_SUBCOMMAND) return undefined;

  const rest = argv.slice(1);
  if (rest.length === 0) return { kind: 'index' };

  const terminal = resolveTerminalFlags(rest);
  if (terminal) return { kind: terminal };

  if (rest.length > 1) {
    return {
      kind: 'error',
      message: `"pdfvision docs" takes at most one topic, got ${rest.map((arg) => `"${arg}"`).join(' ')}`,
    };
  }

  const name = rest[0];
  if (known.includes(name)) return { kind: 'topic', name };

  const closest = suggest(name, known);
  return {
    kind: 'error',
    message: `Unknown topic "${name}".${closest ? ` Did you mean "${closest}"?` : ''}`,
  };
}

export function renderTopicIndex(version: string): string {
  const width = Math.max(...CLI_TOPIC_INDEX.map((topic) => topic.name.length));
  const rows = CLI_TOPIC_INDEX.map((topic) => `  ${topic.name.padEnd(width)}  ${topic.description}`).join('\n');
  return `pdfvision docs - documentation for pdfvision ${version}, as installed

${rows}

Run "pdfvision docs <topic>" to read one.`;
}
