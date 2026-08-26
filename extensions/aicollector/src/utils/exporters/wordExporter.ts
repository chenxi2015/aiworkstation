/**
 * Word (.docx) document exporter with deep DOM tree traversal,
 * stylish table conversions, responsive image formatting, and typography styling.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  BorderStyle,
  WidthType,
  ShadingType,
  ImageRun,
  AlignmentType,
  ExternalHyperlink,
} from 'docx';
import type { GrabbedContent } from '../../types';
import { parseHtmlToFlowBlocks, type FlowBlock } from '../contentImageGenerator';
import { fetchImageDataUrl } from '../imageDownloader';
import { downloadBlob, cleanDocumentTitle } from './exportUtils';

interface InlineFormatOptions {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  underline?: boolean;
  color?: string;
  font?: string;
  size?: number;
  highlight?: string;
}

/**
 * Recursively extracts formatted text runs and hyperlinks from an inline DOM element
 */
function extractInlineNodes(
  node: Node,
  format: InlineFormatOptions = {},
): (TextRun | ExternalHyperlink)[] {
  const runs: (TextRun | ExternalHyperlink)[] = [];

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    if (text) {
      runs.push(
        new TextRun({
          text,
          bold: format.bold,
          italics: format.italics,
          strike: format.strike,
          underline: format.underline ? {} : undefined,
          color: format.color,
          font: format.font || 'PingFang SC',
          size: format.size || 22, // 11pt in half-points
          shading: format.highlight
            ? {
                type: ShadingType.CLEAR,
                fill: format.highlight,
                color: 'auto',
              }
            : undefined,
        }),
      );
    }
    return runs;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // Skip invisible tags
    if (['script', 'style', 'noscript', 'svg', 'canvas'].includes(tag)) {
      return runs;
    }

    if (tag === 'br') {
      runs.push(new TextRun({ text: '\n', break: 1 }));
      return runs;
    }

    if (tag === 'a') {
      const href = el.getAttribute('href');
      const innerRuns: TextRun[] = [];
      el.childNodes.forEach((child) => {
        const childNodes = extractInlineNodes(child, {
          ...format,
          color: '2563EB',
          underline: true,
        });
        childNodes.forEach((n) => {
          if (n instanceof TextRun) innerRuns.push(n);
        });
      });

      if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:'))) {
        runs.push(
          new ExternalHyperlink({
            children: innerRuns.length > 0 ? innerRuns : [new TextRun({ text: href, color: '2563EB', underline: {} })],
            link: href,
          }),
        );
      } else {
        runs.push(...innerRuns);
      }
      return runs;
    }

    const nextFormat: InlineFormatOptions = { ...format };
    if (tag === 'strong' || tag === 'b') nextFormat.bold = true;
    if (tag === 'em' || tag === 'i') nextFormat.italics = true;
    if (tag === 's' || tag === 'del' || tag === 'strike') nextFormat.strike = true;
    if (tag === 'u') nextFormat.underline = true;
    if (tag === 'mark') nextFormat.highlight = 'FEF08A';
    if (tag === 'code') {
      nextFormat.font = 'Consolas';
      nextFormat.color = '0284C7';
      nextFormat.size = format.size ? format.size - 2 : 20;
    }

    el.childNodes.forEach((child) => {
      runs.push(...extractInlineNodes(child, nextFormat));
    });
  }

  return runs;
}

/**
 * Converts an HTML Table Element to a Docx Table with stylish borders & shading
 */
function convertHtmlTableToDocx(tableEl: HTMLElement): Table {
  const rows: TableRow[] = [];
  const trElements = Array.from(tableEl.querySelectorAll('tr'));

  const borderStyle = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: 'CBD5E1',
  };

  trElements.forEach((tr, rowIndex) => {
    const cells: TableCell[] = [];
    const cellElements = Array.from(tr.querySelectorAll('th, td'));

    cellElements.forEach((cell) => {
      const isHeader = cell.tagName.toLowerCase() === 'th' || rowIndex === 0;
      const textRuns = extractInlineNodes(cell, { bold: isHeader });

      cells.push(
        new TableCell({
          children: [
            new Paragraph({
              children: textRuns.length > 0 ? textRuns : [new TextRun('')],
              spacing: { before: 80, after: 80 },
            }),
          ],
          shading: isHeader
            ? {
                type: ShadingType.CLEAR,
                fill: 'F1F5F9',
                color: 'auto',
              }
            : rowIndex % 2 === 1
            ? {
                type: ShadingType.CLEAR,
                fill: 'FAFAFA',
                color: 'auto',
              }
            : undefined,
          borders: {
            top: borderStyle,
            bottom: borderStyle,
            left: borderStyle,
            right: borderStyle,
          },
          margins: {
            top: 120,
            bottom: 120,
            left: 160,
            right: 160,
          },
        }),
      );
    });

    if (cells.length > 0) {
      rows.push(
        new TableRow({
          children: cells,
          tableHeader: rowIndex === 0,
        }),
      );
    }
  });

  return new Table({
    rows: rows.length > 0 ? rows : [new TableRow({ children: [new TableCell({ children: [] })] })],
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
  });
}

