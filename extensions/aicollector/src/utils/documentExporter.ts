/**
 * Document exporter utility for Markdown, Word (.docx), PDF, and ZIP (MD + Images)
 */

import JSZip from 'jszip';
import type { GrabbedContent } from '../types';
import { parseHtmlToFlowBlocks } from './contentImageGenerator';
import { htmlToMarkdown } from './markdownConverter';
import { cleanUrl } from './urlCleaner';
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
} from 'docx';

/**
 * Trigger browser file download from a Blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Export plain Markdown as a .md file
 */
export function exportMarkdown(content: string, filename = 'document.md'): void {
  const finalName = filename.endsWith('.md') ? filename : `${filename}.md`;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, finalName);
}

/**
 * Export arbitrary data object as formatted JSON file
 */
export function exportJson(data: unknown, filename = 'document.json'): void {
  const finalName = filename.endsWith('.json') ? filename : `${filename}.json`;
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, finalName);
}

export interface StructuredContentExport {
  metadata: {
    title: string;
    url: string;
    cleanUrl: string;
    exportedAt: string;
    selector: string;
    tag: string;
    dimensions: { width: number; height: number };
    tdk: GrabbedContent['tdk'];
  };
  blocks: Array<{
    type: 'heading' | 'paragraph' | 'blockquote' | 'list-item' | 'image';
    text?: string;
    level?: number;
    src?: string;
    alt?: string;
  }>;
  markdown: string;
  images: string[];
  rawText: string;
}

/**
 * Build clean, serializable structured JSON dataset from grabbed DOM element
 */
export function createStructuredContentJson(
  grabbedContent: GrabbedContent,
): StructuredContentExport {
  const rawBlocks = parseHtmlToFlowBlocks(
    grabbedContent.selectedHtml,
    grabbedContent.selectedText,
    grabbedContent.images || [],
  );

  const blocks = rawBlocks.map((block) => {
    if (block.type === 'image') {
      return {
        type: block.type,
        src: block.src,
        alt: block.alt || '',
      };
    }
    return {
      type: block.type,
      text: block.text,
      ...(block.level !== undefined ? { level: block.level } : {}),
    };
  });

  return {
    metadata: {
      title: grabbedContent.tdk.title || '选区内容',
      url: grabbedContent.url,
      cleanUrl: cleanUrl(grabbedContent.url),
      exportedAt: new Date().toISOString(),
      selector: grabbedContent.selector,
      tag: grabbedContent.tag,
      dimensions: grabbedContent.dimensions,
      tdk: grabbedContent.tdk,
    },
    blocks,
    markdown: htmlToMarkdown(grabbedContent.selectedHtml, grabbedContent.url),
    images: grabbedContent.images || [],
    rawText: grabbedContent.selectedText,
  };
}

interface InlineFormatOptions {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  underline?: boolean;
  color?: string;
  font?: string;
  size?: number;
}

/**
 * Recursively extracts formatted text runs from an inline DOM element
 */
