/**
 * Document exporter utility for Markdown, Word (.docx), PDF, and ZIP (MD + Images)
 */

import JSZip from 'jszip';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
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
 * Convert inline DOM nodes to docx TextRuns
 */
function extractInlineTextRuns(
  element: Element,
  inheritedStyles: { bold?: boolean; italics?: boolean; strike?: boolean; color?: string } = {},
): TextRun[] {
  const runs: TextRun[] = [];

  element.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (text) {
        runs.push(
          new TextRun({
            text,
            bold: inheritedStyles.bold,
            italics: inheritedStyles.italics,
            strike: inheritedStyles.strike,
            color: inheritedStyles.color,
          }),
        );
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const childEl = node as Element;
      const tag = childEl.tagName.toLowerCase();

      const newStyles = { ...inheritedStyles };
      if (tag === 'b' || tag === 'strong') newStyles.bold = true;
      if (tag === 'i' || tag === 'em') newStyles.italics = true;
      if (tag === 's' || tag === 'del') newStyles.strike = true;
      if (tag === 'a') {
        newStyles.color = '0066CC';
      }

      if (tag === 'br') {
        runs.push(new TextRun({ break: 1 }));
      } else {
        runs.push(...extractInlineTextRuns(childEl, newStyles));
      }
    }
  });

  return runs;
}

/**
 * Convert an HTML table element to a docx Table
 */
function convertHtmlTableToDocx(tableEl: HTMLElement): Table {
  const rows: TableRow[] = [];
  const trElements = Array.from(tableEl.querySelectorAll('tr'));

  trElements.forEach((tr) => {
    const cells: TableCell[] = [];
    const cellElements = Array.from(tr.querySelectorAll('th, td'));

    cellElements.forEach((cell) => {
      const isHeader = cell.tagName.toLowerCase() === 'th';
      const textRuns = extractInlineTextRuns(cell, { bold: isHeader });

      cells.push(
        new TableCell({
          children: [
            new Paragraph({
              children: textRuns.length > 0 ? textRuns : [new TextRun({ text: '' })],
            }),
          ],
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
            left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
            right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
          },
          shading: isHeader ? { fill: 'F2F2F2' } : undefined,
        }),
      );
    });

    if (cells.length > 0) {
      rows.push(new TableRow({ children: cells }));
    }
  });

  return new Table({
    rows: rows.length > 0 ? rows : [new TableRow({ children: [new TableCell({ children: [] })] })],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/**
 * Export HTML content as a true native Microsoft Word (.docx) file
 */
export async function exportWord(
  title: string,
  htmlContent: string,
  filename = 'document.docx',
): Promise<void> {
  const finalName = filename.endsWith('.docx') ? filename : `${filename.replace(/\.doc$/, '')}.docx`;

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent || '', 'text/html');

  const children: (Paragraph | Table)[] = [];

  // Title Header
  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
    }),
  );

  // Process body nodes
  doc.body.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').trim();
      if (text) {
        children.push(new Paragraph({ children: [new TextRun(text)], spacing: { after: 120 } }));
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      switch (tag) {
        case 'h1':
          children.push(
            new Paragraph({
              text: el.textContent?.trim() || '',
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 240, after: 120 },
            }),
          );
          break;
        case 'h2':
          children.push(
            new Paragraph({
              text: el.textContent?.trim() || '',
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 100 },
            }),
          );
          break;
        case 'h3':
          children.push(
            new Paragraph({
              text: el.textContent?.trim() || '',
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
              text: el.textContent?.trim() || '',
              heading: HeadingLevel.HEADING_4,
              spacing: { before: 120, after: 60 },
            }),
          );
          break;
        case 'blockquote':
          children.push(
            new Paragraph({
              children: extractInlineTextRuns(el, { italics: true }),
              indent: { left: 720 },
              spacing: { after: 120 },
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
                  size: 20,
                }),
              ],
              shading: { fill: 'F4F4F4' },
              spacing: { after: 120 },
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
                children: [new TextRun(prefix), ...runs],
                indent: { left: 360 },
                spacing: { after: 60 },
              }),
            );
          });
          break;
        }
        case 'table':
          children.push(convertHtmlTableToDocx(el));
          children.push(new Paragraph({ spacing: { after: 120 } }));
          break;
        default: {
          const textRuns = extractInlineTextRuns(el);
          if (textRuns.length > 0) {
            children.push(
              new Paragraph({
                children: textRuns,
                spacing: { after: 120 },
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
        properties: {},
        children,
      },
    ],
  });

  const docxBlob = await Packer.toBlob(wordDoc);
  downloadBlob(docxBlob, finalName);
}

/**
 * Open a dedicated clean print window to print / export as PDF
 */
export function exportPdf(title: string, htmlContent: string): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('请允许弹出窗口以便生成 PDF / 打印');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        @page { size: A4; margin: 20mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { font-size: 24px; border-bottom: 1px solid #eaeaea; padding-bottom: 10px; margin-bottom: 20px; }
        img { max-width: 100%; height: auto; display: block; margin: 12px 0; border-radius: 4px; }
        table { border-collapse: collapse; width: 100%; margin: 16px 0; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
        th { background-color: #f7f7f7; font-weight: 600; }
        blockquote { border-left: 4px solid #3b82f6; margin: 16px 0; padding: 8px 16px; background-color: #f8fafc; color: #475569; }
        pre { background-color: #f1f5f9; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: monospace; }
        code { background-color: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
        @media print {
          body { padding: 0; }
          button { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <div>${htmlContent}</div>
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