interface ProcessedDocxImage {
  buffer: Uint8Array;
  width: number;
  height: number;
  type: 'png' | 'jpg' | 'gif';
}

/**
 * Loads image, scales within max printable width, and converts to binary buffer
 */
async function fetchImageForDocx(
  src: string,
  pageUrl?: string,
  maxWidth = 520,
  maxHeight = 460,
): Promise<ProcessedDocxImage | null> {
  if (!src) return null;
  try {
    let resolvedUrl = src;
    if (pageUrl && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:') && !src.startsWith('blob:')) {
      try {
        resolvedUrl = new URL(src, pageUrl).toString();
      } catch {
        resolvedUrl = src;
      }
    }

    const dataUrl = await fetchImageDataUrl(resolvedUrl, pageUrl);

    // 1. Get natural dimensions via Image object
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = dataUrl;
    });

    if (dimensions.width < 16 || dimensions.height < 16) {
      return null; // Skip tiny tracking pixels / spacers
    }

    // 2. Scale aspect ratio
    const aspect = dimensions.width / dimensions.height;
    let targetWidth = dimensions.width;
    let targetHeight = dimensions.height;

    if (targetWidth > maxWidth) {
      targetWidth = maxWidth;
      targetHeight = Math.round(maxWidth / aspect);
    }
    if (targetHeight > maxHeight) {
      targetHeight = maxHeight;
      targetWidth = Math.round(maxHeight * aspect);
    }

    // 3. Determine image MIME format
    let type: 'png' | 'jpg' | 'gif' = 'png';
    if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg') || resolvedUrl.match(/\.(jpe?g)/i)) {
      type = 'jpg';
    } else if (dataUrl.startsWith('data:image/gif') || resolvedUrl.match(/\.gif/i)) {
      type = 'gif';
    }

    // 4. Convert dataUrl or URL to Uint8Array
    let buffer: Uint8Array;
    if (dataUrl.startsWith('data:')) {
      const base64 = dataUrl.split(',')[1] || '';
      const binaryString = atob(base64);
      buffer = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        buffer[i] = binaryString.charCodeAt(i);
      }
    } else {
      const res = await fetch(dataUrl);
      const arrayBuf = await res.arrayBuffer();
      buffer = new Uint8Array(arrayBuf);
    }

    return {
      buffer,
      width: targetWidth,
      height: targetHeight,
      type,
    };
  } catch (err) {
    console.warn('Failed to process image for Word export:', src, err);
    return null;
  }
}

/**
 * Creates image paragraph for Docx document with optional caption
 */
function createImageDocxParagraphs(imgData: ProcessedDocxImage, altText?: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  paragraphs.push(
    new Paragraph({
      children: [
        new ImageRun({
          data: imgData.buffer,
          transformation: {
            width: imgData.width,
            height: imgData.height,
          },
          type: imgData.type,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 180, after: altText ? 60 : 180 },
    }),
  );

  if (altText && altText.trim() && altText.length < 80 && !altText.startsWith('http')) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: altText.trim(),
            italics: true,
            size: 18, // 9pt
            color: '64748B',
            font: 'PingFang SC',
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 180 },
      }),
    );
  }

  return paragraphs;
}

/**
 * Recursively converts DOM elements into structured docx Paragraphs, Tables, and Images
 */
