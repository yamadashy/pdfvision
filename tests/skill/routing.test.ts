import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLI_TOPIC_INDEX } from '../../src/cli/docs/topicIndex.generated.js';

/**
 * The skill stopped carrying its own `references/*.md` and now routes to
 * `pdfvision docs <topic>`. That trades one failure mode for another: a topic
 * renamed or split leaves the skill pointing at nothing, and an agent that
 * runs the command gets an error instead of the detail it was sent for.
 *
 * Nothing else checks the skill — it ships from GitHub, not npm, and no build
 * step reads it. These two assertions are the whole machine-checkable surface.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL = readFileSync(join(repoRoot, 'skills/pdfvision/SKILL.md'), 'utf8');

const KNOWN = new Set(CLI_TOPIC_INDEX.map((topic) => topic.name));

/**
 * Two shapes carry a topic name: prose (`pdfvision docs flags`) and the gate
 * table's first column, where the name stands alone in backticks. Collecting
 * only the prose form would miss the table, which is where the routing that
 * matters actually lives.
 */
function referencedTopics(): string[] {
  const found = new Set<string>();
  for (const [, name] of SKILL.matchAll(/pdfvision docs ([a-z][a-z0-9-]*)/g)) found.add(name);
  const gateTable = /^\| `([a-z][a-z0-9-]*)` \| \*\*(?:Mandatory|Escalation)\*\*/gm;
  for (const [, name] of SKILL.matchAll(gateTable)) found.add(name);
  return [...found].sort();
}

describe('the skill routes to topics that exist', () => {
  it('names at least the gate table and the inline pointers', () => {
    // A regex that silently matched nothing would make the next test vacuous.
    expect(referencedTopics().length).toBeGreaterThanOrEqual(7);
  });

  it.each(referencedTopics())('resolves "pdfvision docs %s"', (name) => {
    expect({ topic: name, known: KNOWN.has(name) }).toEqual({ topic: name, known: true });
  });

  it('no longer points at the reference files it used to ship', () => {
    expect(SKILL).not.toContain('references/');
  });
});
