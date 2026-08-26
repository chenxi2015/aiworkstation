import React, { useState } from 'react';
import { Button } from '@heroui/react';
import { X, Download, Copy, Check, FileText } from 'lucide-react';
import { exportMarkdown } from '../../../../src/utils/documentExporter';

interface MarkdownEditModalProps {
  initialMarkdown: string;
  title: string;
  onClose: () => void;
}

export const MarkdownEditModal: React.FC<MarkdownEditModalProps> = ({
  initialMarkdown,
  title,
  onClose,
}) => {
  const [content, setContent] = useState(initialMarkdown);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy markdown:', err);
    }
  };

  const handleDownload = () => {
    const filename = `${title.slice(0, 30).trim() || 'document'}_${Date.now()}.md`;
    exportMarkdown(content, filename);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border/80 rounded-lg shadow-xl w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <div className="flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-accent" />
            <h3 className="text-xs font-semibold text-foreground">编辑 / 查看 Markdown</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-muted hover:text-foreground hover:bg-surface-tertiary transition-colors"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Editor Area */}
        <div className="p-3 flex-1 flex flex-col gap-2 overflow-hidden">
          <div className="text-[11px] text-muted flex justify-between">
            <span>支持自由编辑内容，可一键复制或下载：</span>
            <span>{content.length} 字符</span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full flex-1 min-h-[300px] p-2.5 rounded-md bg-surface-tertiary border border-border text-foreground font-mono text-[11px] leading-relaxed resize-none focus:outline-none focus:border-accent"
            placeholder="Markdown 内容..."
            spellCheck={false}
          />
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 px-3 py-2.5 border-t border-border bg-surface-secondary">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleCopy}
            className="text-xs cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-success mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
            {copied ? '已复制' : '复制 Markdown'}
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={handleDownload}
            className="text-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            下载 .md 文件
          </Button>
        </div>
      </div>
    </div>
  );
};
