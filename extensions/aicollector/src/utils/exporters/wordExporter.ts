/**
 * Word (.docx) document exporter powered by Document AST Engine
 * Transforms structured, clean DocumentAST blocks into Microsoft Word (.docx) documents.
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
import type {
  DocumentAST,
  BlockNode,
  InlineNode,
  HeadingBlock,
  ParagraphBlock,
  QuoteBlock,
  CodeBlock,
  ListBlock,
  ListItemBlock,
  ImageBlock,
  VideoBlock,
  TableBlock,
  DividerBlock,
} from '../ast/types';
import { convertGrabbedToAst, parseHtmlToAst, applyTransforms, defaultAstTransforms } from '../ast';
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
 * Converts AST inline node into docx TextRun or ExternalHyperlink
 */
function convertInlineNodeToRuns(
  node: InlineNode,
  format: InlineFormatOptions = {},
): (TextRun | ExternalHyperlink)[] {
  if (node.type === 'text') {
    if (!node.value) return [];
    return [
      new TextRun({
        text: node.value,
        bold: format.bold,
        italics: format.italics,
        strike: format.strike,
        underline: format.underline ? {} : undefined,
        color: format.color,
        font: format.font || 'PingFang SC',
        size: format.size || 22, // 11pt
        shading: format.highlight
          ? {
              type: ShadingType.CLEAR,
              fill: format.highlight,
              color: 'auto',
            }
          : undefined,
      }),
    ];
  }

  if (node.type === 'inline_code') {
    return [
      new TextRun({
        text: node.value,
        font: 'Consolas',
        color: '0284C7',
        size: 20,
        shading: {
          type: ShadingType.CLEAR,
          fill: 'F1F5F9',
          color: 'auto',
        },
      }),
    ];
  }

  if (node.type === 'formatted') {
    const nextFormat: InlineFormatOptions = {
      ...format,
      bold: node.bold !== undefined ? node.bold : format.bold,
      italics: node.italic !== undefined ? node.italic : format.italics,
      strike: node.strikethrough !== undefined ? node.strikethrough : format.strike,
    };
    const runs: (TextRun | ExternalHyperlink)[] = [];
    for (const child of node.children) {
      runs.push(...convertInlineNodeToRuns(child, nextFormat));
    }
    return runs;
  }

  if (node.type === 'link') {
    const linkRuns: TextRun[] = [];
    const linkFormat: InlineFormatOptions = {
      ...format,
      color: '2563EB',
      underline: true,
    };
    for (const child of node.children) {
      const childRuns = convertInlineNodeToRuns(child, linkFormat);
      childRuns.forEach((r) => {
        if (r instanceof TextRun) linkRuns.push(r);
      });
    }

    if (
      node.url &&
      (node.url.startsWith('http://') || node.url.startsWith('https://') || node.url.startsWith('mailto:'))
    ) {
      return [
        new ExternalHyperlink({
          children:
            linkRuns.length > 0
              ? linkRuns
              : [new TextRun({ text: node.url, color: '2563EB', underline: {} })],
          link: node.url,
        }),
      ];
    }
    return linkRuns;
  }

  return [];
}

/**
 * Converts an array of AST InlineNodes into docx runs
 */
function convertInlines(
  inlines: InlineNode[],
  format: InlineFormatOptions = {},
): (TextRun | ExternalHyperlink)[] {
  const runs: (TextRun | ExternalHyperlink)[] = [];
  for (const inline of inlines) {
    runs.push(...convertInlineNodeToRuns(inline, format));
  }
  return runs;
}

/**
 * Extracts inline text/formatting recursively from quote content blocks
 */
function extractQuoteInlines(children: (BlockNode | InlineNode)[]): InlineNode[] {
  const inlines: InlineNode[] = [];
  for (const item of children) {
    if (
      item.type === 'text' ||
      item.type === 'link' ||
      item.type === 'formatted' ||
      item.type === 'inline_code'
    ) {
      inlines.push(item as InlineNode);
    } else if (item.type === 'paragraph') {
      inlines.push(...(item as ParagraphBlock).children);
    }
  }
  return inlines;
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
  if (!src || src.startsWith('chrome-extension://') || src.startsWith('moz-extension://')) {
    return null;
  }

  try {
    let resolvedUrl = src;
    if (pageUrl && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
      try {
        resolvedUrl = new URL(src, pageUrl).toString();
      } catch {
        resolvedUrl = src;
      }
    }

    const dataUrl = await fetchImageDataUrl(resolvedUrl, pageUrl);

    // Get natural dimensions via Image object
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = dataUrl;
    });

    if (dimensions.width < 16 || dimensions.height < 16) {
      return null;
    }

    // Scale proportionally
    let renderWidth = dimensions.width;
    let renderHeight = dimensions.height;
    if (renderWidth > maxWidth) {
      const ratio = maxWidth / renderWidth;
      renderWidth = maxWidth;
      renderHeight = Math.round(renderHeight * ratio);
    }
    if (renderHeight > maxHeight) {
      const ratio = maxHeight / renderHeight;
      renderHeight = maxHeight;
      renderWidth = Math.round(renderWidth * ratio);
    }

    const base64Data = dataUrl.split(',')[1] || '';
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    let imgType: 'png' | 'jpg' | 'gif' = 'png';
    if (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')) imgType = 'jpg';
    else if (dataUrl.includes('image/gif')) imgType = 'gif';

    return {
      buffer: bytes,
      width: Math.max(renderWidth, 50),
      height: Math.max(renderHeight, 30),
      type: imgType,
    };
  } catch (err) {
    console.warn(`Docx image loader skipped: ${src}`, err);
    return null;
  }
}

