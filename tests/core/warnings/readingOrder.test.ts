import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import type { PageResult } from '../../../src/types/index.js';
import { block, line, page } from './helpers.js';

describe('detectPageWarnings', () => {
  describe('reading_order_divergence', () => {
    /** Page shaped like PLoS Medicine p.1: the title heading leads the
     *  visual flow but the producer emitted it after the body columns. */
    function divergentPage(): PageResult {
      const title = 'Why Most Published Research Findings Are False';
      const body = 'Published research findings are sometimes refuted by subsequent evidence. '.repeat(20);
      const blocks = [
        block(45, 61, 433, 40, { text: title, role: 'heading' }),
        block(45, 121, 156, 300, { text: body.slice(0, 500) }),
        block(219, 141, 153, 500, { text: body.slice(500, 1000) }),
        block(393, 141, 156, 500, { text: body.slice(1000) }),
      ];
      return { ...page(blocks, 594, 783), text: `${body}${title}`, charCount: body.length + title.length };
    }

    it('flags a leading heading that only appears late in the native text stream', () => {
      const out = detectPageWarnings(divergentPage());
      const divergence = out.find((w) => w.code === 'reading_order_divergence');
      expect(divergence).toBeDefined();
      expect(divergence?.blockIndex).toBe(0);
      expect(divergence?.message).toContain('Why Most Published Research Findings');
      // Pinned as a literal, not built from the constant: `message` is a
      // public field that JSON, XML, and TOON serialize verbatim, so this
      // is the guard against rewording it by accident.
      expect(divergence?.message.endsWith('prefer layout.blocks order when sequence matters')).toBe(true);
    });

    it('does not flag when native order matches the layout order', () => {
      const aligned = divergentPage();
      const title = 'Why Most Published Research Findings Are False';
      aligned.text = `${title}\n${aligned.text.slice(0, aligned.text.length - title.length)}`;
      const out = detectPageWarnings(aligned);
      expect(out.filter((w) => w.code === 'reading_order_divergence')).toEqual([]);
    });

    it('flags a sparse slide heading whose CJK title is emitted last in native text', () => {
      const title = '狩野モデル';
      const url = 'https://www.juse.or.jp/software/55/';
      const blocks = [
        block(120, 0, 360, 58, { text: title, role: 'heading', lines: [line(title, 120, 0, 360, 58)] }),
        block(180, 1046, 980, 22, { text: url, lines: [line(url, 180, 1046, 980, 22)] }),
      ];
      const p = { ...page(blocks, 1920, 1080), text: `${url}\n${title}`, charCount: url.length + title.length + 1 };

      const out = detectPageWarnings(p);
      const divergence = out.find((w) => w.code === 'reading_order_divergence');
      expect(divergence).toMatchObject({ severity: 'warning', blockIndex: 0 });
      expect(divergence?.message).toContain('visually-first title');
      expect(divergence?.message).toContain(title);
    });

    it('flags a sparse slide header without heading role when the CJK title is emitted last', () => {
      const title = '自己紹介';
      const account = 't-wada\nt_wada\ntwada';
      const emoji = '📷🙆 📹🙅\n🙆';
      const blocks = [
        block(96, 0, 270, 64, { text: title, lines: [line(title, 96, 0, 270, 64)] }),
        block(120, 95, 420, 90, { text: account }),
        block(140, 690, 360, 120, { text: emoji }),
      ];
      const p = {
        ...page(blocks, 1920, 1080),
        text: `${account}\n\n${emoji}\n\n${title}`,
        charCount: account.length + emoji.length + title.length + 4,
      };

      const out = detectPageWarnings(p);
      const divergence = out.find((w) => w.code === 'reading_order_divergence');
      expect(divergence).toMatchObject({ severity: 'warning', blockIndex: 0 });
      expect(divergence?.message).toContain(title);
    });

    it('does not flag a sparse slide title when native order is already title-first', () => {
      const title = '狩野モデル';
      const url = 'https://www.juse.or.jp/software/55/';
      const blocks = [
        block(120, 0, 360, 58, { text: title, role: 'heading', lines: [line(title, 120, 0, 360, 58)] }),
        block(180, 1046, 980, 22, { text: url, lines: [line(url, 180, 1046, 980, 22)] }),
      ];
      const p = { ...page(blocks, 1920, 1080), text: `${title}\n${url}`, charCount: url.length + title.length + 1 };

      const out = detectPageWarnings(p);
      expect(out.filter((w) => w.code === 'reading_order_divergence')).toEqual([]);
    });

    it('does not flag a sparse top paragraph emitted last when it is too long to be a title', () => {
      const paragraph = 'This is a long paragraph block that should not look like a slide title';
      const body = 'Earlier body text';
      const blocks = [
        block(100, 0, 720, 26, { text: paragraph, lines: [line(paragraph, 100, 0, 720, 26)] }),
        block(100, 120, 300, 18, { text: body, lines: [line(body, 100, 120, 300, 18)] }),
      ];
      const p = {
        ...page(blocks, 1280, 720),
        text: `${body}\n${paragraph}`,
        charCount: body.length + paragraph.length + 1,
      };

      const out = detectPageWarnings(p);
      expect(out.filter((w) => w.code === 'reading_order_divergence')).toEqual([]);
    });

    it('does not flag repeated slide chrome emitted last', () => {
      const title = '自己紹介';
      const body = 't-wada';
      const blocks = [
        block(96, 0, 270, 64, { text: title, repeated: true, lines: [line(title, 96, 0, 270, 64)] }),
        block(120, 95, 420, 30, { text: body, lines: [line(body, 120, 95, 420, 30)] }),
      ];
      const p = { ...page(blocks, 1920, 1080), text: `${body}\n${title}`, charCount: body.length + title.length + 1 };

      const out = detectPageWarnings(p);
      expect(out.filter((w) => w.code === 'reading_order_divergence')).toEqual([]);
    });

    it('flags glued native text across visual columns in numbered list grids', () => {
      const blocks = [
        block(42, 200, 150, 8, { text: '1. U.S. Passport or U.S. Passport Card' }),
        block(42, 220, 150, 16, { text: '2. Permanent Resident Card or Alien Registration Receipt Card' }),
        block(42, 246, 150, 32, { text: '3. Foreign passport that contains a temporary I-551 stamp' }),
        block(42, 292, 150, 16, { text: '4. Employment Authorization Document that contains a photograph' }),
        block(42, 318, 150, 80, {
          text: '5. For an individual temporarily authorized to work for a specific employer',
        }),
        block(222, 202, 170, 40, { text: "1. Driver's license or ID card issued by a State" }),
        block(222, 260, 170, 40, { text: '2. ID card issued by federal, state or local government agencies' }),
        block(222, 315, 130, 8, { text: '3. School ID card with a photograph' }),
        block(222, 333, 96, 8, { text: "4. Voter's registration card" }),
        block(410, 196, 170, 26, { text: '1. A Social Security Account Number card' }),
        block(410, 302, 160, 8, { text: '2. Certification of report of birth issued by the Department of State' }),
        block(410, 336, 160, 8, { text: '3. Original or certified copy of birth certificate' }),
        block(410, 381, 126, 8, { text: '4. Native American tribal document' }),
      ];
      const p = {
        ...page(blocks, 612, 792),
        text:
          'LISTS OF ACCEPTABLE DOCUMENTS\n' +
          "1. Driver's license or ID card issued by a State\n" +
          '3. School ID card with a photograph5. For an individual temporarily authorized\n' +
          'to work for a specific employer because of his or her status or parole',
      };

      const out = detectPageWarnings(p);
      const divergence = out.find((w) => w.code === 'reading_order_divergence');
      expect(divergence).toMatchObject({ severity: 'warning', blockIndex: 7 });
      expect(divergence?.message).toContain('columnar list');
      expect(divergence?.message).toContain('School ID card');
    });

    it('does not flag columnar numbered lists when native item boundaries remain separated', () => {
      const blocks = [
        block(42, 200, 150, 8, { text: '1. U.S. Passport or U.S. Passport Card' }),
        block(42, 220, 150, 16, { text: '2. Permanent Resident Card or Alien Registration Receipt Card' }),
        block(42, 318, 150, 80, {
          text: '5. For an individual temporarily authorized to work for a specific employer',
        }),
        block(222, 202, 170, 40, { text: "1. Driver's license or ID card issued by a State" }),
        block(222, 315, 130, 8, { text: '3. School ID card with a photograph' }),
        block(222, 333, 96, 8, { text: "4. Voter's registration card" }),
        block(410, 196, 170, 26, { text: '1. A Social Security Account Number card' }),
        block(410, 302, 160, 8, { text: '2. Certification of report of birth issued by the Department of State' }),
        block(410, 336, 160, 8, { text: '3. Original or certified copy of birth certificate' }),
      ];
      const p = {
        ...page(blocks, 612, 792),
        text:
          'LISTS OF ACCEPTABLE DOCUMENTS\n' +
          '3. School ID card with a photograph\n' +
          '5. For an individual temporarily authorized to work for a specific employer',
      };

      const out = detectPageWarnings(p);
      expect(out.filter((w) => w.code === 'reading_order_divergence')).toEqual([]);
    });

    it('flags form labels whose native text order differs from visual layout order', () => {
      const labels = [
        block(32, 19, 94, 10, { text: 'Check box, unchecked' }),
        block(32, 46, 83, 10, { text: 'Check box, checked' }),
        block(32, 73, 88, 10, { text: 'Check box, read-only' }),
      ];
      const p: PageResult = {
        ...page(labels),
        text: 'Check box, unchecked\nCheck box, read-only\nCheck box, checked',
        formFields: labels.map((label, index) => ({
          name: `checkbox${index}`,
          type: 'checkbox',
          x: 20,
          y: label.y,
          width: 10,
          height: 10,
          label: {
            text: label.text,
            relation: 'right',
            x: label.x,
            y: label.y,
            width: label.width,
            height: label.height,
          },
        })),
      };

      const out = detectPageWarnings(p);
      const divergence = out.find((w) => w.code === 'reading_order_divergence');
      expect(divergence).toMatchObject({
        blockIndex: 2,
        severity: 'warning',
      });
      expect(divergence?.message).toContain('native form text order diverges');
    });

    it('does not flag headings that are late in BOTH orders (right-column section heads)', () => {
      // A section heading at the top of the right column is visually
      // high on the page but legitimately late in the reading flow.
      const body = 'Body paragraph text for the left column. '.repeat(30);
      const heading = 'Modeling the Framework for False Positives';
      const blocks = [
        block(45, 50, 156, 600, { text: body }),
        block(219, 50, 153, 20, { text: heading, role: 'heading' }),
        block(219, 80, 153, 570, { text: body }),
        block(393, 50, 156, 600, { text: body }),
      ];
      const p = { ...page(blocks, 594, 783), text: `${body}${heading}${body}${body}` };
      const out = detectPageWarnings(p);
      expect(out.filter((w) => w.code === 'reading_order_divergence')).toEqual([]);
    });

    it('flags bottom notes that appear at the start of the native text stream', () => {
      // Chinese journal PDF-shaped case: the visual page begins with
      // the article title, but the producer emits bottom submission
      // notes before the title and body in pages[].text.
      const title = 'Comparison of Metformin and Polyene Phosphatidylcholine';
      const body = 'Main article body text follows the visible title and abstract. '.repeat(18);
      const bottomNote = 'Received date: 2014-11-03';
      const blocks = [
        block(40, 20, 300, 12, { text: 'Journal running header' }),
        block(80, 64, 360, 32, { text: title, role: 'heading' }),
        block(40, 120, 420, 470, { text: body }),
        block(20, 716, 260, 18, { text: bottomNote }),
      ];
      const p = { ...page(blocks, 501, 740), text: `${bottomNote}\n${title}\n${body}` };

      const out = detectPageWarnings(p);
      const divergence = out.find((w) => w.code === 'reading_order_divergence');
      expect(divergence).toMatchObject({ severity: 'warning', blockIndex: 3 });
      expect(divergence?.message).toContain('bottom block');
    });

    it('flags right sidebars that appear at the start of the native text stream', () => {
      // PDF.js marked-content financial report-shaped case: the visual
      // flow starts with the main article, but the native stream begins
      // with a right-sidebar guidance card.
      const leftBody = 'Main article text begins on the left and continues through the first column. '.repeat(18);
      const middleBody = 'Second column continues the article before the sidebar should be read. '.repeat(18);
      const sidebarHeading = 'Guidance';
      const sidebarBody =
        'Kreate estimates that its revenue in 2025 will increase and be in the range of 290-310 MEUR.';
      const blocks = [
        block(27, 61, 294, 450, { text: leftBody }),
        block(335, 61, 294, 450, { text: middleBody }),
        block(670, 426, 49, 12, { text: sidebarHeading, role: 'heading' }),
        block(670, 445, 245, 28, { text: sidebarBody }),
      ];
      const p = {
        ...page(blocks, 960, 540),
        text: `${sidebarHeading} ${sidebarBody}\n${leftBody}\n${middleBody}`,
      };

      const out = detectPageWarnings(p);
      const divergence = out.find((w) => w.code === 'reading_order_divergence');
      expect(divergence).toMatchObject({ severity: 'warning', blockIndex: 2 });
      expect(divergence?.message).toContain('side block');
    });

    it('does not flag bottom headings only referenced near the start of the native text stream', () => {
      // IRS W-9-shaped case: the top instructions refer to "Purpose
      // of Form" before the actual bottom section. A one-line heading
      // probe would confuse the cross-reference with the section.
      const body = 'Main form field text and instructions before the bottom explanation. '.repeat(25);
      const bottomHeading = 'Purpose of Form';
      const bottomBody = 'An individual or entity requester files an information return with the IRS.';
      const blocks = [
        block(36, 40, 260, 20, { text: 'Request for Taxpayer Identification Number', role: 'heading' }),
        block(36, 80, 260, 500, { text: body }),
        block(316, 618, 246, 72, { text: 'New line instructions continue in the right column.' }),
        block(316, 704, 96, 12, { text: bottomHeading, role: 'heading' }),
        block(316, 722, 246, 18, { text: bottomBody }),
      ];
      const p = {
        ...page(blocks, 612, 792),
        text: `Request for Taxpayer Identification Number\nBefore you begin, see ${bottomHeading}, below.\n${body}\nNew line instructions continue in the right column.\n${bottomHeading}\n${bottomBody}`,
      };

      const out = detectPageWarnings(p);
      expect(out.filter((w) => w.code === 'reading_order_divergence')).toEqual([]);
    });

    it('does not flag repeated side/footer labels that also appear in the header', () => {
      // IRS Form 1040-shaped case: the same form label appears in both
      // the top header and the bottom footer. A late footer block should
      // not bind to the first native occurrence and look like a reading
      // order divergence.
      const formLabel = 'Form 1040 (2024)';
      const body = 'Tax and credits line item text follows in visual order. '.repeat(24);
      const blocks = [
        block(36, 24, 110, 10, { text: formLabel }),
        block(36, 72, 470, 260, { text: body.slice(0, 520) }),
        block(36, 350, 470, 260, { text: body.slice(520) }),
        block(540, 760, 60, 10, { text: formLabel }),
      ];
      const p = {
        ...page(blocks, 612, 792),
        text: `${formLabel} Page 2\n${body}\n${formLabel}`,
      };

      const out = detectPageWarnings(p);
      expect(out.filter((w) => w.code === 'reading_order_divergence')).toEqual([]);
    });

    it('flags body text emitted before a preceding figure caption after repeated headers are removed', () => {
      // PLOS Biology-shaped case: cross-page chrome detection removes
      // the running header signal, but pages[].text can still start with
      // lower body text before the visually preceding figure caption.
      const caption =
        'Fig 1. Comparison of different host prediction approaches on a single test dataset. Total number of predictions and number of correct predictions.';
      const body =
        'correct from incorrect predictions, while the scores provided by alignment-free tools are usually not sufficient to identify correct predictions.';
      const p = {
        ...page(
          [
            block(35, 35, 80, 11, { text: 'PLOS BIOLOGY', repeated: true }),
            block(72, 285, 450, 100, { text: caption }),
            block(200, 396, 300, 309, { text: body }),
            block(36, 748, 440, 8, {
              text: 'PLOS Biology | https://doi.org/10.1371/journal.pbio.3002083',
              repeated: true,
            }),
          ],
          612,
          792,
        ),
        text: `${body}\n${caption}`,
      };

      const out = detectPageWarnings(p);
      const divergence = out.find((w) => w.code === 'reading_order_divergence');
      expect(divergence).toMatchObject({ severity: 'warning', blockIndex: 2 });
      expect(divergence?.message).toContain('native block order diverges');
      expect(divergence?.message).toContain('correct from incorrect predictions');
    });

    it('does not flag form label fragments that start with punctuation', () => {
      // IRS Form 1040-shaped inline prompts can attach small text
      // fragments around year/date boxes, such as ", 2025, ending".
      // These are not useful probes for page-level reading order.
      const labels = [
        block(36, 80, 140, 10, { text: 'Foreign province/state/county' }),
        block(318, 90, 70, 10, { text: ', 2025, ending' }),
        block(36, 110, 100, 10, { text: 'Taxpayer address' }),
      ];
      const p: PageResult = {
        ...page(labels),
        text: ', 2025, ending Foreign province/state/county Taxpayer address',
        formFields: labels.map((label, index) => ({
          name: `field${index}`,
          type: 'text',
          x: label.x + label.width + 4,
          y: label.y,
          width: 40,
          height: 10,
          label: {
            text: label.text,
            relation: 'left',
            x: label.x,
            y: label.y,
            width: label.width,
            height: label.height,
          },
        })),
      };

      const out = detectPageWarnings(p);
      expect(out.filter((w) => w.code === 'reading_order_divergence')).toEqual([]);
    });

    it('flags compact math blocks whose native text stream reorders visible characters', () => {
      // PDF.js bug2004951-shaped case: the visual line is "3√x + y",
      // but the native text stream can emit the superscript after the
      // baseline expression as "√x + y3".
      const blocks = [
        block(72, 88, 85, 20, { text: '1 Example', role: 'heading' }),
        block(72, 121, 52, 12, { text: 'Some text' }),
        block(288, 148, 37, 13, { text: '3√x + y' }),
      ];
      const p = {
        ...page(blocks, 612, 792),
        text: '1 Example\nSome text\n√x + y3',
        charCount: 27,
        vectorCount: 1,
        quality: { nativeTextStatus: 'sparse_text_with_visual_content' as const },
      };

      const out = detectPageWarnings(p);
      const divergence = out.find((w) => w.code === 'reading_order_divergence');
      expect(divergence).toMatchObject({ severity: 'warning', blockIndex: 2 });
      expect(divergence?.message).toContain('3√x + y');
      // Pinned as a literal, not built from the constant: `message` is a
      // public field that JSON, XML, and TOON serialize verbatim, so this
      // is the guard against rewording it by accident.
      expect(divergence?.message.endsWith('prefer layout.blocks order when exact sequence matters')).toBe(true);
    });

    it('does not flag compact math blocks when native and visual order agree', () => {
      const blocks = [
        block(72, 88, 85, 20, { text: '1 Example', role: 'heading' }),
        block(288, 148, 37, 13, { text: '3√x + y' }),
      ];
      const p = { ...page(blocks, 612, 792), text: '1 Example\n3√x + y', charCount: 17 };
      const out = detectPageWarnings(p);
      expect(out.filter((w) => w.code === 'reading_order_divergence')).toEqual([]);
    });

    it('does not treat form date placeholder slashes as compact math order divergence', () => {
      const dateLabel = 'Deceased MM / DD / YYYY Spouse MM / DD / YYYY';
      const blocks = [
        block(72, 88, 85, 20, { text: 'Form 1040', role: 'heading' }),
        block(385, 61, 189, 7, { text: dateLabel }),
      ];
      const p = {
        ...page(blocks, 612, 792),
        text: `Form 1040\nDeceased MM DD YYYY Spouse MM DD YYYY////`,
        charCount: 58,
        vectorCount: 502,
      };
      const out = detectPageWarnings(p);
      expect(out.filter((w) => w.code === 'reading_order_divergence')).toEqual([]);
    });

    it('flags line order divergence inside a reconstructed layout block', () => {
      const lines = [
        line('1 Helvetica Helvetica Helvetica Helvetica H', 50, 362, 573, 30),
        line('2 Arial Arial Arial Arial Arial Arial Arial', 50, 412, 495, 30),
        line('3 Helvetica Helvetica Helvetica', 50, 462, 412, 30),
        line('4 Arial Arial Arial Arial Arial Arial', 50, 512, 427, 30),
      ];
      const visualText = lines.map((item) => item.text).join('\n');
      const p = {
        ...page([block(50, 362, 573, 180, { text: visualText, lines })], 612, 792),
        text: `${lines[1].text}\n${lines[0].text}\n${lines[3].text}\n${lines[2].text}`,
      };

      const out = detectPageWarnings(p);
      const divergence = out.find((w) => w.code === 'reading_order_divergence');
      expect(divergence).toMatchObject({ severity: 'warning', blockIndex: 0 });
      expect(divergence?.message).toContain('native line order diverges');
    });

    it('does not flag line order divergence when line probes are ambiguous in native text', () => {
      const lines = [
        line('layout analysis locates each image region', 50, 120, 240, 12),
        line('the corresponding image than other text', 50, 136, 240, 12),
        line('et al., 2023).', 50, 152, 80, 12),
      ];
      const visualText = lines.map((item) => item.text).join('\n');
      const p = {
        ...page([block(50, 120, 240, 46, { text: visualText, lines })], 612, 792),
        text: `Earlier citation et al., 2023). ${visualText}`,
      };

      const out = detectPageWarnings(p);
      expect(out.filter((w) => w.code === 'reading_order_divergence')).toEqual([]);
    });
  });
});
