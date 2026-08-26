/**
 * Document exporter utility for Markdown, Word, PDF, and ZIP (MD + Images)
 */

import JSZip from 'jszip';

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
 * Export HTML content as a Microsoft Word document with maximum CSS & layout styling preserved
 */
export function exportWord(
  title: string,
  htmlContent: string,
  filename = 'document.doc',
): void {
  const finalName = filename.endsWith('.doc') || filename.endsWith('.docx') ? filename : `${filename}.doc`;

  // Standard Word XML HTML document wrapper that preserves all rich text and typography in Word & WPS
  const wordTemplate = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        body {
          font-family: "PingFang SC", "Microsoft YaHei", "Segoe UI", Calibri, Arial, sans-serif;
          font-size: 11pt;
          line-height: 1.6;
          color: #222222;
        }
        h1 {
          font-size: 20pt;
          font-weight: bold;
          color: #0f172a;
          margin-bottom: 12pt;
          padding-bottom: 6pt;
          border-bottom: 2pt solid #3b82f6;
        }
        h2 {
          font-size: 15pt;
          font-weight: bold;
          color: #1e293b;
          margin-top: 14pt;
          margin-bottom: 8pt;
        }
        h3 {
          font-size: 13pt;
          font-weight: bold;
          color: #334155;
          margin-top: 10pt;
          margin-bottom: 6pt;
        }
        p {
          margin-bottom: 8pt;
          text-align: justify;
        }
        img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 10pt 0;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 10pt 0;
        }
        th, td {
          border: 1pt solid #cbd5e1;
          padding: 6pt 8pt;
          text-align: left;
        }
        th {
          background-color: #f1f5f9;
          font-weight: bold;
        }
        blockquote {
          border-left: 3pt solid #3b82f6;
          margin: 8pt 0;
          padding-left: 10pt;
          color: #475569;
          background-color: #f8fafc;
        }
        code {
          background-color: #f1f5f9;
          padding: 2pt 4pt;
          font-family: Consolas, "Courier New", monospace;
          font-size: 9.5pt;
          color: #d97706;
        }
        pre {
          background-color: #f1f5f9;
          padding: 8pt 10pt;
          font-family: Consolas, "Courier New", monospace;
          font-size: 9.5pt;
          border-radius: 4pt;
          margin: 8pt 0;
        }
        a {
          color: #2563eb;
          text-decoration: underline;
        }
        ul, ol {
          margin: 6pt 0;
          padding-left: 20pt;
        }
        li {
          margin-bottom: 4pt;
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <div>
        ${htmlContent}
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', wordTemplate], {
    type: 'application/msword;charset=utf-8',
  });
  downloadBlob(blob, finalName);
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
