import React, { useState } from 'react';
import { toast } from '@heroui/react';
import {
  FileCode,
  FileSpreadsheet,
  Printer,
  Sparkles,
  ShieldCheck,
  Image as ImageIcon,
  Archive,
  Edit3,
  Check,
  ChevronDown,
  ChevronUp,
  Camera,
  Loader2,
  FileJson,
} from 'lucide-react';
import type { GrabbedContent } from '../../../../src/types';
import { cleanUrl } from '../../../../src/utils/urlCleaner';
import { htmlToMarkdown } from '../../../../src/utils/markdownConverter';
import {
  exportMarkdown,
  exportMarkdownWithImages,
  exportWord,
  exportPdf,
  exportJson,
  createStructuredContentJson,
} from '../../../../src/utils/documentExporter';
import { extractCover, extractSummary } from '../../../../src/utils/contentSummarizer';
import { MarkdownEditModal } from '../modals/MarkdownEditModal';
import { PosterModal } from '../modals/PosterModal';
import { SummaryCoverModal } from '../modals/SummaryCoverModal';
import { ContentImageModal } from '../modals/ContentImageModal';

interface GrabActionToolbarProps {
  grabbedContent: GrabbedContent;
}

export const GrabActionToolbar: React.FC<GrabActionToolbarProps> = ({ grabbedContent }) => {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPosterModal, setShowPosterModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showContentImageModal, setShowContentImageModal] = useState(false);
  const [isActionsExpanded, setIsActionsExpanded] = useState(true);

  // Toast / feedback states
  const [copiedState, setCopiedState] = useState<string | null>(null);
  const [isBundling, setIsBundling] = useState(false);
  const [bundlePercent, setBundlePercent] = useState(0);
  const [isExportingWord, setIsExportingWord] = useState(false);

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
    toast.success('已净化并复制链接', {
      description: sanitizedUrl,
      timeout: 2200,
    });
  };

  // 4. Generate Content Image Modal
  const handleGenerateImage = () => {
    setShowContentImageModal(true);
  };

  // 5. Export Structured JSON (.json)
  const handleExportJson = () => {
    const data = createStructuredContentJson(grabbedContent);
    const filename = `${title.slice(0, 30).trim() || 'data'}_${Date.now()}.json`;
    exportJson(data, filename);
    toast.success('已导出结构化 JSON', {
      description: filename,
      timeout: 2200,
    });
  };

  // 6. Edit Markdown Modal
  const handleEditMarkdown = () => {
    setShowEditModal(true);
  };

  // 7. Generate / Download Markdown (.md)
  const handleGenerateMarkdown = () => {
    const md = htmlToMarkdown(grabbedContent.selectedHtml, grabbedContent.url);
    const filename = `${title.slice(0, 30).trim() || 'document'}_${Date.now()}.md`;
    exportMarkdown(md, filename);
    toast.success('已生成并下载 Markdown', {
      description: filename,
      timeout: 2200,
    });
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
      toast.success('MD 与图片打包完成', {
        description: zipName,
        timeout: 2500,
      });
    } catch (err) {
      console.error('Failed to bundle MD + Images:', err);
      toast.danger('打包下载失败', {
        description: String(err),
        timeout: 3000,
      });
    } finally {
      setIsBundling(false);
      setBundlePercent(0);
    }
  };

  // 9. Download PDF (Print View)
  const handleExportPdf = () => {
    exportPdf(title, grabbedContent.selectedHtml, grabbedContent.url);
    toast.info('已开启打印 / 导出 PDF 视图', {
      description: '请在打印窗口中选择「另存为 PDF」',
      timeout: 2500,
    });
  };

  // 10. Download Word (.docx/.doc)
  const handleExportWord = async () => {
    if (isExportingWord) return;
    const filename = `${title.slice(0, 30).trim() || 'document'}_${Date.now()}.docx`;
    try {
      setIsExportingWord(true);
      await exportWord(title, grabbedContent.selectedHtml, filename, grabbedContent.url);
      toast.success('Word 文档导出成功', {
        description: filename,
        timeout: 2500,
      });
    } catch (err) {
      console.error('Failed to export docx:', err);
      toast.danger('导出 Word 失败', {
        description: String(err),
        timeout: 3000,
      });
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

  // Configuration for the 3x3 tool grid
  const toolActions = [
    {
      id: 'cover_summary',
      label: '封面 / 摘要',
      icon: <ImageIcon className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform" />,
      onClick: handleOpenSummaryCover,
    },
    {
      id: 'clean_url',
      label: copiedState === 'clean_url' ? '已复制' : '净化链接',
      icon:
        copiedState === 'clean_url' ? (
          <Check className="w-4 h-4 text-success" />
        ) : (
          <ShieldCheck className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
        ),
      onClick: handleCopyCleanUrl,
    },
    {
      id: 'content_image',
      label: '生成图片',
      icon: <Camera className="w-4 h-4 text-indigo-500 group-hover:scale-110 transition-transform" />,
      onClick: handleGenerateImage,
    },
    {
      id: 'export_json',
      label: '导出 JSON',
      icon: <FileJson className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />,
      onClick: handleExportJson,
    },
    {
      id: 'edit_md',
      label: '编辑 MD',
      icon: <Edit3 className="w-4 h-4 text-purple-500 group-hover:scale-110 transition-transform" />,
      onClick: handleEditMarkdown,
    },
    {
      id: 'generate_md',
      label: '生成 Markdown',
      icon: <FileCode className="w-4 h-4 text-cyan-500 group-hover:scale-110 transition-transform" />,
      onClick: handleGenerateMarkdown,
    },
    {
      id: 'bundle_zip',
      label: isBundling ? `${bundlePercent}% 打包中` : 'MD+图片打包',
      icon: isBundling ? (
        <Loader2 className="w-4 h-4 text-rose-500 animate-spin" />
      ) : (
        <Archive className="w-4 h-4 text-rose-500 group-hover:scale-110 transition-transform" />
      ),
      disabled: isBundling,
      onClick: handleDownloadBundleZip,
    },
    {
      id: 'download_pdf',
      label: '下载 PDF',
      icon: <Printer className="w-4 h-4 text-orange-500 group-hover:scale-110 transition-transform" />,
      onClick: handleExportPdf,
    },
    {
      id: 'download_word',
      label: isExportingWord ? '生成中...' : '下载 Word',
      icon: isExportingWord ? (
        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
      ) : (
        <FileSpreadsheet className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
      ),
      disabled: isExportingWord,
      onClick: handleExportWord,
    },
  ];

  return (
    <div className="flex flex-col gap-2 bg-zinc-50/70 dark:bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 transition-all">
      {/* Header with collapse toggle */}
      <div
        className="flex items-center justify-between cursor-pointer select-none px-0.5"
        onClick={() => setIsActionsExpanded(!isActionsExpanded)}
      >
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
            快捷工具箱 (10项功能)
          </span>
        </div>
        <button
          type="button"
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-0.5 rounded cursor-pointer"
          aria-label={isActionsExpanded ? '折叠工具箱' : '展开工具箱'}
        >
          {isActionsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {isActionsExpanded && (
        <div className="flex flex-col gap-2 pt-0.5">
          {/* 3x3 Grid of Action Cards */}
          <div className="grid grid-cols-3 gap-1.5">
            {toolActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className="flex flex-col items-center justify-center py-2 px-1 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/70 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-blue-400/70 dark:hover:border-blue-500/70 hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all text-center gap-1 cursor-pointer group disabled:opacity-50 disabled:pointer-events-none"
              >
                {action.icon}
                <span className="text-[10px] font-medium text-zinc-700 dark:text-zinc-200 group-hover:text-foreground tracking-tight leading-tight select-none">
                  {action.label}
                </span>
              </button>
            ))}
          </div>

          {/* Featured Action: Generate Poster */}
          <button
            type="button"
            onClick={handleGeneratePoster}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-blue-50/90 hover:bg-blue-100/90 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 border border-blue-200/80 dark:border-blue-800/60 text-blue-600 dark:text-blue-400 font-medium text-xs shadow-xs hover:shadow-sm transition-all cursor-pointer active:scale-[0.99] group"
          >
            <Sparkles className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
            <span>生成分享精美海报</span>
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

      {showContentImageModal && (
        <ContentImageModal
          grabbedContent={grabbedContent}
          onClose={() => setShowContentImageModal(false)}
        />
      )}
    </div>
  );
};