async function convertHtmlNodeToDocxElements(
  node: Node,
  pageUrl?: string,
): Promise<(Paragraph | Table)[]> {
  const elements: (Paragraph | Table)[] = [];

  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent || '').trim();
    if (text) {
      elements.push(
        new Paragraph({
          children: [
            new TextRun({
              text,
              font: 'PingFang SC',
              size: 22,
              color: '1E293B',
            }),
          ],
          spacing: { after: 140, line: 360 },
        }),
      );
    }
    return elements;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return elements;
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  // 1. Skip non-content tags
  if (['script', 'style', 'noscript', 'svg', 'canvas'].includes(tag)) {
    return elements;
  }

  // 2. Direct Image
  if (tag === 'img') {
    const src = (el as HTMLImageElement).src || el.getAttribute('src') || '';
    const alt = (el as HTMLImageElement).alt || el.getAttribute('alt') || el.getAttribute('title') || '';
    if (src) {
      const imgData = await fetchImageForDocx(src, pageUrl);
      if (imgData) {
        elements.push(...createImageDocxParagraphs(imgData, alt));
      }
    }
    return elements;
  }

  // 3. Headings (h1 - h6)
  if (/^h[1-6]$/.test(tag)) {
    const levelNum = parseInt(tag[1] || '2', 10);
    const headingLevels = [
      HeadingLevel.HEADING_1,
      HeadingLevel.HEADING_2,
      HeadingLevel.HEADING_3,
      HeadingLevel.HEADING_4,
      HeadingLevel.HEADING_5,
      HeadingLevel.HEADING_6,
    ];
    const sizes = [32, 28, 24, 22, 20, 20]; // 16pt, 14pt, 12pt, 11pt, 10pt, 10pt
    const beforeSpacings = [240, 200, 160, 120, 100, 100];
    const afterSpacings = [120, 100, 80, 60, 60, 60];

    const inlineRuns = extractInlineNodes(el, {
      bold: true,
      size: sizes[levelNum - 1],
      color: levelNum === 1 ? '0F172A' : levelNum === 2 ? '1E293B' : '334155',
    });

    if (inlineRuns.length > 0) {
      elements.push(
        new Paragraph({
          children: inlineRuns,
          heading: headingLevels[levelNum - 1] || HeadingLevel.HEADING_2,
          spacing: {
            before: beforeSpacings[levelNum - 1] || 160,
            after: afterSpacings[levelNum - 1] || 80,
          },
        }),
      );
    }
    return elements;
  }

  // 4. Blockquote
  if (tag === 'blockquote') {
    const inlineRuns = extractInlineNodes(el, { italics: true, color: '334155' });
    if (inlineRuns.length > 0) {
      elements.push(
        new Paragraph({
          children: inlineRuns,
          indent: { left: 480 },
          border: {
            left: {
              style: BorderStyle.SINGLE,
              size: 16,
              color: '3B82F6',
              space: 8,
            },
          },
          shading: {
            type: ShadingType.CLEAR,
            fill: 'F8FAFC',
            color: 'auto',
          },
          spacing: { before: 120, after: 160, line: 340 },
        }),
      );
    }
    return elements;
  }

  // 5. Code Block
  if (tag === 'pre') {
    const rawCode = el.textContent || '';
    if (rawCode.trim()) {
      elements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: rawCode,
              font: 'Consolas',
              size: 19,
              color: '0F172A',
            }),
          ],
          shading: {
            type: ShadingType.CLEAR,
            fill: 'F1F5F9',
            color: 'auto',
          },
          indent: { left: 240, right: 240 },
          spacing: { before: 100, after: 140 },
        }),
      );
    }
    return elements;
  }

  // 6. Lists (ul, ol)
  if (tag === 'ul' || tag === 'ol') {
    const isOrdered = tag === 'ol';
    const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li');

    for (let idx = 0; idx < items.length; idx++) {
      const li = items[idx];
      if (!li) continue;

      const imgInLi = li.querySelector('img');
      if (imgInLi) {
        const src = imgInLi.src || imgInLi.getAttribute('src') || '';
        const alt = imgInLi.alt || imgInLi.getAttribute('alt') || '';
        if (src) {
          const imgData = await fetchImageForDocx(src, pageUrl);
          if (imgData) {
            elements.push(...createImageDocxParagraphs(imgData, alt));
          }
        }
      }

      const prefix = isOrdered ? `${idx + 1}. ` : '• ';
      const runs = extractInlineNodes(li);
      if (runs.length > 0) {
        elements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: prefix,
                bold: isOrdered,
                font: 'PingFang SC',
                size: 22,
                color: isOrdered ? '2563EB' : '64748B',
              }),
              ...runs,
            ],
            indent: { left: 400 },
            spacing: { after: 100, line: 340 },
          }),
        );
      }
    }
    return elements;
  }

  // 7. Table
  if (tag === 'table') {
    elements.push(convertHtmlTableToDocx(el));
    elements.push(new Paragraph({ spacing: { after: 140 } }));
    return elements;
  }

  // 8. Horizontal Rule (hr)
  if (tag === 'hr') {
    elements.push(
      new Paragraph({
        border: {
          bottom: {
            style: BorderStyle.SINGLE,
            size: 2,
            color: 'E2E8F0',
            space: 4,
          },
        },
        spacing: { before: 160, after: 160 },
      }),
    );
    return elements;
  }

  // 9. Paragraph (<p>)
  if (tag === 'p') {
    const imagesInP = Array.from(el.querySelectorAll('img'));
    if (imagesInP.length > 0) {
      for (const imgEl of imagesInP) {
        const src = imgEl.src || imgEl.getAttribute('src') || '';
        const alt = imgEl.alt || imgEl.getAttribute('alt') || '';
        if (src) {
          const imgData = await fetchImageForDocx(src, pageUrl);
          if (imgData) {
            elements.push(...createImageDocxParagraphs(imgData, alt));
          }
        }
      }

      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('img').forEach((img) => img.remove());
      const remainingRuns = extractInlineNodes(clone);
      if (remainingRuns.length > 0 && clone.textContent?.trim()) {
        elements.push(
          new Paragraph({
            children: remainingRuns,
            spacing: { after: 140, line: 360 },
          }),
        );
      }
      return elements;
    }

    const inlineRuns = extractInlineNodes(el);
    if (inlineRuns.length > 0) {
      elements.push(
        new Paragraph({
          children: inlineRuns,
          spacing: { after: 140, line: 360 },
        }),
      );
    }
    return elements;
  }

  // 10. Container elements (div, section, article, main, figure, aside, header, footer, etc.)
  const containerTags = [
    'div',
    'section',
    'article',
    'main',
    'figure',
    'figcaption',
    'aside',
    'header',
    'footer',
    'form',
    'fieldset',
    'details',
    'summary',
  ];

  if (containerTags.includes(tag) || el.children.length > 0) {
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      if (child) {
        const childElements = await convertHtmlNodeToDocxElements(child, pageUrl);
        elements.push(...childElements);
      }
    }
    return elements;
  }

  // 11. Fallback for leaf inline elements
  const leafRuns = extractInlineNodes(el);
  if (leafRuns.length > 0) {
    elements.push(
      new Paragraph({
        children: leafRuns,
        spacing: { after: 140, line: 360 },
      }),
    );
  }

  return elements;
}

