import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Printer,
  FileSpreadsheet,
  Copy,
  Check,
  X,
  Loader2,
  ExternalLink,
  Clock,
  Sparkles,
  Eye,
  Edit3,
  Columns,
  RotateCcw,
} from 'lucide-react';
import { Button, ButtonGroup, Tooltip, Chip, Toast, toast } from '@heroui/react';
import type { DocViewerPayload } from '../../src/utils/docViewerHelper';
import { exportWord } from '../../src/utils/exporters/wordExporter';
import { htmlToMarkdown } from '../../src/utils/markdownConverter';
import { markdownToHtml } from '../../src/utils/markdownToHtml';

type ViewMode = 'preview' | 'edit' | 'split';

export const DocViewerApp: React.FC = () => {
  const [data, setData] = useState<DocViewerPayload | null>(null);
  const [initialMarkdown, setInitialMarkdown] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [isModified, setIsModified] = useState(false);
  const [mode, setMode] = useState<ViewMode>('preview');
  const [loading, setLoading] = useState(true);
  const [isExportingWord, setIsExportingWord] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);

  // Synchronized scroll refs
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const isScrollingRef = useRef<'editor' | 'preview' | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 1. Load document payload from chrome.storage.local or URL params fallback
  useEffect(() => {
    const loadPayload = async () => {
      try {
        const res = await chrome.storage.local.get('viewer_doc');
        if (res.viewer_doc && typeof res.viewer_doc === 'object') {
          const payload = res.viewer_doc as DocViewerPayload;
          setData(payload);
          const md = htmlToMarkdown(payload.htmlContent, payload.pageUrl);
          setInitialMarkdown(md);
          setMarkdown(md);
          setLoading(false);
          return;
        }

        // Fallback: check search params
        const params = new URLSearchParams(window.location.search);
        const titleParam = params.get('title');
        const contentParam = params.get('content');
        if (titleParam || contentParam) {
          const fallbackPayload: DocViewerPayload = {
            title: decodeURIComponent(titleParam || '文档导出与打印预览'),
            htmlContent: decodeURIComponent(contentParam || '<p class="empty-content">（暂无正文内容）</p>'),
            pageUrl: params.get('url') ? decodeURIComponent(params.get('url')!) : undefined,
            exportDate: new Date().toLocaleDateString('zh-CN'),
            timestamp: Date.now(),
          };
          setData(fallbackPayload);
          const md = htmlToMarkdown(fallbackPayload.htmlContent, fallbackPayload.pageUrl);
          setInitialMarkdown(md);
          setMarkdown(md);
        }
      } catch (err) {
        console.error('Failed to load document viewer payload:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPayload();
  }, []);

  // Sync edited Markdown to rendered HTML
  const currentHtmlContent = useMemo(() => {
    if (!isModified && data?.htmlContent) {
      return data.htmlContent;
    }
    return markdownToHtml(markdown);
  }, [markdown, isModified, data?.htmlContent]);

  // Handle Markdown text editing
  const handleMarkdownChange = (newMd: string) => {
    setMarkdown(newMd);
    setIsModified(true);
  };

  // Reset to original
  const handleResetToOriginal = () => {
    setMarkdown(initialMarkdown);
    setIsModified(false);
    toast.info('已恢复为原始内容', { timeout: 1500 });
  };

  // Synchronized scroll handlers between editor & preview (hover-driven for zero-jitter smoothness)
  const activePanelRef = useRef<'editor' | 'preview' | null>(null);

  const handleEditorScroll = () => {
    if (mode !== 'split' || activePanelRef.current === 'preview') return;
    const editor = editorRef.current;
    const preview = previewRef.current;
    if (!editor || !preview) return;

    const editorScrollable = editor.scrollHeight - editor.clientHeight;
    if (editorScrollable > 0) {
      const percentage = editor.scrollTop / editorScrollable;
      const previewScrollable = preview.scrollHeight - preview.clientHeight;
      preview.scrollTop = percentage * previewScrollable;
    }
  };

  const handlePreviewScroll = () => {
    if (mode !== 'split' || activePanelRef.current === 'editor') return;
    const editor = editorRef.current;
    const preview = previewRef.current;
    if (!editor || !preview) return;

    const previewScrollable = preview.scrollHeight - preview.clientHeight;
    if (previewScrollable > 0) {
      const percentage = preview.scrollTop / previewScrollable;
      const editorScrollable = editor.scrollHeight - editor.clientHeight;
      editor.scrollTop = percentage * editorScrollable;
    }
  };

  // 2. Action Handlers
  const handlePrint = useCallback(() => {
    // If in pure edit mode, switch to preview before printing
    if (mode === 'edit') {
      setMode('preview');
      setTimeout(() => {
        window.focus();
        window.print();
      }, 100);
    } else {
      window.focus();
      window.print();
    }
  }, [mode]);

  const handleExportWord = async () => {
    if (!data || isExportingWord) return;
    const filename = `${data.title.slice(0, 30).trim() || 'document'}_${Date.now()}.docx`;
    try {
      setIsExportingWord(true);
      await exportWord(
        data.title,
        currentHtmlContent,
        filename,
        data.pageUrl,
        data.grabbedContent,
      );
      toast.success('Word 文档已开始下载', {
        description: filename,
        timeout: 2500,
      });
    } catch (err) {
      console.error('Failed to export Word document:', err);
      toast.danger('Word 导出失败', {
        description: String(err),
        timeout: 3000,
      });
    } finally {
      setIsExportingWord(false);
    }
  };

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopiedMd(true);
      toast.success('已复制 Markdown 内容到剪贴板', {
        description: '可直接粘贴至 Notion, Obsidian, 语雀 等笔记软件',
        timeout: 2500,
      });
      setTimeout(() => setCopiedMd(false), 2000);
    } catch (err) {
      console.error('Failed to copy Markdown:', err);
      toast.danger('复制 Markdown 失败', { timeout: 2000 });
    }
  };

  const handleClose = useCallback(() => {
    try {
      window.close();
    } catch {
      // Fallback
    }
  }, []);

  // 3. Global Keyboard Shortcuts (Cmd/Ctrl+P to print, Esc to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handlePrint();
      } else if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrint, handleClose]);

  // Compute text statistics
  const stats = useMemo(() => {
    const wordCount = markdown.replace(/\s+/g, '').length;
    const imgMatches = markdown.match(/!\[.*?\]\(.*?\)/g);
    const imgCount = imgMatches ? imgMatches.length : 0;
    return {
      wordCount,
      imgCount,
    };
  }, [markdown]);

  if (loading) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-background text-foreground gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-sm font-medium text-muted-foreground">正在载入文档排版...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-background text-foreground gap-3">
        <p className="text-sm text-muted-foreground">未找到文档数据</p>
        <Button variant="outline" size="sm" onClick={handleClose}>
          关闭标签页
        </Button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 dark:bg-zinc-950 text-foreground flex flex-col antialiased">
      {/* Toast Notification Provider */}
      <Toast.Provider placement="bottom end" />

      {/* Top Fixed Header Toolbar (Hidden when printing) */}
      <header className="h-14 shrink-0 z-50 bg-background/90 backdrop-blur-lg border-b border-border shadow-xs px-4 sm:px-8 flex items-center justify-between gap-4 no-print select-none">
        {/* Left: Document Info & Badges */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate max-w-[160px] sm:max-w-xs md:max-w-md">
              {data.title}
            </span>
            <Chip size="sm" variant="soft" color="accent">
              {stats.wordCount} 字
            </Chip>
            {stats.imgCount > 0 && (
              <Chip size="sm" variant="soft" color="default">
                {stats.imgCount} 张图片
              </Chip>
            )}
            {isModified && (
              <Chip size="sm" variant="soft" color="warning">
                已编辑
              </Chip>
            )}
          </div>
        </div>

        {/* Center: Mode Switcher (Preview / Edit / Split) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <ButtonGroup size="sm" variant="outline">
            <Button
              variant={mode === 'preview' ? 'primary' : 'ghost'}
              onClick={() => setMode('preview')}
              aria-label="预览模式"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">预览</span>
            </Button>
            <Button
              variant={mode === 'edit' ? 'primary' : 'ghost'}
              onClick={() => setMode('edit')}
              aria-label="编辑模式"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">编辑</span>
            </Button>
            <Button
              variant={mode === 'split' ? 'primary' : 'ghost'}
              onClick={() => setMode('split')}
              aria-label="双栏对比模式"
              className="hidden md:flex"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>双栏</span>
            </Button>
          </ButtonGroup>

          {isModified && (
            <Tooltip delay={150}>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                onClick={handleResetToOriginal}
                aria-label="重置为原始内容"
              >
                <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
              <Tooltip.Content showArrow>
                <Tooltip.Arrow />
                <div>重置为原始内容</div>
              </Tooltip.Content>
            </Tooltip>
          )}
        </div>

        {/* Right: Actions Button Group using standard HeroUI Components */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Download Word (.docx) */}
          <Tooltip delay={150}>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportWord}
              isDisabled={isExportingWord}
            >
              {isExportingWord ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 text-primary" />
              )}
              <span className="hidden sm:inline">下载 Word</span>
            </Button>
            <Tooltip.Content showArrow>
              <Tooltip.Arrow />
              <div>导出为标准 Microsoft Word (.docx) 文档</div>
            </Tooltip.Content>
          </Tooltip>

          {/* Copy Markdown */}
          <Tooltip delay={150}>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyMarkdown}
            >
              {copiedMd ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{copiedMd ? '已复制' : '复制 MD'}</span>
            </Button>
            <Tooltip.Content showArrow>
              <Tooltip.Arrow />
              <div>复制当前 Markdown 源码到剪贴板</div>
            </Tooltip.Content>
          </Tooltip>

          {/* Print / Save as PDF (Primary Action) */}
          <Tooltip delay={100}>
            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
            >
              <Printer className="w-4 h-4" />
              <span>立即打印 / 另存为 PDF</span>
            </Button>
            <Tooltip.Content showArrow className="max-w-xs">
              <Tooltip.Arrow />
              <div className="font-semibold mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>导出 PDF 指引</span>
              </div>
              <p className="text-xs leading-relaxed mb-1 opacity-90">
                调出系统打印窗口后，将「目标打印机」设为「另存为 PDF」即可保存干净文档。
              </p>
              <div className="flex justify-end">
                <span className="px-1.5 py-0.5 rounded bg-default-200 text-[10px] font-mono">
                  ⌘ / Ctrl + P
                </span>
              </div>
            </Tooltip.Content>
          </Tooltip>

          {/* Close Tab Button */}
          <Tooltip delay={150}>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              onClick={handleClose}
              aria-label="关闭标签页"
            >
              <X className="w-4 h-4" />
            </Button>
            <Tooltip.Content showArrow>
              <Tooltip.Arrow />
              <div>关闭窗口 (Esc)</div>
            </Tooltip.Content>
          </Tooltip>
        </div>
      </header>

      {/* Main Viewport Container */}
      <main className="flex-1 overflow-hidden p-3 sm:p-5 flex justify-center">
        {mode === 'split' ? (
          /* Split View Mode (Fixed Height, Synchronized Inner Scrolling) */
          <div className="w-full max-w-[1700px] h-full grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Column: Markdown Editor */}
            <section
              onMouseEnter={() => { activePanelRef.current = 'editor'; }}
              className="h-full flex flex-col bg-surface rounded-2xl border border-border shadow-xs overflow-hidden"
            >
              <div className="px-4 py-2.5 bg-default-100/50 border-b border-border flex items-center justify-between text-xs text-muted-foreground select-none shrink-0">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Edit3 className="w-3.5 h-3.5 text-primary" />
                  <span>Markdown 编辑区</span>
                </div>
                <div className="font-mono text-[11px]">
                  {markdown.split('\n').length} 行 • {markdown.length} 字符
                </div>
              </div>
              <textarea
                ref={editorRef}
                value={markdown}
                onChange={(e) => handleMarkdownChange(e.target.value)}
                onScroll={handleEditorScroll}
                placeholder="在此编辑 Markdown 内容..."
                spellCheck={false}
                className="flex-1 w-full p-5 bg-transparent text-foreground font-mono text-[13px] leading-relaxed resize-none outline-none border-none focus:outline-none focus:ring-0 block overflow-y-auto"
              />
            </section>

            {/* Right Column: Real-time Paper Preview */}
            <section
              onMouseEnter={() => { activePanelRef.current = 'preview'; }}
              className="h-full flex flex-col bg-surface rounded-2xl border border-border shadow-xs overflow-hidden"
            >
              <div className="px-4 py-2.5 bg-default-100/50 border-b border-border flex items-center justify-between text-xs text-muted-foreground select-none shrink-0">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Eye className="w-3.5 h-3.5 text-primary" />
                  <span>排版实时预览</span>
                </div>
                <div className="text-[11px] opacity-70">
                  同步滚动 • 所见即所得
                </div>
              </div>
              <div
                ref={previewRef}
                onScroll={handlePreviewScroll}
                className="flex-1 overflow-y-auto p-6 sm:p-10"
              >
                {/* Document Header Info */}
                <header className="border-b border-border pb-5 mb-6">
                  <h1 className="text-2xl font-bold text-foreground leading-tight tracking-tight mb-3">
                    {data.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-y-2 gap-x-5 text-xs text-muted-foreground">
                    {data.pageUrl && (
                      <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                        <span className="font-medium text-foreground shrink-0">来源:</span>
                        <a
                          href={data.pageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline truncate inline-flex items-center gap-1"
                        >
                          <span>{data.pageUrl}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 inline opacity-70" />
                        </a>
                      </div>
                    )}
                    {data.exportDate && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Clock className="w-3.5 h-3.5 opacity-60" />
                        <span className="font-medium text-foreground">采集时间:</span>
                        <span>{data.exportDate}</span>
                      </div>
                    )}
                  </div>
                </header>

                {/* Render Sanitized AST / Markdown HTML Content */}
                <div
                  className="doc-content-body font-sans text-[15px] leading-[1.85] text-foreground"
                  dangerouslySetInnerHTML={{ __html: currentHtmlContent }}
                />
              </div>
            </section>
          </div>
        ) : mode === 'edit' ? (
          /* Pure Edit Mode (Full-width Editor) */
          <div className="w-full max-w-[1000px] h-full flex flex-col bg-surface rounded-2xl border border-border shadow-xs overflow-hidden">
            <div className="px-4 py-2.5 bg-default-100/50 border-b border-border flex items-center justify-between text-xs text-muted-foreground select-none shrink-0">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Edit3 className="w-3.5 h-3.5 text-primary" />
                <span>Markdown 编辑区</span>
              </div>
              <div className="font-mono text-[11px]">
                {markdown.split('\n').length} 行 • {markdown.length} 字符
              </div>
            </div>
            <textarea
              ref={editorRef}
              value={markdown}
              onChange={(e) => handleMarkdownChange(e.target.value)}
              placeholder="在此编辑 Markdown 内容..."
              spellCheck={false}
              className="flex-1 w-full p-6 bg-transparent text-foreground font-mono text-[13.5px] leading-relaxed resize-none outline-none border-none focus:outline-none focus:ring-0 block overflow-y-auto"
            />
          </div>
        ) : (
          /* Pure Preview Mode (Full-height Scrollable Paper View) */
          <div className="w-full h-full overflow-y-auto flex justify-center">
            <article className="document-paper w-full max-w-[860px] my-2 mb-10 bg-surface text-foreground rounded-2xl shadow-xs border border-border p-8 sm:p-14">
              {/* Document Header Info */}
              <header className="border-b border-border pb-6 mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight tracking-tight mb-4">
                  {data.title}
                </h1>
                <div className="flex flex-wrap items-center gap-y-2 gap-x-5 text-xs text-muted-foreground">
                  {data.pageUrl && (
                    <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                      <span className="font-medium text-foreground shrink-0">来源:</span>
                      <a
                        href={data.pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline truncate inline-flex items-center gap-1"
                      >
                        <span>{data.pageUrl}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 inline opacity-70" />
                      </a>
                    </div>
                  )}
                  {data.exportDate && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Clock className="w-3.5 h-3.5 opacity-60" />
                      <span className="font-medium text-foreground">采集时间:</span>
                      <span>{data.exportDate}</span>
                    </div>
                  )}
                </div>
              </header>

              {/* Render Sanitized AST / Markdown HTML Content */}
              <div
                className="doc-content-body font-sans text-[15.5px] leading-[1.85] text-foreground"
                dangerouslySetInnerHTML={{ __html: currentHtmlContent }}
              />
            </article>
          </div>
        )}
      </main>

      {/* Markdown Content Styles & Print Layout Optimization */}
      <style>{`
        /* Markdown / HTML Content Typography */
        .doc-content-body {
          word-break: break-word;
          overflow-wrap: break-word;
        }
        .doc-content-body p {
          margin-top: 0;
          margin-bottom: 1.25em;
          line-height: 1.85;
          text-align: justify;
        }
        .doc-content-body h1,
        .doc-content-body h2,
        .doc-content-body h3,
        .doc-content-body h4,
        .doc-content-body h5,
        .doc-content-body h6 {
          color: inherit;
          font-weight: 700;
          line-height: 1.4;
          margin-top: 1.8em;
          margin-bottom: 0.75em;
        }
        .doc-content-body h1 {
          font-size: 1.75em;
          border-bottom: 1px solid var(--border, #e2e8f0);
          padding-bottom: 0.35em;
        }
        .doc-content-body h2 {
          font-size: 1.45em;
          border-bottom: 1px solid var(--border, #f1f5f9);
          padding-bottom: 0.25em;
        }
        .doc-content-body h3 {
          font-size: 1.25em;
        }
        .doc-content-body h4 {
          font-size: 1.1em;
        }

        /* List Items - Breathing room & clear hierarchy */
        .doc-content-body ul,
        .doc-content-body ol {
          margin-top: 0.8em;
          margin-bottom: 1.4em;
          padding-left: 1.6em;
        }
        .doc-content-body ul {
          list-style-type: disc;
        }
        .doc-content-body ol {
          list-style-type: decimal;
        }
        .doc-content-body li {
          margin-top: 0.6em;
          margin-bottom: 0.6em;
          line-height: 1.8;
          padding-left: 0.2em;
        }
        .doc-content-body li > p {
          margin-bottom: 0.4em;
        }
        .doc-content-body li > ul,
        .doc-content-body li > ol {
          margin-top: 0.4em;
          margin-bottom: 0.4em;
        }

        /* Blockquotes */
        .doc-content-body blockquote {
          margin: 1.5em 0;
          padding: 0.8em 1.2em;
          border-left: 4px solid var(--heroui-primary, #3b82f6);
          background: rgba(59, 130, 246, 0.05);
          border-radius: 0 8px 8px 0;
        }
        .doc-content-body blockquote p {
          margin: 0;
        }

        /* Inline code and Code blocks */
        .doc-content-body code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.88em;
          padding: 0.2em 0.45em;
          background: rgba(125, 125, 125, 0.12);
          border-radius: 4px;
        }
        .doc-content-body pre {
          margin: 1.6em 0;
          padding: 1.1em 1.4em;
          background: #0f172a;
          color: #f8fafc;
          border-radius: 10px;
          overflow-x: auto;
          line-height: 1.65;
        }
        .doc-content-body pre code {
          background: transparent !important;
          color: inherit !important;
          padding: 0;
          font-size: 0.9em;
        }

        /* Tables */
        .doc-content-body table {
          width: 100%;
          border-collapse: collapse;
          margin: 1.6em 0;
          font-size: 0.92em;
          border-radius: 8px;
          overflow: hidden;
        }
        .doc-content-body th,
        .doc-content-body td {
          border: 1px solid var(--border, #e2e8f0);
          padding: 0.75em 1em;
          text-align: left;
        }
        .doc-content-body th {
          background: rgba(125, 125, 125, 0.06);
          font-weight: 600;
        }

        /* Media */
        .doc-content-body img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 1.4em auto;
          display: block;
        }
        .doc-content-body hr {
          border: none;
          border-top: 1px solid var(--border, #e2e8f0);
          margin: 2em 0;
        }
        .doc-content-body a {
          color: var(--heroui-primary, #2563eb);
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        /* Print Mode */
        @page {
          size: A4;
          margin: 12mm;
        }
        @media print {
          html, body {
            height: auto !important;
            overflow: visible !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            color-scheme: light !important;
          }
          main {
            height: auto !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          .no-print {
            display: none !important;
          }
          .document-paper {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
          }
          .ast-video-card,
          .ast-image-card,
          pre,
          blockquote,
          table {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
};
