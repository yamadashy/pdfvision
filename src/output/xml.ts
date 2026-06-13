import type { DocumentResult, PageStructureItem } from '../types/index.js';

/**
 * XML-flavoured output. Not strictly conformant XML — there's no `<?xml`
 * declaration and no namespace — but a tag-shaped, near-JSON-parity form
 * that LLMs parse very reliably (tags act as obvious section markers, so
 * "find the page-3 text" is easier than counting commas in a JSON dump).
 *
 * The shape mirrors the `DocumentResult` schema:
 *   <document file=".." totalPages="N">
 *     <metadata><title/><author/>...</metadata>
 *     <overview><page no=".." charCount=".." .../></overview>   (multi-page)
 *     <pages>
 *       <page no=".." charCount=".." ...>
 *         <spans><span text=".." x=".." .../></spans>            (--geometry)
 *         <text>...</text>
 *         <rawText>...</rawText>                                  (when present)
 *       </page>
 *     </pages>
 *   </document>
 */

function escapeAttr(value: string): string {
  // Order matters: `&` first so the replacement entities themselves
  // don't get re-escaped. `\n` / `\r` get numeric entities so a title
  // with a stray newline doesn't break the attribute boundary.
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\n', '&#10;')
    .replaceAll('\r', '&#13;');
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function viewerValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
  return JSON.stringify(value);
}

function appendJavaScriptActions(out: string[], actions: Record<string, string[]>): void {
  out.push('<jsActions>');
  for (const [name, scripts] of Object.entries(actions)) {
    out.push(`<action name="${escapeAttr(name)}">`);
    for (const script of scripts) out.push(`<script>${escapeText(script)}</script>`);
    out.push('</action>');
  }
  out.push('</jsActions>');
}

function linkTarget(value: NonNullable<DocumentResult['pages'][number]['links']>[number]['target']): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function appendStructureItem(out: string[], item: PageStructureItem): void {
  if (!('role' in item)) {
    out.push(`<content type="${escapeAttr(item.type)}" id="${escapeAttr(item.id)}"/>`);
    return;
  }
  const attrs = [`role="${escapeAttr(item.role)}"`];
  if (item.alt !== undefined) attrs.push(`alt="${escapeAttr(item.alt)}"`);
  if (item.mathML !== undefined) attrs.push(`mathML="${escapeAttr(item.mathML)}"`);
  if (item.lang !== undefined) attrs.push(`lang="${escapeAttr(item.lang)}"`);
  if (item.bbox !== undefined) attrs.push(`bbox="${escapeAttr(item.bbox.join(','))}"`);
  if (item.children.length === 0) {
    out.push(`<node ${attrs.join(' ')}/>`);
    return;
  }
  out.push(`<node ${attrs.join(' ')}>`);
  for (const child of item.children) appendStructureItem(out, child);
  out.push('</node>');
}

