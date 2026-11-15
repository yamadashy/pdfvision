// Draws assets/pipeline.png: a screenshot of a BI dashboard table pasted
// onto slide 3, the way decks carry tables copied from another tool.
// Run: node playground/cases/slides-landscape/assets.mjs

import { newCanvas, SANS, SANS_BOLD, writeAsset } from '../../lib/assets.mjs';
import { PIPELINE } from './data.mjs';

const W = 820;
const H = 400;
const { canvas, ctx } = newCanvas(W, H);

ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, W, H);
// Window chrome of the dashboard tool.
ctx.fillStyle = '#eef1f5';
ctx.fillRect(0, 0, W, 34);
for (const [i, x] of [16, 34, 52].entries()) {
  ctx.beginPath();
  ctx.arc(x, 17, 5, 0, Math.PI * 2);
  ctx.fillStyle = ['#e06c5a', '#e5b84a', '#6cbf6a'][i];
  ctx.fill();
}
ctx.fillStyle = '#5b6573';
ctx.font = `13px "${SANS}"`;
ctx.fillText(PIPELINE.window, 76, 22);

ctx.fillStyle = '#1f2a37';
ctx.font = `22px "${SANS_BOLD}"`;
ctx.fillText(PIPELINE.title, 28, 74);
ctx.fillStyle = '#6b7380';
ctx.font = `14px "${SANS}"`;
ctx.fillText(PIPELINE.subtitle, 28, 98);

const cols = [28, 330, 470, 640, 792];
const rowH = 38;
let y = 122;
ctx.fillStyle = '#f3f5f8';
ctx.fillRect(20, y, W - 40, rowH);
ctx.fillStyle = '#4a5462';
ctx.font = `15px "${SANS_BOLD}"`;
PIPELINE.columns.forEach((label, i) => {
  ctx.textAlign = i === 0 ? 'left' : 'right';
  ctx.fillText(label, i === 0 ? cols[0] : cols[i + 1] - 8, y + 25);
});
y += rowH;
PIPELINE.rows.forEach((row, r) => {
  const total = r === PIPELINE.rows.length - 1;
  ctx.strokeStyle = total ? '#4a5462' : '#e1e5eb';
  ctx.lineWidth = total ? 1.5 : 1;
  ctx.beginPath();
  ctx.moveTo(20, y);
  ctx.lineTo(W - 20, y);
  ctx.stroke();
  ctx.fillStyle = '#1f2a37';
  ctx.font = `16px "${total ? SANS_BOLD : SANS}"`;
  row.forEach((cell, i) => {
    ctx.textAlign = i === 0 ? 'left' : 'right';
    ctx.fillText(cell, i === 0 ? cols[0] : cols[i + 1] - 8, y + 25);
  });
  y += rowH;
});
ctx.textAlign = 'left';

await writeAsset(import.meta.url, 'pipeline.png', canvas);
