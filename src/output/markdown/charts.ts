import type { LayoutChart } from '../../types/index.js';
import { escapeTableCell, formatBox } from './helpers.js';

const KIND_LABEL: Record<LayoutChart['kind'], string> = { line: 'Line chart', pie: 'Pie chart', bar: 'Bar chart' };

/**
 * Chart values paired with their series by colour. A chart whose every
 * value has one category, once per series, is printed as a series ×
 * category grid; otherwise one row per value.
 */
export function appendCharts(lines: string[], charts: readonly LayoutChart[]): void {
  if (charts.length === 0) return;
  lines.push('');
  lines.push('### Chart values');
  lines.push('');
  lines.push(
    '_Values paired with their series by colour: the legend swatch matches the line, slice or bar segment the value is set on._',
  );
  for (const chart of charts) {
    lines.push('');
    lines.push(`#### ${KIND_LABEL[chart.kind]} at ${formatBox(chart)}`);
    lines.push('');
    if (chart.unpaired) {
      lines.push(
        `_${chart.unpaired} more value label${chart.unpaired === 1 ? '' : 's'} on this chart could not be paired; render the region for ${chart.unpaired === 1 ? 'it' : 'them'}._`,
      );
      lines.push('');
    }
    const series = [...new Set(chart.values.map((value) => value.series))];
    const categories = [...new Set(chart.values.map((value) => value.category ?? ''))];
    const keyed = new Map(chart.values.map((value) => [`${value.series}\u0000${value.category ?? ''}`, value.value]));
    const grid =
      chart.values.every((value) => value.category !== undefined) &&
      keyed.size === chart.values.length &&
      categories.length > 1;
    if (grid) {
      lines.push(`| Series | ${categories.map(escapeTableCell).join(' | ')} |`);
      lines.push(`| --- | ${categories.map(() => '---').join(' | ')} |`);
      for (const name of series) {
        const cells = categories.map((category) => escapeTableCell(keyed.get(`${name}\u0000${category}`) ?? ''));
        lines.push(`| ${escapeTableCell(name)} | ${cells.join(' | ')} |`);
      }
      continue;
    }
    const withCategory = chart.values.some((value) => value.category !== undefined);
    lines.push(withCategory ? '| Series | Category | Value |' : '| Series | Value |');
    lines.push(withCategory ? '| --- | --- | --- |' : '| --- | --- |');
    for (const value of chart.values) {
      const cells = [value.series, ...(withCategory ? [value.category ?? ''] : []), value.value];
      lines.push(`| ${cells.map(escapeTableCell).join(' | ')} |`);
    }
  }
}