/**
 * Converts structured FlowBlocks into Docx elements as fallback or direct source
 */
async function convertFlowBlocksToDocxElements(
  blocks: FlowBlock[],
  pageUrl?: string,
): Promise<(Paragraph | Table)[]> {
  const elements: (Paragraph | Table)[] = [];

  for (const block of blocks) {
    if (block.type === 'heading') {
      const level = block.level || 2;
      const headingLevels = [
        HeadingLevel.HEADING_1,
        HeadingLevel.HEADING_2,
        HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4,
        HeadingLevel.HEADING_5,
        HeadingLevel.HEADING_6,
      ];
      const sizes = [32, 28, 24, 22, 20, 20];
      elements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: block.text,
              bold: true,
              size: sizes[level - 1] || 24,
              color: level === 1 ? '0F172A' : '1E293B',
              font: 'PingFang SC',
            }),
          ],
          heading: headingLevels[level - 1] || HeadingLevel.HEADING_2,
          spacing: { before: 180, after: 90 },
        }),
      );
    } else if (block.type === 'paragraph') {
      const lines = block.text.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          elements.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: line.trim(),
                  font: 'PingFang SC',
                  size: 22,
                  color: '1E293B',
                }),
              ],
              spacing: { after: 140, line: 360 },
            }),
          );
        }
      }
    } else if (block.type === 'blockquote') {
      elements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: block.text,
              italics: true,
              color: '334155',
              font: 'PingFang SC',
              size: 22,
            }),
          ],
          indent: { left: 480 },
          border: {
            left: {
              style: BorderStyle.SINGLE,
              size: 16,
              color: '3B82F6',
              space: 8,
            },
          },
          shading: {
            type: ShadingType.CLEAR,
            fill: 'F8FAFC',
            color: 'auto',
          },
          spacing: { before: 120, after: 160 },
        }),
      );
    } else if (block.type === 'list-item') {
      elements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: '• ',
              bold: true,
              color: '2563EB',
              font: 'PingFang SC',
              size: 22,
            }),
            new TextRun({
              text: block.text,
              font: 'PingFang SC',
              size: 22,
              color: '1E293B',
            }),
          ],
          indent: { left: 400 },
          spacing: { after: 80 },
        }),
      );
    } else if (block.type === 'image' && block.src) {
      const imgData = await fetchImageForDocx(block.src, pageUrl);
      if (imgData) {
        elements.push(...createImageDocxParagraphs(imgData, block.alt));
      }
    }
  }

  return elements;
}