/**
 * Converts AST TableBlock into docx Table
 */
function convertTableBlockToDocx(table: TableBlock): Table {
  const rows: TableRow[] = [];
  const borderStyle = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: 'CBD5E1',
  };

  // Header row
  if (table.headers.length > 0) {
    const headerCells = table.headers.map(
      (headerText) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: headerText,
                  bold: true,
                  font: 'PingFang SC',
                  size: 22,
                  color: '1E293B',
                }),
              ],
              spacing: { before: 80, after: 80 },
            }),
          ],
          shading: {
            type: ShadingType.CLEAR,
            fill: 'F1F5F9',
            color: 'auto',
          },
          borders: {
            top: borderStyle,
            bottom: borderStyle,
            left: borderStyle,
            right: borderStyle,
          },
          margins: { top: 120, bottom: 120, left: 160, right: 160 },
        }),
    );
    rows.push(new TableRow({ children: headerCells, tableHeader: true }));
  }

  // Data rows
  table.rows.forEach((rowCells, rowIndex) => {
    const cells = rowCells.map(
      (cellText) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: cellText,
                  font: 'PingFang SC',
                  size: 22,
                  color: '334155',
                }),
              ],
              spacing: { before: 80, after: 80 },
            }),
          ],
          shading:
            rowIndex % 2 === 1
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
          margins: { top: 120, bottom: 120, left: 160, right: 160 },
        }),
    );

    if (cells.length > 0) {
      rows.push(new TableRow({ children: cells }));
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

/**
 * Converts DocumentAST into docx content elements
 */
async function convertAstToDocxElements(
  ast: DocumentAST,
  pageUrl?: string,
): Promise<(Paragraph | Table)[]> {
  const elements: (Paragraph | Table)[] = [];

  for (const block of ast.children) {
    if (block.type === 'heading') {
      const headingBlock = block as HeadingBlock;
      let headingLevel: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1;
      let fontSize = 32;

      switch (headingBlock.level) {
        case 1:
          headingLevel = HeadingLevel.HEADING_1;
          fontSize = 32; // 16pt
          break;
        case 2:
          headingLevel = HeadingLevel.HEADING_2;
          fontSize = 28; // 14pt
          break;
        case 3:
          headingLevel = HeadingLevel.HEADING_3;
          fontSize = 24; // 12pt
          break;
        default:
          headingLevel = HeadingLevel.HEADING_4;
          fontSize = 22; // 11pt
      }

      const runs = convertInlines(headingBlock.children, {
        bold: true,
        size: fontSize,
        color: '0F172A',
      });

      if (runs.length > 0) {
        elements.push(
          new Paragraph({
            heading: headingLevel,
            children: runs,
            spacing: { before: 240, after: 120 },
          }),
        );
      }
      continue;
    }

    if (block.type === 'paragraph') {
      const runs = convertInlines((block as ParagraphBlock).children);
      if (runs.length > 0) {
        elements.push(
          new Paragraph({
            children: runs,
            spacing: { after: 140, line: 360 },
          }),
        );
      }
      continue;
    }

    if (block.type === 'blockquote') {
      const quoteInlines = extractQuoteInlines((block as QuoteBlock).children);
      const runs = convertInlines(quoteInlines, {
        color: '475569',
        italics: true,
      });

      if (runs.length > 0) {
        elements.push(
          new Paragraph({
            children: runs,
            indent: { left: 720 },
            border: {
              left: {
                style: BorderStyle.SINGLE,
                size: 24,
                color: '3B82F6',
                space: 12,
              },
            },
            spacing: { before: 140, after: 140, line: 340 },
          }),
        );
      }
      continue;
    }

    if (block.type === 'code') {
      const codeBlock = block as CodeBlock;
      const lines = codeBlock.code.split('\n');
      const textRuns = lines.map((line, idx) =>
        new TextRun({
          text: line,
          font: 'Consolas',
          size: 19,
          color: '0F172A',
          break: idx < lines.length - 1 ? 1 : 0,
        }),
      );

      elements.push(
        new Paragraph({
          children: textRuns,
          shading: {
            type: ShadingType.CLEAR,
            fill: 'F8FAFC',
            color: 'auto',
          },
          border: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0', space: 6 },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0', space: 6 },
            left: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0', space: 8 },
            right: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0', space: 8 },
          },
          spacing: { before: 160, after: 160 },
        }),
      );
      continue;
    }

    if (block.type === 'list') {
      const listBlock = block as ListBlock;
      listBlock.items.forEach((item) => {
        const itemInlines = extractQuoteInlines(item.children);
        const runs = convertInlines(itemInlines);

        if (runs.length > 0) {
          elements.push(
            new Paragraph({
              children: runs,
              bullet: listBlock.ordered ? undefined : { level: 0 },
              spacing: { after: 80, line: 320 },
            }),
          );
        }
      });
      continue;
    }

    if (block.type === 'table') {
      elements.push(convertTableBlockToDocx(block as TableBlock));
      continue;
    }

    if (block.type === 'image') {
      const imgBlock = block as ImageBlock;
      const imgData = await fetchImageForDocx(imgBlock.src, pageUrl || ast.metadata.url);
      if (imgData) {
        elements.push(
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
            spacing: { before: 160, after: 160 },
          }),
        );
      }
      continue;
    }

    if (block.type === 'video') {
      const videoBlock = block as VideoBlock;
      elements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `🎥 视频：${videoBlock.title || videoBlock.src}`,
              color: '2563EB',
              underline: {},
              font: 'PingFang SC',
              size: 22,
            }),
          ],
          spacing: { before: 120, after: 120 },
        }),
      );
      continue;
    }

    if (block.type === 'divider') {
      elements.push(
        new Paragraph({
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 6,
              color: 'E2E8F0',
              space: 1,
            },
          },
          spacing: { before: 180, after: 180 },
        }),
      );
    }
  }

  return elements;
}

