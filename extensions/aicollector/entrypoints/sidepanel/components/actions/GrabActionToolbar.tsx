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
  exportMarkdownWithImages,
  exportWord,
  exportPdf,
  exportJson,
  createStructuredContentJson,
  cleanDocumentTitle,
  convertGrabbedToAst,
  exportAstJson,
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
  const [showMarkdownModal, setShowMarkdownModal] = useState(false);
  const [showPosterModal, setShowPosterModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showContentImageModal, setShowContentImageModal] = useState(false);
  const [isActionsExpanded, setIsActionsExpanded] = useState(true);

  // Toast / feedback states
  const [copiedState, setCopiedState] = useState<string | null>(null);
  const [isBundling, setIsBundling] = useState(false);
  const [bundlePercent, setBundlePercent] = useState(0);
  const [isExportingWord, setIsExportingWord] = useState(false);

  const title = cleanDocumentTitle(grabbedContent.tdk.title || '选区内容');
  const rawUrl = grabbedContent.url;
  const sanitizedUrl = cleanUrl(rawUrl);

  const triggerCopyFeedback = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedState(key);
    setTimeout(() => setCopiedState(null), 2000);
  };

  // 1. Cover & Summary Modal Trigger
  const handleOpenSummaryCover = () => {
    setShowSummaryModal(true);
  };

  // 2. Clean URL copy
  const handleCopyCleanUrl = () => {
    triggerCopyFeedback('clean_url', sanitizedUrl);
    toast.success('已净化并复制链接', {
      description: sanitizedUrl,
      timeout: 2200,
    });
  };

  // 3. Generate Content Image Modal
  const handleGenerateImage = () => {
    setShowContentImageModal(true);
  };

  // 4. Export Document AST JSON (.json)
  const handleExportJson = () => {
    try {
      const ast = convertGrabbedToAst(grabbedContent);
      const filename = `${title.slice(0, 30).trim() || 'data'}_ast_${Date.now()}.json`;
      exportAstJson(ast, filename);
      toast.success('已导出 Document AST 语法树', {
        description: `${filename} (${ast.metadata.stats.blockCount} 块, ${ast.metadata.stats.wordCount} 字)`,
        timeout: 2500,
      });
    } catch (err) {
      console.error('Failed to export AST:', err);
      toast.danger('导出 JSON 失败', {
        description: String(err),
        timeout: 3000,
      });
    }
  };

  // 5. Generate / Edit Markdown Modal
  const handleGenerateMarkdown = () => {
    setShowMarkdownModal(true);
  };

  // 6. Generate Poster Modal
  const handleGeneratePoster = () => {
    setShowPosterModal(true);
  };

  // 7. Bundle ZIP (MD + Images)
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

  // 8. Download PDF (Print View)
  const handleExportPdf = () => {
    exportPdf(title, grabbedContent.selectedHtml, grabbedContent.url, grabbedContent);
    toast.info('已开启打印 / 导出 PDF 视图', {
      description: '请在打印窗口中选择「另存为 PDF」',
      timeout: 2500,
    });
  };

  // 9. Download Word (.docx/.doc)
  const handleExportWord = async () => {
    if (isExportingWord) return;
    const filename = `${title.slice(0, 30).trim() || 'document'}_${Date.now()}.docx`;
    try {
      setIsExportingWord(true);
      await exportWord(title, grabbedContent.selectedHtml, filename, grabbedContent.url, grabbedContent);
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

  // Summary & Cover metadata
  const coverInfo = extractCover(grabbedContent);
  const summaryInfo = extractSummary(grabbedContent);
  const currentMarkdown = htmlToMarkdown(grabbedContent.selectedHtml, grabbedContent.url);

  // Configuration for the tool grid (9 actions)
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
      label: '导出 JSON (AST)',
      icon: <FileJson className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />,
      onClick: handleExportJson,
    },
    {
      id: 'generate_md',
      label: '生成 Markdown',
      icon: <FileCode className="w-4 h-4 text-cyan-500 group-hover:scale-110 transition-transform" />,
      onClick: handleGenerateMarkdown,
    },

    {
      id: 'generate_poster',
      label: '生成海报',
      icon: <Sparkles className="w-4 h-4 text-pink-500 group-hover:scale-110 transition-transform" />,
      onClick: handleGeneratePoster,
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
            快捷工具箱 ({toolActions.length}项功能)
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
        </div>
      )}

      {/* Modals */}
      {showMarkdownModal && (
        <MarkdownEditModal
          initialMarkdown={currentMarkdown}
          title={title}
          onClose={() => setShowMarkdownModal(false)}
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