/**
 * Export HTML content and structured data as a rich Microsoft Word (.docx) document
 */
export async function exportWord(
  title: string,
  htmlContent: string,
  filename = 'document.docx',
  pageUrl?: string,
  grabbedContent?: GrabbedContent,
): Promise<void> {
  const cleanTitle = cleanDocumentTitle(title);
  const finalName = filename.endsWith('.docx') ? filename : `${filename}.docx`;
  const exportDate = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const children: (Paragraph | Table)[] = [];

  // 1. Document Title Header
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: cleanTitle || '选区文档',
          bold: true,
          size: 36, // 18pt
          color: '0F172A',
          font: 'PingFang SC',
        }),
      ],
      heading: HeadingLevel.TITLE,
      spacing: { before: 100, after: 120 },
    }),
  );

  // 2. Metadata (Source URL & Export Time)
  const metaRuns: (TextRun | ExternalHyperlink)[] = [];
  if (pageUrl) {
    metaRuns.push(
      new TextRun({
        text: '来源网页: ',
        size: 18, // 9pt
        color: '64748B',
        font: 'PingFang SC',
      }),
    );
    metaRuns.push(
      new ExternalHyperlink({
        children: [
          new TextRun({
            text: pageUrl,
            size: 18,
            color: '2563EB',
            underline: {},
            font: 'PingFang SC',
          }),
        ],
        link: pageUrl,
      }),
    );
    metaRuns.push(
      new TextRun({
        text: '   |   ',
        size: 18,
        color: 'CBD5E1',
        font: 'PingFang SC',
      }),
    );
  }

  metaRuns.push(
    new TextRun({
      text: `采集时间: ${exportDate}`,
      size: 18,
      color: '64748B',
      font: 'PingFang SC',
    }),
  );

  children.push(
    new Paragraph({
      children: metaRuns,
      spacing: { after: 260 },
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 6,
          color: '3B82F6',
          space: 8,
        },
      },
    }),
  );

  // 3. Process Content Body via Deep DOM Traversal
  let contentElements: (Paragraph | Table)[] = [];

  if (htmlContent && htmlContent.trim()) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      for (let i = 0; i < doc.body.childNodes.length; i++) {
        const node = doc.body.childNodes[i];
        if (node) {
          const subElements = await convertHtmlNodeToDocxElements(node, pageUrl);
          contentElements.push(...subElements);
        }
      }
    } catch (err) {
      console.warn('DOM parser failed for exportWord, falling back to FlowBlocks:', err);
    }
  }

  // 4. Fallback to Structured FlowBlocks if HTML produced few or empty elements
  if (contentElements.length === 0) {
    if (grabbedContent) {
      const flowBlocks = parseHtmlToFlowBlocks(
        grabbedContent.selectedHtml,
        grabbedContent.selectedText,
        grabbedContent.images || [],
      );
      contentElements = await convertFlowBlocksToDocxElements(flowBlocks, pageUrl);
    } else if (htmlContent) {
      const flowBlocks = parseHtmlToFlowBlocks(htmlContent, '', []);
      contentElements = await convertFlowBlocksToDocxElements(flowBlocks, pageUrl);
    }
  }

  children.push(...contentElements);

  // Fallback if still empty
  if (children.length <= 2) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: grabbedContent?.selectedText || '（暂无正文内容）',
            font: 'PingFang SC',
            size: 22,
            color: '64748B',
          }),
        ],
      }),
    );
  }

  const wordDoc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        children,
      },
    ],
  });

  const docxBlob = await Packer.toBlob(wordDoc);
  downloadBlob(docxBlob, finalName);
}