/**
 * High-level exporter: Converts HTML snippet / GrabbedContent into a Word (.docx) file via Document AST
 */
export async function exportWord(
  title: string,
  htmlContent: string,
  filename = 'document.docx',
  pageUrl?: string,
  grabbedContent?: GrabbedContent,
): Promise<void> {
  const cleanTitle = cleanDocumentTitle(title || grabbedContent?.tdk.title || '选区文档');
  const finalName = filename.endsWith('.docx') ? filename : `${filename}.docx`;

  // 1. Build or normalize DocumentAST
  let ast: DocumentAST;
  if (grabbedContent) {
    ast = convertGrabbedToAst(grabbedContent);
  } else if (htmlContent && htmlContent.trim()) {
    const rawAst = parseHtmlToAst(htmlContent, pageUrl);
    ast = applyTransforms(rawAst, ...defaultAstTransforms);
  } else {
    ast = {
      version: '1.0',
      metadata: {
        title: cleanTitle,
        url: pageUrl || '',
        capturedAt: Date.now(),
        stats: { wordCount: 0, imageCount: 0, videoCount: 0, linkCount: 0, blockCount: 0 },
      },
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: '（暂无正文内容）' }],
        },
      ],
    };
  }

  // 2. Build Document Header (Title + Metadata Banner)
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [
        new TextRun({
          text: cleanTitle,
          bold: true,
          font: 'PingFang SC',
          size: 40, // 20pt
          color: '0F172A',
        }),
      ],
      spacing: { after: 120 },
    }),
  ];

  if (pageUrl || ast.metadata.url) {
    const docUrl = pageUrl || ast.metadata.url;
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `来源：${docUrl}   |   采集时间：${new Date(ast.metadata.capturedAt || Date.now()).toLocaleString()}`,
            color: '64748B',
            font: 'PingFang SC',
            size: 18, // 9pt
          }),
        ],
        spacing: { after: 200 },
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
  }

  // 3. Convert AST Blocks to docx Elements
  const contentElements = await convertAstToDocxElements(ast, pageUrl || ast.metadata.url);
  children.push(...contentElements);

  // Fallback if empty
  if (children.length <= 2) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '（暂无正文内容）',
            font: 'PingFang SC',
            size: 22,
            color: '64748B',
          }),
        ],
      }),
    );
  }

  // 4. Assemble Word Document
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
