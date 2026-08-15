#!/usr/bin/env node
// Generate the English site reference pages from docs/cli-topics/*.md.
//
// The reference used to exist twice: once as a topic the CLI prints and once
// as a hand-written page on the website. Generating the page removes the copy
// that could go stale without anyone noticing. Narrative pages (the guide
// index, installation, usage, use cases, agent skill, prompt examples, FAQ)
// stay hand-written and localized — only the reference is generated.
//
// The outputs are committed and CI re-runs this script and diffs, the same
// arrangement scripts/build-cli-topics.mjs uses for the embedded topics.
//
// Translated locales are *not* rewritten here: their pages are translations
// with a `sourceHash` pinning the English page they were made from, and
// scripts/check-reference-translations.mjs is what catches a stale one. Pass
// `--seed-locales` to drop an untranslated placeholder in for a page that does
// not exist yet; existing files are never touched.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  TRANSLATED_LOCALES,
  TOPIC_PAGES,
  createFail,
  enGuideDir,
  pageHash,
  readTopics,
  renderEnglishPage,
  renderPlaceholderTranslation,
  siteSrcDir,
  writeIfChanged,
} from './site-reference.mjs';

const fail = createFail('build-site-reference');
const seedLocales = process.argv.includes('--seed-locales');

const topics = readTopics(fail);

let changed = 0;
let seeded = 0;
for (const topic of topics) {
  const page = TOPIC_PAGES[topic.name];
  const english = renderEnglishPage(topic, fail);
  if (writeIfChanged(join(enGuideDir, page), english)) changed += 1;

  if (!seedLocales) continue;
  const placeholder = renderPlaceholderTranslation(topic, english, fail);
  for (const locale of TRANSLATED_LOCALES) {
    const path = join(siteSrcDir, locale, 'guide', page);
    // Never overwrite: these files hold translations, and the only safe
    // automatic edit is creating one that does not exist yet.
    if (existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, placeholder);
    seeded += 1;
  }
}

if (process.argv.includes('--print-hashes')) {
  for (const topic of topics) {
    console.log(`${pageHash(renderEnglishPage(topic, fail))}  ${TOPIC_PAGES[topic.name]}`);
  }
}

const seededNote = seedLocales ? ` Seeded ${seeded} missing translation placeholder(s).` : '';
console.log(
  changed > 0
    ? `Generated ${changed} of ${topics.length} English reference pages from docs/cli-topics/.${seededNote}`
    : `English reference pages already up to date (${topics.length}).${seededNote}`,
);
