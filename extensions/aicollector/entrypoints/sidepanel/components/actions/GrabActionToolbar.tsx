import React, { useState } from 'react';
import {
  FileText,
  FileCode,
  Download,
  FileSpreadsheet,
  Printer,
  Sparkles,
  Link,
  ShieldCheck,
  Image as ImageIcon,
  Archive,
  Edit3,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { GrabbedContent } from '../../../../src/types';
import { cleanUrl } from '../../../../src/utils/urlCleaner';
import { htmlToMarkdown } from '../../../../src/utils/markdownConverter';
import {
  exportMarkdown,
  exportMarkdownWithImages,
  exportWord,
  exportPdf,
} from '../../../../src/utils/documentExporter';
import { extractCover, extractSummary } from '../../../../src/utils/contentSummarizer';
import { MarkdownEditModal } from '../modals/MarkdownEditModal';
import { PosterModal } from '../modals/PosterModal';
import { SummaryCoverModal } from '../modals/SummaryCoverModal';

interface GrabActionToolbarProps {
  grabbedContent: GrabbedContent;
}

export const GrabActionToolbar: React.FC<GrabActionToolbarProps> = ({ grabbedContent }) => {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPosterModal, setShowPosterModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [isActionsExpanded, setIsActionsExpanded] = useState(true);

  // Toast / feedback states
  const [copiedState, setCopiedState] = useState<string | null>(null);
  const [isBundling, setIsBundling] = useState(false);
  const [bundlePercent, setBundlePercent] = useState(0);

  const title = grabbedContent.tdk.title || '选区内容';
  const rawUrl = grabbedContent.url;
  const sanitizedUrl = cleanUrl(rawUrl);

  const triggerCopyFeedback = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedState(key);
    setTimeout(() => setCopiedState(null), 2000);
  };

  // 1 & 2. Cover & Summary Modal Trigger
  const handleOpenSummaryCover = () => {
    setShowSummaryModal(true);
  };

  // 3. Clean URL copy
  const handleCopyCleanUrl = () => {
    triggerCopyFeedback('clean_url', sanitizedUrl);
  };

  // 4. Raw URL copy
  const handleCopyRawUrl = () => {
    triggerCopyFeedback('raw_url', rawUrl);
  };

  // 5. Parse Markdown to clipboard
  const handleParseMarkdown = () => {
    const md = htmlToMarkdown(grabbedContent.selectedHtml, grabbedContent.url);
    triggerCopyFeedback('parse_md', md);
  };

  // 6. Edit Markdown Modal
  const handleEditMarkdown = () => {
    setShowEditModal(true);
  };

  // 7. Download Markdown (.md)
  const handleDownloadMarkdown = () => {
    const md = htmlToMarkdown(grabbedContent.selectedHtml, grabbedContent.url);
    const filename = `${title.slice(0, 30).trim() || 'document'}_${Date.now()}.md`;
    exportMarkdown(md, filename);
  };

  // 8. Bundle ZIP (MD + Images)
  const handleDownloadBundleZip = async () => {
    if (isBundling) return;
    try {
      setIsBundling(true);
      setBundlePercent(0);
      const md = htmlToMarkdown(grabbedContent.selectedHtml, grabbedContent.url);
      const zipName = `${title.slice(0, 30).trim() || 'bundle'}_${Date.now()}.zip`;
      await exportMarkdownWithImages(
        md,
        grabbedContent.images || [],
        grabbedContent.url,
        zipName,
        (progress) => {
          setBundlePercent(progress.percent);
        },
      );
    } catch (err) {
      console.error('Failed to bundle MD + Images:', err);
    } finally {
      setIsBundling(false);
      setBundlePercent(0);
    }
  };

  // 9. Download PDF (Print View)
  const handleExportPdf = () => {
    exportPdf(title, grabbedContent.selectedHtml);
  };

  // 10. Download Word (.docx)
  const [isExportingWord, setIsExportingWord] = useState(false);
  const handleExportWord = async () => {
    if (isExportingWord) return;
    try {
      setIsExportingWord(true);
      const filename = `${title.slice(0, 30).trim() || 'document'}_${Date.now()}.docx`;
      await exportWord(title, grabbedContent.selectedHtml, filename);
    } catch (err) {
      console.error('Failed to export docx:', err);
    } finally {
      setIsExportingWord(false);
    }
  };

  // 12. Poster Modal
  const handleGeneratePoster = () => {
    setShowPosterModal(true);
  };

  // Summary & Cover metadata
  const coverInfo = extractCover(grabbedContent);
  const summaryInfo = extractSummary(grabbedContent);
  const currentMarkdown = htmlToMarkdown(grabbedContent.selectedHtml, grabbedContent.url);

  return (
    <div className="flex flex-col gap-2 bg-surface-secondary/60 p-2.5 rounded-lg border border-border/80">
      {/* Header with collapse toggle */}
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsActionsExpanded(!isActionsExpanded)}
      >
        <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          快捷工具箱 (12项扩展功能)
        </span>
        <button
          type="button"
          className="text-muted hover:text-foreground transition-colors p-0.5"
        >
          {isActionsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {isActionsExpanded && (
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          {/* 1 & 2: Cover & Summary */}
          <button
            type="button"
            onClick={handleOpenSummaryCover}
            className="flex flex-col items-center justify-center p-1.5 rounded-md bg-surface hover:bg-surface-tertiary border border-border/70 hover:border-accent/60 transition-all text-center gap-1 cursor-pointer group"
          >
            <ImageIcon className="w-3.5 h-3.5 text-blue-500 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-medium text-foreground">封面 / 摘要</span>
          </button>

          {/* 3: Clean URL */}
          <button
            type="button"
            onClick={handleCopyCleanUrl}
            className="flex flex-col items-center justify-center p-1.5 rounded-md bg-surface hover:bg-surface-tertiary border border-border/70 hover:border-accent/60 transition-all text-center gap-1 cursor-pointer group"
          >
            {copiedState === 'clean_url' ? (
              <Check className="w-3.5 h-3.5 text-success" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 group-hover:scale-110 transition-transform" />
            )}
            <span className="text-[10px] font-medium text-foreground">
              {copiedState === 'clean_url' ? '已复制' : '净化链接'}
            </span>
          </button>

          {/* 4: Raw URL */}
          <button
            type="button"
            onClick={handleCopyRawUrl}
            className="flex flex-col items-center justify-center p-1.5 rounded-md bg-surface hover:bg-surface-tertiary border border-border/70 hover:border-accent/60 transition-all text-center gap-1 cursor-pointer group"
          >
            {copiedState === 'raw_url' ? (
              <Check className="w-3.5 h-3.5 text-success" />
            ) : (
              <Link className="w-3.5 h-3.5 text-indigo-500 group-hover:scale-110 transition-transform" />
            )}
            <span className="text-[10px] font-medium text-foreground">
              {copiedState === 'raw_url' ? '已复制' : '原始链接'}
            </span>
          </button>

          {/* 5: Parse Markdown */}
          <button
            type="button"
            onClick={handleParseMarkdown}
            className="flex flex-col items-center justify-center p-1.5 rounded-md bg-surface hover:bg-surface-tertiary border border-border/70 hover:border-accent/60 transition-all text-center gap-1 cursor-pointer group"
          >
            {copiedState === 'parse_md' ? (
              <Check className="w-3.5 h-3.5 text-success" />
            ) : (
              <FileCode className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
            )}
            <span className="text-[10px] font-medium text-foreground">
              {copiedState === 'parse_md' ? '已复制 MD' : '解析 Markdown'}
            </span>
          </button>

          {/* 6: Edit Markdown */}
          <button
            type="button"
            onClick={handleEditMarkdown}
            className="flex flex-col items-center justify-center p-1.5 rounded-md bg-surface hover:bg-surface-tertiary border border-border/70 hover:border-accent/60 transition-all text-center gap-1 cursor-pointer group"
          >
            <Edit3 className="w-3.5 h-3.5 text-purple-500 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-medium text-foreground">编辑 MD</span>
          </button>

          {/* 7: Download Markdown */}
          <button
            type="button"
            onClick={handleDownloadMarkdown}
            className="flex flex-col items-center justify-center p-1.5 rounded-md bg-surface hover:bg-surface-tertiary border border-border/70 hover:border-accent/60 transition-all text-center gap-1 cursor-pointer group"
          >
            <Download className="w-3.5 h-3.5 text-cyan-500 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-medium text-foreground">下载 MD</span>
          </button>

          {/* 8: Bundle ZIP (MD + Images) */}
          <button
            type="button"
            onClick={handleDownloadBundleZip}
            disabled={isBundling}
            className="flex flex-col items-center justify-center p-1.5 rounded-md bg-surface hover:bg-surface-tertiary border border-border/70 hover:border-accent/60 transition-all text-center gap-1 cursor-pointer group disabled:opacity-60"
          >
            <Archive className="w-3.5 h-3.5 text-rose-500 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-medium text-foreground truncate max-w-full">
              {isBundling ? `${bundlePercent}% 打包中` : 'MD+图片打包'}
            </span>
          </button>

          {/* 9: Download PDF */}
          <button
            type="button"
            onClick={handleExportPdf}
            className="flex flex-col items-center justify-center p-1.5 rounded-md bg-surface hover:bg-surface-tertiary border border-border/70 hover:border-accent/60 transition-all text-center gap-1 cursor-pointer group"
          >
            <Printer className="w-3.5 h-3.5 text-orange-500 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-medium text-foreground">下载 PDF</span>
          </button>

          {/* 10: Download Word (.docx) */}
          <button
            type="button"
            onClick={handleExportWord}
            disabled={isExportingWord}
            className="flex flex-col items-center justify-center p-1.5 rounded-md bg-surface hover:bg-surface-tertiary border border-border/70 hover:border-accent/60 transition-all text-center gap-1 cursor-pointer group disabled:opacity-60"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-medium text-foreground">
              {isExportingWord ? '生成中...' : '下载 Word'}
            </span>
          </button>

          {/* 12: Generate Poster (Spans last row nicely) */}
          <button
            type="button"
            onClick={handleGeneratePoster}
            className="col-span-3 flex items-center justify-center gap-2 p-1.5 rounded-md bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent transition-all cursor-pointer font-medium"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[11px]">生成分享精美海报</span>
          </button>
        </div>
      )}

      {/* Modals */}
      {showEditModal && (
        <MarkdownEditModal
          initialMarkdown={currentMarkdown}
          title={title}
          onClose={() => setShowEditModal(false)}
        />
      )}

      {showPosterModal && (
        <PosterModal
          options={{
            title,
            summary: summaryInfo.summary,
            url: sanitizedUrl,
            coverUrl: coverInfo?.url,
          }}
          onClose={() => setShowPosterModal(false)}
        />
      )}

      {showSummaryModal && (
        <SummaryCoverModal
          cover={coverInfo}
          summary={summaryInfo}
          pageUrl={rawUrl}
          onClose={() => setShowSummaryModal(false)}
        />
      )}
    </div>
  );
};
