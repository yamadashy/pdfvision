// Draws the two "scanned" pages: grey paper, a slight skew, speckle noise,
// JPEG at ~100 dpi — what a sheet-fed office scanner returns.
// Run: node playground/cases/scan-ocr-layer/assets.mjs

import { newCanvas, SANS, SANS_BOLD, seededRandom, writeAsset } from '../../lib/assets.mjs';
import { AMOUNT_RIGHT, INSPECTION, LETTER, SCAN_SCALE, SKEW } from './data.mjs';

const PAGE_W = 612;
const PAGE_H = 792;

function scanPage(seed, skew, drawContent) {
  const { canvas, ctx } = newCanvas(Math.round(PAGE_W * SCAN_SCALE), Math.round(PAGE_H * SCAN_SCALE));
  const random = seededRandom(seed);
  ctx.fillStyle = '#ecebe6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((skew * Math.PI) / 180);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);
  ctx.scale(SCAN_SCALE, SCAN_SCALE);
  ctx.fillStyle = '#f7f6f2';
  ctx.fillRect(6, 4, PAGE_W - 10, PAGE_H - 8);
  ctx.fillStyle = '#1e1e1e';
  drawContent(ctx);
  ctx.restore();
  // Toner specks and sensor noise.
  for (let i = 0; i < 2500; i++) {
    const shade = 90 + Math.floor(random() * 120);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.25 + random() * 0.5})`;
    const size = random() < 0.9 ? 1 : 2;
    ctx.fillRect(Math.floor(random() * canvas.width), Math.floor(random() * canvas.height), size, size);
  }
  // Darkened edge where the lid did not close.
  const edge = ctx.createLinearGradient(0, 0, 18, 0);
  edge.addColorStop(0, 'rgba(60,60,60,0.55)');
  edge.addColorStop(1, 'rgba(60,60,60,0)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, 18, canvas.height);
  return canvas;
}

function line(ctx, text, x, y, size, bold, align = 'left') {
  ctx.font = `${size}px "${bold ? SANS_BOLD : SANS}"`;
  ctx.textAlign = align;
  // Canvas places text by baseline; data.mjs gives the top of the line.
  ctx.fillText(text, x, y + size * 0.88);
  ctx.textAlign = 'left';
}

const letter = scanPage(7, SKEW[0], (ctx) => {
  for (const entry of LETTER) {
    line(ctx, entry.text, entry.x, entry.y, entry.size, entry.bold);
    if (entry.amount) line(ctx, entry.amount, AMOUNT_RIGHT, entry.y, entry.size, entry.bold, 'right');
  }
  // Handwritten signature.
  ctx.strokeStyle = '#1f2f6b';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(76, 536);
  ctx.bezierCurveTo(90, 505, 98, 548, 112, 522);
  ctx.bezierCurveTo(122, 506, 128, 540, 142, 528);
  ctx.bezierCurveTo(156, 516, 170, 534, 196, 518);
  ctx.stroke();
});
await writeAsset(import.meta.url, 'page-1-scan.jpg', letter, { quality: 55 });

const inspection = scanPage(11, SKEW[1], (ctx) => {
  line(ctx, INSPECTION.title, 306, 72, 15, true, 'center');
  line(ctx, INSPECTION.unit, 72, 112, 11, false);
  line(ctx, INSPECTION.date, 72, 128, 11, false);
  const cols = [72, 200, 290, 540];
  let y = 160;
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 0.8;
  const rows = [INSPECTION.columns, ...INSPECTION.rows];
  rows.forEach((row, r) => {
    ctx.strokeRect(cols[0], y, cols[3] - cols[0], 24);
    for (const x of cols.slice(1, 3)) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 24);
      ctx.stroke();
    }
    row.forEach((cell, i) => {
      line(ctx, cell, cols[i] + 6, y + 6, 10.5, r === 0);
    });
    y += 24;
  });
  line(ctx, INSPECTION.keys, 72, y + 24, 11, false);
  line(ctx, INSPECTION.inspector, 72, y + 60, 11, false);
  ctx.beginPath();
  ctx.moveTo(330, y + 72);
  ctx.lineTo(540, y + 72);
  ctx.stroke();
  line(ctx, 'Tenant signature', 330, y + 76, 9, false);
});
await writeAsset(import.meta.url, 'page-2-scan.jpg', inspection, { quality: 55 });
