import React from 'react';
import { Button } from '@heroui/react';
import { X, Image as ImageIcon, FileText, ExternalLink } from 'lucide-react';
import { CopyButton } from '../common/CopyButton';
import { SafeImage } from '../common/SafeImage';
import type { CoverInfo, SummaryInfo } from '../../../../src/utils/contentSummarizer';

interface SummaryCoverModalProps {
  cover: CoverInfo | null;
  summary: SummaryInfo;
  pageUrl: string;
  onClose: () => void;
}

export const SummaryCoverModal: React.FC<SummaryCoverModalProps> = ({
  cover,
  summary,
  pageUrl,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border/80 rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <div className="flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-accent" />
            <h3 className="text-xs font-semibold text-foreground">封面与文章摘要</h3>
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

        <div className="p-3 flex-1 flex flex-col gap-3 overflow-y-auto">
          {/* Cover Image Section */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-muted flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5 text-accent" />
                提取封面:
              </span>
              {cover && (
                <div className="flex items-center gap-2">
                  <CopyButton text={cover.url} title="复制封面图片链接" />
                  <a
                    href={cover.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted hover:text-accent p-0.5"
                    title="新标签页打开原图"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>

            {cover ? (
              <div className="relative rounded-md overflow-hidden border border-border bg-surface-tertiary max-h-48 flex items-center justify-center">
                <SafeImage
                  src={cover.url}
                  pageUrl={pageUrl}
                  alt="Cover"
                  className="max-h-48 w-full object-cover"
                />
              </div>
            ) : (
              <div className="p-4 rounded-md bg-surface-tertiary text-center text-xs text-muted">
                未检测到专属封面图片
              </div>
            )}
          </div>

          {/* Article Summary Section */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-muted flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-accent" />
                文章摘要 ({summary.wordCount} 字):
              </span>
              <CopyButton text={summary.summary} title="复制摘要文本" />
            </div>

            <div className="p-2.5 rounded-md bg-surface-tertiary border border-border text-foreground text-xs leading-relaxed whitespace-pre-wrap select-text">
              {summary.summary}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end px-3 py-2 border-t border-border bg-surface-secondary">
          <Button
            size="sm"
            variant="secondary"
            onClick={onClose}
            className="text-xs cursor-pointer"
          >
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
};
