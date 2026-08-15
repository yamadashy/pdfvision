#!/usr/bin/env node
// Verify the translated reference pages were made from the current English page.
//
// The English reference under docs/src/en/guide/ is generated from
// docs/cli-topics/*.md, so it moves whenever a topic does. The ja / zh-cn /
// zh-tw copies are translations, which cannot be regenerated — so each one
// records a `sourceHash` of the English page it was translated from, and this
// script fails when that hash no longer matches. Without it, a topic edit would
// silently leave three locales describing behaviour the tool no longer has.
//
// Run scripts/build-site-reference.mjs first: this compares against the English
// page content the topics currently produce, not against what is on disk.
import { join } from 'node:path';
import {
  TRANSLATED_LOCALES,
  TOPIC_PAGES,
  createFail,
  pageHash,
  readFrontmatterField,
  readTopics,
  renderEnglishPage,
  siteSrcDir,
} from './site-reference.mjs';

const fail = createFail('check-reference-translations');

const topics = readTopics(fail);
const missing = [];
const stale = [];

for (const topic of topics) {
  const page = TOPIC_PAGES[topic.name];
  const expected = pageHash(renderEnglishPage(topic, fail));
  for (const locale of TRANSLATED_LOCALES) {
    const relative = `docs/src/${locale}/guide/${page}`;
    const field = readFrontmatterField(join(siteSrcDir, locale, 'guide', page), 'sourceHash');
    if (field.missing) {
      missing.push(`${relative} (no such file; expected a translation of docs/src/en/guide/${page})`);
      continue;
    }
    if (!field.value) {
      stale.push(`${relative} has no sourceHash; expected ${expected}`);
      continue;
    }
    if (field.value !== expected) {
      stale.push(`${relative} was translated from ${field.value}; the English page is now ${expected}`);
    }
  }
}

if (missing.length > 0 || stale.length > 0) {
  console.error('check-reference-translations: translated reference pages are out of date.');
  for (const line of [...missing, ...stale]) console.error(`  - ${line}`);
  console.error(
    '\nRe-translate each listed page from its English counterpart under docs/src/en/guide/,',
    '\nthen set its `sourceHash` frontmatter to the value named above.',
    '\n`node scripts/build-site-reference.mjs --seed-locales` creates missing files as untranslated placeholders.',
  );
  process.exit(1);
}

console.log(`Translated reference pages are in sync (${topics.length} pages x ${TRANSLATED_LOCALES.length} locales).`);
