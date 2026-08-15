// Shared plumbing for the generated site reference pages.
//
// `docs/cli-topics/*.md` is the single source of truth for reference content:
// the CLI embeds it (see scripts/build-cli-topics.mjs) and the website's
// English reference pages are generated from it. Keeping one copy is the whole
// point — a topic and a site page that disagree used to be a silent bug.
//
// Two scripts import this: build-site-reference.mjs writes the English pages,
// check-reference-translations.mjs verifies the translated copies were made
// against the current English page.
//
// Kept build-free, like the other scripts here, so it runs on every Node in
// the support matrix without TypeScript type-stripping.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const topicsDir = resolve(repoRoot, 'docs/cli-topics');
export const siteSrcDir = resolve(repoRoot, 'docs/src');
export const enGuideDir = resolve(siteSrcDir, 'en/guide');

/**
 * Topic name to page filename. Seven of these keep a URL the site already
 * published; the rest are new pages named after their topic. Adding a topic
 * without adding it here is a hard error, because the alternative is a topic
 * that silently never reaches the website.
 */
export const TOPIC_PAGES = {
  options: 'command-line-options.md',
  flags: 'flags.md',
  formats: 'output.md',
  schema: 'structured-output.md',
  layout: 'layout.md',
  warnings: 'warnings.md',
  visual: 'visual.md',
  ocr: 'ocr.md',
  search: 'search-and-region-zoom.md',
  interactive: 'interactive.md',
  'document-features': 'document-features.md',
  mcp: 'mcp-server.md',
  library: 'library-api.md',
  security: 'security-and-privacy.md',
};

/** Locales whose reference pages are translations of the generated English ones. */
export const TRANSLATED_LOCALES = ['ja', 'zh-cn', 'zh-tw'];

export function createFail(scriptName) {
  return (message) => {
    console.error(`${scriptName}: ${message}`);
    process.exit(1);
  };
}

/**
 * Same deliberately non-YAML parser as build-cli-topics.mjs: the frontmatter is
 * a handful of single-line string fields, and accepting more would let a topic
 * carry structure neither the CLI nor the site knows how to render.
 */
function parseTopic(file, fail) {
  const raw = readFileSync(join(topicsDir, file), 'utf8').replace(/\r\n?/g, '\n');
  if (!raw.startsWith('---\n')) fail(`${file} does not start with YAML frontmatter`);
  const end = raw.indexOf('\n---\n', 3);
  if (end === -1) fail(`${file} has an unterminated frontmatter block`);

  const fields = {};
  for (const line of raw.slice(4, end + 1).split('\n')) {
    if (line.trim() === '') continue;
    const match = /^([a-z]+):\s*(.*)$/.exec(line);
    if (!match) fail(`${file} has a frontmatter line this script cannot read: ${line}`);
    const [, key, value] = match;
    fields[key] = value.replace(/^["'](.*)["']$/, '$1').trim();
  }

  const name = file.replace(/\.md$/, '');
  if (fields.name !== name) fail(`${file} declares name "${fields.name ?? ''}"; it must match the filename`);
  if (!fields.description) fail(`${file} has no description`);
  if (!fields.title) fail(`${file} has no title; the site page needs a human-readable heading`);

  return { name, title: fields.title, description: fields.description, body: raw.slice(end + 5).trim() };
}

export function readTopics(fail) {
  const files = readdirSync(topicsDir)
    .filter((file) => file.endsWith('.md'))
    .sort();
  if (files.length === 0) fail(`no topics found in ${topicsDir}`);

  const topics = files.map((file) => parseTopic(file, fail));
  for (const topic of topics) {
    if (!TOPIC_PAGES[topic.name]) {
      fail(`topic "${topic.name}" has no page in TOPIC_PAGES (scripts/site-reference.mjs)`);
    }
  }
  for (const name of Object.keys(TOPIC_PAGES)) {
    if (!topics.some((topic) => topic.name === name)) {
      fail(`TOPIC_PAGES maps "${name}", but docs/cli-topics/${name}.md does not exist`);
    }
  }
  return topics;
}

/**
 * Topics cross-reference each other as `pdfvision docs <name>`, which a reader
 * in a terminal can act on directly. On the website the same phrase becomes a
 * link to the page that topic generated. Code fences are left alone: a link
 * inside one renders as literal brackets, and the phrase there is a command to
 * type rather than a reference to follow.
 */
function linkTopicMentions(body, selfName, fail) {
  let inFence = false;
  return body
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(/`pdfvision docs ([a-z][a-z0-9-]*)`/g, (whole, target, offset) => {
        if (target === selfName) return whole;
        if (line[offset - 1] === '[') return whole;
        const page = TOPIC_PAGES[target];
        if (!page) fail(`${selfName}.md references unknown topic "${target}"`);
        return `[${whole}](./${page})`;
      });
    })
    .join('\n');
}

/** Double-quoted YAML is a superset of JSON strings for the values we emit. */
const yamlString = (value) => JSON.stringify(value);

export function renderEnglishPage(topic, fail) {
  return `---
title: ${yamlString(topic.title)}
description: ${yamlString(topic.description)}
---

<!-- Generated from docs/cli-topics/${topic.name}.md. Do not edit this file; edit the topic and re-run \`node scripts/build-site-reference.mjs\`. -->

${linkTopicMentions(topic.body, topic.name, fail)}
`;
}

export const pageHash = (content) => createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 12);

export function renderPlaceholderTranslation(topic, englishPage, fail) {
  const page = TOPIC_PAGES[topic.name];
  return `---
title: ${yamlString(topic.title)}
description: ${yamlString(topic.description)}
sourceHash: ${pageHash(englishPage)}
---

<!-- Translated from docs/src/en/guide/${page}, which is generated from docs/cli-topics/${topic.name}.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     \`sourceHash\` to the value reported by \`node scripts/build-site-reference.mjs\`. -->

${linkTopicMentions(topic.body, topic.name, fail)}
`;
}

export function writeIfChanged(path, content) {
  let previous = '';
  try {
    previous = readFileSync(path, 'utf8');
  } catch {
    mkdirSync(dirname(path), { recursive: true });
  }
  if (previous === content) return false;
  writeFileSync(path, content);
  return true;
}

/** Reads a single-line frontmatter field out of a site page. */
export function readFrontmatterField(path, field) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
  } catch {
    return { missing: true };
  }
  if (!raw.startsWith('---\n')) return { value: undefined };
  const end = raw.indexOf('\n---\n', 3);
  if (end === -1) return { value: undefined };
  for (const line of raw.slice(4, end + 1).split('\n')) {
    const match = /^([A-Za-z]+):\s*(.*)$/.exec(line);
    if (match?.[1] === field) return { value: match[2].replace(/^["'](.*)["']$/, '$1').trim() };
  }
  return { value: undefined };
}