function extractInlineTextRuns(
  node: Node,
  format: InlineFormatOptions = {},
): TextRun[] {
  const runs: TextRun[] = [];

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
        }),
      );
    }
    return runs;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const nextFormat: InlineFormatOptions = { ...format };

    if (tag === 'strong' || tag === 'b') nextFormat.bold = true;
    if (tag === 'em' || tag === 'i') nextFormat.italics = true;
    if (tag === 's' || tag === 'del' || tag === 'strike') nextFormat.strike = true;
    if (tag === 'u') nextFormat.underline = true;
    if (tag === 'a') {
      nextFormat.color = '2563EB';
      nextFormat.underline = true;
    }
    if (tag === 'code') {
      nextFormat.font = 'Consolas';
      nextFormat.color = '0284C7';
    }

    el.childNodes.forEach((child) => {
      runs.push(...extractInlineTextRuns(child, nextFormat));
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
      const textRuns = extractInlineTextRuns(cell, { bold: isHeader });

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

/**
 * Export HTML content as a standard Microsoft Word (.docx) document
 */
export async function exportWord(
  title: string,
  htmlContent: string,
  filename = 'document.docx',
  pageUrl?: string,
): Promise<void> {
  const finalName = filename.endsWith('.docx') ? filename : `${filename}.docx`;
  const exportDate = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent || '', 'text/html');

  const children: (Paragraph | Table)[] = [];

  // 1. Document Title Header
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: title,
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
  const metaRuns: TextRun[] = [];
  if (pageUrl) {
    metaRuns.push(
      new TextRun({
        text: `来源网页: ${pageUrl}  |  `,
        size: 18, // 9pt
        color: '64748B',
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
          space: 6,
        },
      },
    }),
  );

  // 3. Process Content Body
  doc.body.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').trim();
      if (text) {
        children.push(
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
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      switch (tag) {
        case 'h1':
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: el.textContent?.trim() || '',
                  bold: true,
                  size: 32, // 16pt
                  color: '0F172A',
                  font: 'PingFang SC',
                }),
              ],
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 240, after: 120 },
            }),
          );
          break;

        case 'h2':
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: el.textContent?.trim() || '',
                  bold: true,
                  size: 28, // 14pt
                  color: '1E293B',
                  font: 'PingFang SC',
                }),
              ],
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 100 },
            }),
          );
          break;

        case 'h3':
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: el.textContent?.trim() || '',
                  bold: true,
                  size: 24, // 12pt
                  color: '334155',
                  font: 'PingFang SC',
                }),
              ],
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 160, after: 80 },
            }),
          );
          break;

        case 'h4':
        case 'h5':
        case 'h6':
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: el.textContent?.trim() || '',
                  bold: true,
                  size: 22, // 11pt
                  color: '475569',
                  font: 'PingFang SC',
                }),
              ],
              heading: HeadingLevel.HEADING_4,
              spacing: { before: 120, after: 60 },
            }),
          );
          break;

        case 'blockquote':
          children.push(
            new Paragraph({
              children: extractInlineTextRuns(el, { italics: true, color: '334155' }),
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
              spacing: { before: 100, after: 140 },
            }),
          );
          break;

        case 'pre':
        case 'code':
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: el.textContent || '',
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
          break;

        case 'ul':
        case 'ol': {
          const isOrdered = tag === 'ol';
          const items = Array.from(el.querySelectorAll('li'));
          items.forEach((li, idx) => {
            const prefix = isOrdered ? `${idx + 1}. ` : '• ';
            const runs = extractInlineTextRuns(li);
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: prefix,
                    bold: isOrdered,
                    font: 'PingFang SC',
                    size: 22,
                  }),
                  ...runs,
                ],
                indent: { left: 400 },
                spacing: { after: 80 },
              }),
            );
          });
          break;
        }

        case 'table':
          children.push(convertHtmlTableToDocx(el));
          children.push(new Paragraph({ spacing: { after: 140 } }));
          break;

        case 'hr':
          children.push(
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
          break;

        default: {
          const textRuns = extractInlineTextRuns(el);
          if (textRuns.length > 0) {
            children.push(
              new Paragraph({
                children: textRuns,
                spacing: { after: 140, line: 360 },
              }),
            );
          }
          break;
        }
      }
    }
  });

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

/**
 * Open a dedicated clean print window to print / export as PDF with high-fidelity styling
 */
