import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FAMILIES } from './coverage.mjs';

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
  if (meta.status !== 'known-gap') {
    const showcase = meta.showcase
      ? ` <span class="badge showcase" title="${escapeHtml(meta.hard)}">showcase</span>`
      : '';
    return `<span class="badge ok">ok</span>${showcase}`;
  }
  const label = meta.issue ? `known gap · #${meta.issue}` : 'known gap · no issue yet';
  const inner = escapeHtml(label);
  return meta.issue
    ? `<a class="badge gap" href="${ISSUES_URL}/${meta.issue}">${inner}</a>`
    : `<span class="badge gap">${inner}</span>`;
}

function familyChips(meta) {
  return meta.families
    .map((family) => `<button type="button" class="chip" data-family="${family}">${family}</button>`)
    .join(' ');
}

const dataAttrs = (meta) => `data-families="${meta.families.join(' ')}"${meta.showcase ? ' data-showcase' : ''}`;

function caseSection({ name, dir, meta }) {
  const files = pageImages(dir);
  const images = files
    .map(
      (file, i) =>
        `<figure><img src="cases/${name}/${file}" alt="${escapeHtml(`${name} ${file}`)}">${
          files.length > 1 ? `<figcaption>Page ${i + 1}</figcaption>` : ''
        }</figure>`,
    )
    .join('\n');
  return `<section id="${name}" class="case" ${dataAttrs(meta)}>
  <h2><a href="#${name}">${escapeHtml(meta.title)}</a> ${badge(meta)}</h2>
  <p class="families">${familyChips(meta)}</p>
  ${meta.showcase ? `<p class="hard"><strong>Why it is hard:</strong> ${escapeHtml(meta.hard)}</p>` : ''}
  <p class="stresses">${escapeHtml(meta.stresses)} · <code>cases/${name}/</code></p>
  <div class="pair">
    <div class="pages${files.length > 1 ? ' multi' : ''}">${images || '<p class="missing">No page PNG — run <code>node --run playground</code>.</p>'}</div>
    <div class="read"><h3>read.md — what an agent receives</h3><pre>${escapeHtml(readOrEmpty(join(dir, 'read.md')))}</pre></div>
  </div>
  <details open><summary>truth.md — what a correct reading contains</summary><pre>${escapeHtml(readOrEmpty(join(dir, 'truth.md')))}</pre></details>
</section>`;
}

export function renderGallery(cases) {
  const toc = cases
    .map(
      ({ name, dir, meta }) =>
        `<tr class="case" ${dataAttrs(meta)}><td><a href="#${name}">${escapeHtml(meta.title)}</a><br><code>${name}</code></td><td>${badge(meta)}</td><td class="num">${
          pageImages(dir).length || '—'
        }</td><td>${familyChips(meta)}</td><td class="stresses">${escapeHtml(meta.stresses)}</td></tr>`,
    )
    .join('\n');
  const gaps = cases.filter(({ meta }) => meta.status === 'known-gap').length;
  const showcases = cases.filter(({ meta }) => meta.showcase).length;
  const filters = Object.keys(FAMILIES)
    .map((family) => {
      const count = cases.filter(({ meta }) => meta.families.includes(family)).length;
      return `<button type="button" class="chip" data-family="${family}" title="${escapeHtml(FAMILIES[family])}">${family} <span class="count">${count}</span></button>`;
    })
    .join('\n    ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>pdfvision playground</title>
<style>
  :root { color-scheme: light dark; --bg: #fff; --fg: #1d1d1f; --muted: #6e6e73; --panel: #f5f5f7; --line: #d2d2d7; --ok: #1a7f37; --gap: #b35900; --showcase: #6639ba; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #161618; --fg: #ececef; --muted: #a1a1a6; --panel: #222226; --line: #3a3a3f; --ok: #3fb950; --gap: #f0883e; --showcase: #a371f7; }
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
  .badge.showcase { color: var(--showcase); }
  .chip { font: inherit; font-size: 0.75rem; padding: 1px 8px; border-radius: 4px; border: 1px solid var(--line); background: var(--panel); color: var(--fg); cursor: pointer; }
  .chip[aria-pressed="true"] { border-color: var(--fg); background: var(--fg); color: var(--bg); }
  .chip .count { color: var(--muted); }
  .chip[aria-pressed="true"] .count { color: var(--bg); }
  .filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
  .families { margin: 0 0 6px; }
  .hard { margin: 0 0 6px; font-size: 0.9rem; }
  .pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  @media (max-width: 900px) { .pair { grid-template-columns: minmax(0, 1fr); } }
  .pages img { display: block; width: 100%; height: auto; border: 1px solid var(--line); background: #fff; }
  .pages figure { margin: 0 0 8px; }
  .pages figcaption { color: var(--muted); font-size: 0.75rem; }
  .pages.multi { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
  .toc { overflow-x: auto; }
  .toc table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
  .toc th, .toc td { text-align: left; vertical-align: top; padding: 6px 10px 6px 0; border-bottom: 1px solid var(--line); }
  .toc .num { text-align: right; }
  .toc td.stresses { color: var(--muted); }
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
  <p>${cases.length} cases · ${cases.length - gaps} ok (${showcases} showcase) · ${gaps} known gap${gaps === 1 ? '' : 's'} · per-family matrix in <code>COVERAGE.md</code></p>
  <div class="filters" role="group" aria-label="Filter by family">
    <button type="button" class="chip" data-family="" aria-pressed="true">all</button>
    <button type="button" class="chip" data-family="showcase">showcase only</button>
    ${filters}
  </div>
  <div class="toc"><table>
    <thead><tr><th>Case</th><th>Status</th><th class="num">Pages</th><th>Families</th><th>Stresses</th></tr></thead>
    <tbody>
${toc}
    </tbody>
  </table></div>
</header>
${cases.map(caseSection).join('\n')}
<script>
  // Filter by family (or showcase) from any chip; the choice is kept in the URL hash as #family=<name>.
  function applyFilter(family) {
    for (const el of document.querySelectorAll('.case')) {
      const match = !family || (family === 'showcase' ? el.hasAttribute('data-showcase') : el.dataset.families.split(' ').includes(family));
      el.hidden = !match;
    }
    for (const chip of document.querySelectorAll('.filters .chip')) {
      chip.setAttribute('aria-pressed', String(chip.dataset.family === family));
    }
  }
  document.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    const family = chip.getAttribute('aria-pressed') === 'true' && chip.closest('.filters') ? '' : chip.dataset.family;
    history.replaceState(null, '', family ? '#family=' + family : location.pathname);
    applyFilter(family);
  });
  const initial = /^#family=([a-z-]+)$/.exec(location.hash);
  applyFilter(initial ? initial[1] : '');
</script>
</body>
</html>
`;
}
