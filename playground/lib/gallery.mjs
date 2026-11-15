import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ISSUES_URL = 'https://github.com/yamadashy/pdfvision/issues';

function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function readOrEmpty(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function pageImages(dir) {
  return readdirSync(dir)
    .map((file) => /^page-(\d+)\.png$/u.exec(file))
    .filter(Boolean)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map((match) => match[0]);
}

function badge(meta) {
  if (meta.status !== 'known-gap') return '<span class="badge ok">ok</span>';
  const label = meta.issue ? `known gap · #${meta.issue}` : 'known gap · no issue yet';
  const inner = escapeHtml(label);
  return meta.issue
    ? `<a class="badge gap" href="${ISSUES_URL}/${meta.issue}">${inner}</a>`
    : `<span class="badge gap">${inner}</span>`;
}

function caseSection({ name, dir, meta }) {
  const images = pageImages(dir)
    .map((file) => `<img src="cases/${name}/${file}" alt="${escapeHtml(`${name} ${file}`)}">`)
    .join('\n');
  return `<section id="${name}">
  <h2><a href="#${name}">${escapeHtml(meta.title)}</a> ${badge(meta)}</h2>
  <p class="stresses">${escapeHtml(meta.stresses)} · <code>cases/${name}/</code></p>
  <div class="pair">
    <div class="pages">${images || '<p class="missing">No page PNG — run <code>node --run playground</code>.</p>'}</div>
    <div class="read"><h3>read.md — what an agent receives</h3><pre>${escapeHtml(readOrEmpty(join(dir, 'read.md')))}</pre></div>
  </div>
  <details open><summary>truth.md — what a correct reading contains</summary><pre>${escapeHtml(readOrEmpty(join(dir, 'truth.md')))}</pre></details>
</section>`;
}

export function renderGallery(cases) {
  const toc = cases
    .map(({ name, meta }) => `<li><a href="#${name}">${escapeHtml(meta.title)}</a> ${badge(meta)}</li>`)
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>pdfvision playground</title>
<style>
  :root { color-scheme: light dark; --bg: #fff; --fg: #1d1d1f; --muted: #6e6e73; --panel: #f5f5f7; --line: #d2d2d7; --ok: #1a7f37; --gap: #b35900; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #161618; --fg: #ececef; --muted: #a1a1a6; --panel: #222226; --line: #3a3a3f; --ok: #3fb950; --gap: #f0883e; }
  }
  body { margin: 0; padding: 24px clamp(16px, 4vw, 48px); background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
  a { color: inherit; }
  h1 { margin: 0 0 4px; font-size: 1.6rem; }
  header p, .stresses { color: var(--muted); margin: 0 0 12px; }
  section { border-top: 1px solid var(--line); padding-top: 20px; margin-top: 28px; }
  h2 { font-size: 1.2rem; margin: 0 0 4px; }
  h2 > a { text-decoration: none; }
  h3 { font-size: 0.85rem; color: var(--muted); margin: 0 0 6px; font-weight: 600; }
  .badge { display: inline-block; font-size: 0.75rem; font-weight: 600; padding: 1px 8px; border-radius: 999px; border: 1px solid currentColor; vertical-align: middle; text-decoration: none; }
  .badge.ok { color: var(--ok); }
  .badge.gap { color: var(--gap); }
  .pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  @media (max-width: 900px) { .pair { grid-template-columns: minmax(0, 1fr); } }
  .pages img { display: block; width: 100%; height: auto; border: 1px solid var(--line); background: #fff; margin-bottom: 8px; }
  pre { margin: 0; padding: 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; overflow: auto; font: 12.5px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
  .read pre { max-height: 85vh; }
  details { margin-top: 12px; }
  summary { cursor: pointer; color: var(--muted); font-size: 0.85rem; font-weight: 600; margin-bottom: 6px; }
  .missing { color: var(--muted); }
</style>
</head>
<body>
<header>
  <h1>pdfvision playground</h1>
  <p>Synthetic PDFs with a known correct reading, next to what <code>read_pdf</code> returns. Regenerate with <code>node --run playground</code>.</p>
  <ul>
${toc}
  </ul>
</header>
${cases.map(caseSection).join('\n')}
</body>
</html>
`;
}
