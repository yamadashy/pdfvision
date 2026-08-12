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
 * Three shapes carry a topic name, and a collector that misses one is worse
 * than no collector: it reports green over the routes it never looked at.
 * Prose (`pdfvision docs flags`), the gate table's first column, and the
 * closing paragraph that names the remaining topics as bare code spans.
 */
function referencedTopics(): string[] {
  const found = new Set<string>();
  for (const [, name] of SKILL.matchAll(/pdfvision docs ([a-z][a-z0-9-]*)/g)) found.add(name);
  for (const [, name] of SKILL.matchAll(/^\| `([a-z][a-z0-9-]*)` \| \*\*(?:Mandatory|Escalation)\*\*/gm)) {
    found.add(name);
  }
  // Bare code spans in the closing routing paragraph, collected by shape.
  // Filtering them through the known set here would be self-defeating: a
  // deleted topic would drop out of the evidence at the same moment it drops
  // out of the index, and the comparison below would shrink on both sides
  // and stay green over a route that no longer resolves. Every code span in
  // that paragraph is a topic name, and has to stay one.
  const closing = /^`[a-z][a-z0-9-]*`.*Reach for one by name.*$/m.exec(SKILL)?.[0] ?? '';
  for (const [, name] of closing.matchAll(/`([a-z][a-z0-9-]*)`/g)) found.add(name);
  return [...found].sort();
}

describe('the skill routes to topics that exist', () => {
  /**
   * Every topic is routed today. Pinning that catches a new topic nobody
   * told the skill about, a deleted one the skill still names, and a
   * collector that quietly stopped matching a paragraph it used to read —
   * all three show up as the two sides disagreeing. A topic deliberately
   * left unrouted should be excluded here, in the diff that decides it.
   */
  it('routes to every topic the CLI ships', () => {
    expect(referencedTopics()).toEqual(CLI_TOPIC_INDEX.map((topic) => topic.name).sort());
  });

  it.each(referencedTopics())('resolves "pdfvision docs %s"', (name) => {
    expect({ topic: name, known: KNOWN.has(name) }).toEqual({ topic: name, known: true });
  });

  it('no longer points at the reference files it used to ship', () => {
    expect(SKILL).not.toContain('references/');
  });
});