export function exportPdf(title: string, htmlContent: string, pageUrl?: string): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('请允许弹出窗口以便生成 PDF / 打印');
    return;
  }

  const exportDate = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        @page {
          size: A4;
          margin: 18mm 16mm 18mm 16mm;
        }
        * {
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          line-height: 1.75;
          color: #1e293b;
          max-width: 820px;
          margin: 0 auto;
          padding: 24px;
          background-color: #ffffff;
          -webkit-font-smoothing: antialiased;
        }
        .header-box {
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        h1.title {
          font-size: 24px;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.35;
          margin: 0 0 10px 0;
        }
        .meta-info {
          font-size: 12px;
          color: #64748b;
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
        }
        .meta-info a {
          color: #3b82f6;
          text-decoration: none;
        }
        h1 { font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 24px; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }
        h2 { font-size: 17px; font-weight: 600; color: #1e293b; margin-top: 20px; margin-bottom: 10px; }
        h3 { font-size: 15px; font-weight: 600; color: #334155; margin-top: 16px; margin-bottom: 8px; }
        h4, h5, h6 { font-size: 13px; font-weight: 600; color: #475569; margin-top: 12px; margin-bottom: 6px; }
        p {
          margin-top: 0;
          margin-bottom: 12px;
          text-align: justify;
          word-break: break-word;
        }
        img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 14px auto;
          border-radius: 6px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
          break-inside: avoid;
          page-break-inside: avoid;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 16px 0;
          font-size: 13px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        th, td {
          border: 1px solid #e2e8f0;
          padding: 8px 12px;
          text-align: left;
        }
        th {
          background-color: #f8fafc;
          font-weight: 600;
          color: #0f172a;
        }
        tr:nth-child(even) td {
          background-color: #fafbfc;
        }
        blockquote {
          border-left: 4px solid #3b82f6;
          margin: 14px 0;
          padding: 10px 16px;
          background-color: #f8fafc;
          color: #334155;
          border-radius: 0 6px 6px 0;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        pre {
          background-color: #0f172a;
          color: #f8fafc;
          padding: 14px 16px;
          border-radius: 8px;
          overflow-x: auto;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 12px;
          line-height: 1.6;
          margin: 14px 0;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        code {
          background-color: #f1f5f9;
          color: #0284c7;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 12px;
        }
        pre code {
          background-color: transparent;
          color: inherit;
          padding: 0;
        }
        ul, ol {
          margin: 8px 0 14px 0;
          padding-left: 24px;
        }
        li {
          margin-bottom: 6px;
        }
        a {
          color: #2563eb;
          text-decoration: underline;
        }
        hr {
          border: none;
          border-top: 1px solid #e2e8f0;
          margin: 20px 0;
        }
        @media print {
          body {
            padding: 0;
            max-width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="header-box">
        <h1 class="title">${title}</h1>
        <div class="meta-info">
          ${pageUrl ? `<span><strong>来源:</strong> <a href="${pageUrl}">${pageUrl}</a></span>` : ''}
          <span><strong>采集时间:</strong> ${exportDate}</span>
        </div>
      </div>
      <div class="content-body">
        ${htmlContent}
      </div>
      <script>
        window.onload = function() {
          window.focus();
          window.print();
        };
      </script>
    </body>
    </html>
  `);

  printWindow.document.close();
}

/**
 * Export Markdown and all associated images bundled into a ZIP archive
 */
export async function exportMarkdownWithImages(
  markdownContent: string,
  images: string[],
  pageUrl: string,
  zipFilename = 'bundle.zip',
  onProgress?: (progress: { loaded: number; total: number; percent: number }) => void,
): Promise<void> {
  const zip = new JSZip();
  const imgFolder = zip.folder('images');

  let updatedMarkdown = markdownContent;
  const total = images.length;
  let loaded = 0;

  for (let i = 0; i < images.length; i++) {
    const rawUrl = images[i];
    if (!rawUrl) continue;

    let fullUrl = rawUrl;

    if (pageUrl && !rawUrl.startsWith('http') && !rawUrl.startsWith('data:')) {
      try {
        fullUrl = new URL(rawUrl, pageUrl).toString();
      } catch {
        fullUrl = rawUrl;
      }
    }

    try {
      const resp = await fetch(fullUrl, { mode: 'cors' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();

      // Determine extension
      let ext = 'png';
      const mime = blob.type.toLowerCase();
      if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
      else if (mime.includes('webp')) ext = 'webp';
      else if (mime.includes('gif')) ext = 'gif';
      else if (mime.includes('svg')) ext = 'svg';

      const localFileName = `img_${i + 1}.${ext}`;
      const relativePath = `./images/${localFileName}`;

      if (imgFolder) {
        imgFolder.file(localFileName, blob);
      }

      // Replace image link in Markdown
      updatedMarkdown = updatedMarkdown.split(rawUrl).join(relativePath);
      if (fullUrl !== rawUrl) {
        updatedMarkdown = updatedMarkdown.split(fullUrl).join(relativePath);
      }
    } catch (err) {
      console.warn(`Failed to fetch image ${rawUrl} for zip bundle:`, err);
    } finally {
      loaded++;
      if (onProgress) {
        onProgress({
          loaded,
          total,
          percent: Math.round((loaded / (total || 1)) * 100),
        });
      }
    }
  }

  zip.file('index.md', updatedMarkdown);

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const finalZipName = zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`;
  downloadBlob(zipBlob, finalZipName);
}