export function formatXml(result: DocumentResult): string {
  const out: string[] = [];
  out.push(`<document file="${escapeAttr(result.file)}" totalPages="${result.totalPages}">`);

  const meta = result.metadata;
  if (meta.title || meta.author || meta.subject || meta.creator) {
    out.push('<metadata>');
    if (meta.title) out.push(`<title>${escapeText(meta.title)}</title>`);
    if (meta.author) out.push(`<author>${escapeText(meta.author)}</author>`);
    if (meta.subject) out.push(`<subject>${escapeText(meta.subject)}</subject>`);
    if (meta.creator) out.push(`<creator>${escapeText(meta.creator)}</creator>`);
    out.push('</metadata>');
  }

  if (result.pageLabels) {
    if (result.pageLabels.length === 0) {
      out.push('<pageLabels/>');
    } else {
      out.push('<pageLabels>');
      result.pageLabels.forEach((label, index) => {
        out.push(`<pageLabel page="${index + 1}" label="${escapeAttr(label)}"/>`);
      });
      out.push('</pageLabels>');
    }
  }

  if (result.viewer) {
    const attrs: string[] = [];
    if (result.viewer.pageMode !== undefined) attrs.push(`pageMode="${escapeAttr(result.viewer.pageMode)}"`);
    if (result.viewer.pageLayout !== undefined) attrs.push(`pageLayout="${escapeAttr(result.viewer.pageLayout)}"`);
    if (attrs.length === 0 && Object.keys(result.viewer).length === 0) {
      out.push('<viewer/>');
    } else {
      out.push(`<viewer${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}>`);
      if (result.viewer.openAction) {
        const actionAttrs = [`type="${result.viewer.openAction.type}"`];
        if (result.viewer.openAction.page !== undefined) actionAttrs.push(`page="${result.viewer.openAction.page}"`);
        if (result.viewer.openAction.action !== undefined) {
          actionAttrs.push(`action="${escapeAttr(result.viewer.openAction.action)}"`);
        }
        if (result.viewer.openAction.target !== undefined) {
          actionAttrs.push(`target="${escapeAttr(result.viewer.openAction.target)}"`);
        }
        out.push(`<openAction ${actionAttrs.join(' ')}/>`);
      }
      if (result.viewer.jsActions) {
        appendJavaScriptActions(out, result.viewer.jsActions);
      }
      if (result.viewer.permissions) {
        out.push(
          `<permissions flags="${escapeAttr(result.viewer.permissions.flags.join(','))}" allowed="${escapeAttr(result.viewer.permissions.allowed.join(','))}"/>`,
        );
      }
      if (result.viewer.markInfo) {
        out.push(
          `<markInfo marked="${result.viewer.markInfo.marked}" userProperties="${result.viewer.markInfo.userProperties}" suspects="${result.viewer.markInfo.suspects}"/>`,
        );
      }
      if (result.viewer.viewerPreferences) {
        out.push('<viewerPreferences>');
        for (const [key, value] of Object.entries(result.viewer.viewerPreferences)) {
          out.push(`<preference name="${escapeAttr(key)}" value="${escapeAttr(viewerValue(value))}"/>`);
        }
        out.push('</viewerPreferences>');
      }
      out.push('</viewer>');
    }
  }

  if (result.layers) {
    const attrs: string[] = [];
    if (result.layers.name !== undefined) attrs.push(`name="${escapeAttr(result.layers.name)}"`);
    if (result.layers.creator !== undefined) attrs.push(`creator="${escapeAttr(result.layers.creator)}"`);
    if (result.layers.order !== undefined) attrs.push(`order="${escapeAttr(JSON.stringify(result.layers.order))}"`);
    if (result.layers.groups.length === 0) {
      out.push(`<layers${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}/>`);
    } else {
      out.push(`<layers${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}>`);
      for (const layer of result.layers.groups) {
        const layerAttrs = [`id="${escapeAttr(layer.id)}"`, `visible="${layer.visible}"`];
        if (layer.name !== undefined) layerAttrs.push(`name="${escapeAttr(layer.name)}"`);
        if (layer.intent !== undefined) layerAttrs.push(`intent="${escapeAttr(layer.intent.join(','))}"`);
        if (layer.usage?.viewState !== undefined) layerAttrs.push(`viewState="${layer.usage.viewState}"`);
        if (layer.usage?.printState !== undefined) layerAttrs.push(`printState="${layer.usage.printState}"`);
        if (layer.rbGroups !== undefined) layerAttrs.push(`rbGroups="${escapeAttr(JSON.stringify(layer.rbGroups))}"`);
        out.push(`<layer ${layerAttrs.join(' ')}/>`);
      }
      out.push('</layers>');
    }
  }

  if (result.attachments) {
    if (result.attachments.length === 0) {
      out.push('<attachments/>');
    } else {
      out.push('<attachments>');
      for (const attachment of result.attachments) {
        const attrs = [`name="${escapeAttr(attachment.name)}"`, `size="${attachment.size}"`];
        if (attachment.rawName !== undefined) attrs.push(`rawName="${escapeAttr(attachment.rawName)}"`);
        if (attachment.description !== undefined) {
          attrs.push(`description="${escapeAttr(attachment.description)}"`);
        }
        if (attachment.path !== undefined) attrs.push(`path="${escapeAttr(attachment.path)}"`);
        out.push(`<attachment ${attrs.join(' ')}/>`);
      }
      out.push('</attachments>');
    }
  }

  if (result.outline) {
    if (result.outline.length === 0) {
      out.push('<outline/>');
    } else {
      out.push('<outline>');
      appendOutline(out, result.outline);
      out.push('</outline>');
    }
  }

  if (result.overview) {
    out.push('<overview>');
    for (const p of result.overview) {
      const ovAttrs = [
        `no="${p.page}"`,
        `charCount="${p.charCount}"`,
        `imageCount="${p.imageCount}"`,
        `vectorCount="${p.vectorCount}"`,
        `textCoverage="${p.textCoverage}"`,
        `nonPrintableRatio="${p.nonPrintableRatio}"`,
        `nonPrintableCount="${p.nonPrintableCount}"`,
      ];
      if (p.pageLabel !== undefined) ovAttrs.push(`label="${escapeAttr(p.pageLabel)}"`);
      if (p.renderContentRatio !== undefined) ovAttrs.push(`renderContentRatio="${p.renderContentRatio}"`);
      ovAttrs.push(`nativeTextStatus="${p.quality.nativeTextStatus}"`);
      if (p.quality.visualStatus !== undefined) ovAttrs.push(`visualStatus="${p.quality.visualStatus}"`);
      if (p.warningCount !== undefined) ovAttrs.push(`warningCount="${p.warningCount}"`);
      if (p.matchCount !== undefined) ovAttrs.push(`matchCount="${p.matchCount}"`);
      if (p.vectorBoxCount !== undefined) ovAttrs.push(`vectorBoxCount="${p.vectorBoxCount}"`);
      if (p.visualRegionCount !== undefined) ovAttrs.push(`visualRegionCount="${p.visualRegionCount}"`);
      if (p.formFieldCount !== undefined) ovAttrs.push(`formFieldCount="${p.formFieldCount}"`);
      if (p.linkCount !== undefined) ovAttrs.push(`linkCount="${p.linkCount}"`);
      if (p.annotationCount !== undefined) ovAttrs.push(`annotationCount="${p.annotationCount}"`);
      if (p.structureNodeCount !== undefined) ovAttrs.push(`structureNodeCount="${p.structureNodeCount}"`);
      ovAttrs.push(`width="${p.width}"`, `height="${p.height}"`);
      out.push(`<page ${ovAttrs.join(' ')}/>`);
    }
    out.push('</overview>');
  }

  out.push('<pages>');
  for (const page of result.pages) {
    const attrs = [
      `no="${page.page}"`,
      `charCount="${page.charCount}"`,
      `imageCount="${page.imageCount}"`,
      `vectorCount="${page.vectorCount}"`,
      `textCoverage="${page.textCoverage}"`,
      `nonPrintableRatio="${page.nonPrintableRatio}"`,
      `nonPrintableCount="${page.nonPrintableCount}"`,
    ];
    if (page.pageLabel !== undefined) attrs.push(`label="${escapeAttr(page.pageLabel)}"`);
    if (page.renderContentRatio !== undefined) attrs.push(`renderContentRatio="${page.renderContentRatio}"`);
    attrs.push(`nativeTextStatus="${page.quality.nativeTextStatus}"`);
    if (page.quality.visualStatus !== undefined) attrs.push(`visualStatus="${page.quality.visualStatus}"`);
    attrs.push(`width="${page.width}"`, `height="${page.height}"`);
    if (page.image) attrs.push(`image="${escapeAttr(page.image)}"`);
    // Echo the requested render region so XML consumers can tell
    // crop-vs-full output the same way JSON consumers do. Encoded as
    // four sibling attributes (matching the bbox shape we already use
    // for <span>, <block>, <imageBox>) so the parser surface stays
    // homogeneous.
    if (page.renderRegion) {
      attrs.push(
        `renderRegionX="${page.renderRegion.x}"`,
        `renderRegionY="${page.renderRegion.y}"`,
        `renderRegionWidth="${page.renderRegion.width}"`,
        `renderRegionHeight="${page.renderRegion.height}"`,
      );
    }
    out.push(`<page ${attrs.join(' ')}>`);

    if (page.spans && page.spans.length > 0) {
      out.push('<spans>');
      for (const span of page.spans) {
        const spanAttrs = [
          `text="${escapeAttr(span.text)}"`,
          `x="${span.x}"`,
          `y="${span.y}"`,
          `width="${span.width}"`,
          `height="${span.height}"`,
          `fontSize="${span.fontSize}"`,
        ];
        if (span.fontName) spanAttrs.push(`fontName="${escapeAttr(span.fontName)}"`);
        out.push(`<span ${spanAttrs.join(' ')}/>`);
      }
      out.push('</spans>');
    }

    if (page.layout) {
      if (page.layout.blocks.length === 0 && (!page.layout.tables || page.layout.tables.length === 0)) {
        // Mirror the <imageBoxes/> pattern: a self-closing tag tells
        // downstream agents "we ran the layout pass and found nothing"
        // rather than "layout was not requested".
        out.push('<layout/>');
      } else {
        out.push('<layout>');
        if (page.layout.blocks.length > 0) {
          for (const block of page.layout.blocks) {
            const blockAttrs = [
              `x="${block.x}"`,
              `y="${block.y}"`,
              `width="${block.width}"`,
              `height="${block.height}"`,
            ];
            if (block.role) blockAttrs.push(`role="${block.role}"`);
            if (block.level !== undefined) blockAttrs.push(`level="${block.level}"`);
            if (block.roleConfidence !== undefined) blockAttrs.push(`roleConfidence="${block.roleConfidence}"`);
            if (block.writingMode) blockAttrs.push(`writingMode="${block.writingMode}"`);
            if (block.repeated) blockAttrs.push('repeated="true"');
            out.push(`<block ${blockAttrs.join(' ')}>`);
            for (const line of block.lines) {
              const lineAttrs = [
                `x="${line.x}"`,
                `y="${line.y}"`,
                `width="${line.width}"`,
                `height="${line.height}"`,
                `fontSize="${line.fontSize}"`,
              ];
              if (line.writingMode) lineAttrs.push(`writingMode="${line.writingMode}"`);
              out.push(`<line ${lineAttrs.join(' ')}>${escapeText(line.text)}</line>`);
            }
            out.push('</block>');
          }
        }
        if (page.layout.tables && page.layout.tables.length > 0) {
          out.push('<tables>');
          for (const table of page.layout.tables) {
            out.push(
              `<table x="${table.x}" y="${table.y}" width="${table.width}" height="${table.height}" rowCount="${table.rowCount}" columnCount="${table.columnCount}">`,
            );
            for (const row of table.rows) {
              out.push(`<row y="${row.y}" height="${row.height}">`);
              for (const cell of row.cells) {
                out.push(
                  `<cell x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}">${escapeText(cell.text)}</cell>`,
                );
              }
              out.push('</row>');
            }
            out.push('</table>');
          }
          out.push('</tables>');
        }
        out.push('</layout>');
      }
    }

    if (page.imageBoxes) {
      if (page.imageBoxes.length === 0) {
        out.push('<imageBoxes/>');
      } else {
        out.push('<imageBoxes>');
        for (const box of page.imageBoxes) {
          out.push(`<imageBox x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/>`);
        }
        out.push('</imageBoxes>');
      }
    }

    if (page.vectorBoxes) {
      if (page.vectorBoxes.length === 0) {
        out.push('<vectorBoxes/>');
      } else {
        out.push('<vectorBoxes>');
        for (const box of page.vectorBoxes) {
          out.push(`<vectorBox x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/>`);
        }
        out.push('</vectorBoxes>');
      }
    }

    if (page.visualRegions) {
      if (page.visualRegions.length === 0) {
        out.push('<visualRegions/>');
      } else {
        out.push('<visualRegions>');
        for (const region of page.visualRegions) {
          const attrs = [
            ...(region.id !== undefined ? [`id="${escapeAttr(region.id)}"`] : []),
            `kind="${region.kind}"`,
            `x="${region.x}"`,
            `y="${region.y}"`,
            `width="${region.width}"`,
            `height="${region.height}"`,
            `areaRatio="${region.areaRatio}"`,
            `sourceCount="${region.sourceCount}"`,
            `reason="${escapeAttr(region.reason)}"`,
          ];
          if (region.image !== undefined) attrs.push(`image="${escapeAttr(region.image)}"`);
          if (region.renderContentRatio !== undefined) {
            attrs.push(`renderContentRatio="${region.renderContentRatio}"`);
          }
          const associatedText = region.associatedText ?? [];
          if (region.sources.length === 0 && associatedText.length === 0) {
            out.push(`<region ${attrs.join(' ')}/>`);
          } else {
            out.push(`<region ${attrs.join(' ')}>`);
            for (const source of region.sources) {
              out.push(`<source type="${source.type}" index="${source.index}"/>`);
            }
            if (associatedText.length > 0) {
              out.push('<associatedText>');
              for (const item of associatedText) {
                const textAttrs = [
                  `relation="${item.relation}"`,
                  `x="${item.x}"`,
                  `y="${item.y}"`,
                  `width="${item.width}"`,
                  `height="${item.height}"`,
                  ...(item.blockIndex !== undefined ? [`blockIndex="${item.blockIndex}"`] : []),
                  ...(item.fieldIndex !== undefined ? [`fieldIndex="${item.fieldIndex}"`] : []),
                ];
                out.push(`<text ${textAttrs.join(' ')}>${escapeText(item.text)}</text>`);
              }
              out.push('</associatedText>');
            }
            out.push('</region>');
          }
        }
        out.push('</visualRegions>');
      }
    }

    if (page.formFields) {
      if (page.formFields.length === 0) {
        out.push('<formFields/>');
      } else {
        out.push('<formFields>');
        for (const field of page.formFields) {
          const fieldAttrs = [
            `name="${escapeAttr(field.name)}"`,
            `type="${field.type}"`,
            `x="${field.x}"`,
            `y="${field.y}"`,
            `width="${field.width}"`,
            `height="${field.height}"`,
          ];
          if (field.value !== undefined) fieldAttrs.push(`value="${escapeAttr(field.value)}"`);
          if (field.checked !== undefined) fieldAttrs.push(`checked="${field.checked}"`);
          if (field.readOnly !== undefined) fieldAttrs.push(`readOnly="${field.readOnly}"`);
          if (field.required !== undefined) fieldAttrs.push(`required="${field.required}"`);
          if (field.multiline !== undefined) fieldAttrs.push(`multiline="${field.multiline}"`);
          if (field.exportValue !== undefined) fieldAttrs.push(`exportValue="${escapeAttr(field.exportValue)}"`);
          if (field.combo !== undefined) fieldAttrs.push(`combo="${field.combo}"`);
          if (field.multiSelect !== undefined) fieldAttrs.push(`multiSelect="${field.multiSelect}"`);
          if (field.flags !== undefined) fieldAttrs.push(`flags="${escapeAttr(field.flags.join(','))}"`);
          if (field.label !== undefined) {
            fieldAttrs.push(`label="${escapeAttr(field.label.text)}"`);
            fieldAttrs.push(`labelRelation="${field.label.relation}"`);
            fieldAttrs.push(`labelX="${field.label.x}"`);
            fieldAttrs.push(`labelY="${field.label.y}"`);
            fieldAttrs.push(`labelWidth="${field.label.width}"`);
            fieldAttrs.push(`labelHeight="${field.label.height}"`);
          }
          const hasOptions = field.options !== undefined && field.options.length > 0;
          const hasActions = field.actions !== undefined;
          if (!hasOptions && !hasActions) {
            out.push(`<field ${fieldAttrs.join(' ')}/>`);
            continue;
          }
          out.push(`<field ${fieldAttrs.join(' ')}>`);
          if (field.actions) appendJavaScriptActions(out, field.actions);
          if (field.options && field.options.length > 0) {
            out.push('<options>');
            for (const option of field.options) {
              out.push(
                `<option exportValue="${escapeAttr(option.exportValue)}" displayValue="${escapeAttr(option.displayValue)}"/>`,
              );
            }
            out.push('</options>');
          }
          out.push('</field>');
        }
        out.push('</formFields>');
      }
    }

    if (page.jsActions) {
      appendJavaScriptActions(out, page.jsActions);
    }

    if (page.links) {
      if (page.links.length === 0) {
        out.push('<links/>');
      } else {
        out.push('<links>');
        for (const link of page.links) {
          out.push(
            `<link type="${link.type}" target="${escapeAttr(linkTarget(link.target))}" x="${link.x}" y="${link.y}" width="${link.width}" height="${link.height}"/>`,
          );
        }
        out.push('</links>');
      }
    }

    if (page.annotations) {
      if (page.annotations.length === 0) {
        out.push('<annotations/>');
      } else {
        out.push('<annotations>');
        for (const annotation of page.annotations) {
          const annotationAttrs = [
            `subtype="${escapeAttr(annotation.subtype)}"`,
            `x="${annotation.x}"`,
            `y="${annotation.y}"`,
            `width="${annotation.width}"`,
            `height="${annotation.height}"`,
          ];
          if (annotation.name !== undefined) annotationAttrs.push(`name="${escapeAttr(annotation.name)}"`);
          if (annotation.contents !== undefined) annotationAttrs.push(`contents="${escapeAttr(annotation.contents)}"`);
          if (annotation.title !== undefined) annotationAttrs.push(`title="${escapeAttr(annotation.title)}"`);
          if (annotation.color !== undefined) annotationAttrs.push(`color="${annotation.color.join(',')}"`);
          if (annotation.modified !== undefined) annotationAttrs.push(`modified="${escapeAttr(annotation.modified)}"`);
          if (annotation.hasAppearance !== undefined) {
            annotationAttrs.push(`hasAppearance="${annotation.hasAppearance}"`);
          }
          if (annotation.flags !== undefined && annotation.flags.length > 0) {
            annotationAttrs.push(`flags="${annotation.flags.join(',')}"`);
          }
          if (
            annotation.fileAttachment !== undefined ||
            annotation.border !== undefined ||
            annotation.line !== undefined ||
            (annotation.vertices !== undefined && annotation.vertices.length > 0) ||
            (annotation.inkPaths !== undefined && annotation.inkPaths.length > 0) ||
            (annotation.quadBoxes !== undefined && annotation.quadBoxes.length > 0)
          ) {
            out.push(`<annotation ${annotationAttrs.join(' ')}>`);
            if (annotation.fileAttachment !== undefined) {
              const fileAttrs = [
                `name="${escapeAttr(annotation.fileAttachment.name)}"`,
                `size="${annotation.fileAttachment.size}"`,
              ];
              if (annotation.fileAttachment.description !== undefined) {
                fileAttrs.push(`description="${escapeAttr(annotation.fileAttachment.description)}"`);
              }
              out.push(`<fileAttachment ${fileAttrs.join(' ')}/>`);
            }
            if (annotation.border !== undefined) {
              const borderAttrs: string[] = [];
              if (annotation.border.width !== undefined) borderAttrs.push(`width="${annotation.border.width}"`);
              if (annotation.border.style !== undefined) {
                borderAttrs.push(`style="${escapeAttr(annotation.border.style)}"`);
              }
              if (annotation.border.dashArray !== undefined && annotation.border.dashArray.length > 0) {
                borderAttrs.push(`dashArray="${annotation.border.dashArray.join(',')}"`);
              }
              out.push(`<border ${borderAttrs.join(' ')}/>`);
            }
            if (annotation.line !== undefined) {
              const lineAttrs = [
                `fromX="${annotation.line.from.x}"`,
                `fromY="${annotation.line.from.y}"`,
                `toX="${annotation.line.to.x}"`,
                `toY="${annotation.line.to.y}"`,
              ];
              if (annotation.line.endings !== undefined) {
                lineAttrs.push(`endings="${annotation.line.endings.map(escapeAttr).join(',')}"`);
              }
              out.push(`<line ${lineAttrs.join(' ')}/>`);
            }
            if (annotation.vertices !== undefined && annotation.vertices.length > 0) {
              out.push('<vertices>');
              for (const point of annotation.vertices) {
                out.push(`<point x="${point.x}" y="${point.y}"/>`);
              }
              out.push('</vertices>');
            }
            if (annotation.inkPaths !== undefined && annotation.inkPaths.length > 0) {
              out.push('<inkPaths>');
              for (const path of annotation.inkPaths) {
                out.push('<path>');
                for (const point of path) {
                  out.push(`<point x="${point.x}" y="${point.y}"/>`);
                }
                out.push('</path>');
              }
              out.push('</inkPaths>');
            }
            for (const box of annotation.quadBoxes ?? []) {
              out.push(`<quadBox x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/>`);
            }
            out.push('</annotation>');
          } else {
            out.push(`<annotation ${annotationAttrs.join(' ')}/>`);
          }
        }
        out.push('</annotations>');
      }
    }

    if (page.matches) {
      // Search hits. Empty array → self-closing `<matches/>` so XML
      // consumers can distinguish "search ran, nothing matched" from
      // "search wasn't requested" the same way JSON does (absent
      // field vs present-empty-array). Each match emits its bbox as
      // sibling attributes (renderRegionX-style), plus per-span boxes
      // inside as `<box .../>` children so highlight overlays still
      // work for multi-span matches in the future.
      if (page.matches.length === 0) {
        out.push('<matches/>');
      } else {
        out.push('<matches>');
        for (const m of page.matches) {
          const mAttrs = [`page="${m.page}"`, `query="${escapeAttr(m.query)}"`];
          if (m.queryIndex !== undefined) mAttrs.push(`queryIndex="${m.queryIndex}"`);
          mAttrs.push(
            `source="${m.source}"`,
            `x="${m.bbox.x}"`,
            `y="${m.bbox.y}"`,
            `width="${m.bbox.width}"`,
            `height="${m.bbox.height}"`,
          );
          out.push(`<match ${mAttrs.join(' ')}>`);
          out.push(`<text>${escapeText(m.text)}</text>`);
          for (const b of m.boxes) {
            out.push(`<box x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}"/>`);
          }
          if (m.context !== undefined) {
            out.push(`<context>${escapeText(m.context)}</context>`);
          }
          out.push('</match>');
        }
        out.push('</matches>');
      }
    }

    if (page.structure !== undefined) {
      if (page.structure === null) {
        out.push('<structure/>');
      } else {
        out.push('<structure>');
        appendStructureItem(out, page.structure);
        out.push('</structure>');
      }
    }

    if (page.warnings && page.warnings.length > 0) {
      // Warnings are only attached when at least one rule fired (the
      // detector returns `[]` on a clean page and processor omits the
      // field), so there is no empty-warnings self-closing form like
      // `<layout/>` to mirror — absence already means "no findings".
      out.push('<warnings>');
      for (const w of page.warnings) {
        const wAttrs = [`code="${w.code}"`, `severity="${w.severity}"`];
        if (w.blockIndex !== undefined) wAttrs.push(`blockIndex="${w.blockIndex}"`);
        if (w.otherBlockIndex !== undefined) wAttrs.push(`otherBlockIndex="${w.otherBlockIndex}"`);
        if (w.imageBoxIndex !== undefined) wAttrs.push(`imageBoxIndex="${w.imageBoxIndex}"`);
        out.push(`<warning ${wAttrs.join(' ')}>${escapeText(w.message)}</warning>`);
      }
      out.push('</warnings>');
    }

    if (page.text) {
      // Newlines top and bottom keep the text body visually distinct from
      // the surrounding tags — matters for LLM comprehension. The leading
      // and trailing \n become part of <text>'s character data, which is
      // intentional and documented.
      out.push(`<text>\n${escapeText(page.text)}\n</text>`);
    }
    if (page.rawText) {
      out.push(`<rawText>\n${escapeText(page.rawText)}\n</rawText>`);
    }
    if (page.ocr) {
      const ocrAttrs = `lang="${escapeAttr(page.ocr.lang)}" confidence="${page.ocr.confidence}"`;
      if ((page.ocr.words?.length ?? 0) > 0) {
        out.push(`<ocr ${ocrAttrs}>`);
        if (page.ocr.text) {
          out.push(`<text>\n${escapeText(page.ocr.text)}\n</text>`);
        }
        out.push('<words>');
        for (const word of page.ocr.words ?? []) {
          out.push(
            `<word text="${escapeAttr(word.text)}" confidence="${word.confidence}" x="${word.x}" y="${word.y}" width="${word.width}" height="${word.height}"/>`,
          );
        }
        out.push('</words>');
        out.push('</ocr>');
      } else if (page.ocr.text) {
        out.push(`<ocr ${ocrAttrs}>\n${escapeText(page.ocr.text)}\n</ocr>`);
      } else {
        // Self-closing keeps "OCR ran but found nothing" distinct from
        // "OCR was not requested" (the latter omits the tag entirely).
        out.push(`<ocr ${ocrAttrs}/>`);
      }
    }
    out.push('</page>');
  }
  out.push('</pages>');
  out.push('</document>');

  return out.join('\n');
}

function appendOutline(out: string[], items: NonNullable<DocumentResult['outline']>): void {
  for (const item of items) {
    const attrs = [`title="${escapeAttr(item.title)}"`];
    if (item.type) attrs.push(`type="${item.type}"`);
    if (item.target) attrs.push(`target="${escapeAttr(item.target)}"`);
    if (item.page !== undefined) attrs.push(`page="${item.page}"`);
    if (item.items && item.items.length > 0) {
      out.push(`<item ${attrs.join(' ')}>`);
      appendOutline(out, item.items);
      out.push('</item>');
    } else {
      out.push(`<item ${attrs.join(' ')}/>`);
    }
  }
}
