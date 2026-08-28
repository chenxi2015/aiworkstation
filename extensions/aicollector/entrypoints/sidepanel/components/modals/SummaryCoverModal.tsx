import React from 'react';
import { Modal, Button } from '@heroui/react';
import { Image as ImageIcon, FileText, ExternalLink } from 'lucide-react';
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
    <Modal.Root isOpen={true} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container placement="top" className="p-2.5 pt-3">
          <Modal.Dialog className="p-3.5 max-w-full w-full">
            {/* Modal Header */}
            <Modal.Header className="pr-6">
              <Modal.Heading className="flex items-center gap-1.5 text-xs font-semibold">
                <FileText className="w-4 h-4 text-accent shrink-0" />
                <span>封面与文章摘要</span>
              </Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>

            {/* Modal Body */}
            <Modal.Body className="mt-2 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
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

                <div className="p-2.5 rounded-md bg-surface-tertiary border border-border text-foreground text-xs leading-relaxed whitespace-pre-wrap select-text max-h-48 overflow-y-auto">
                  {summary.summary}
                </div>
              </div>
            </Modal.Body>

            {/* Modal Footer */}
            <Modal.Footer className="flex items-center justify-end w-full mt-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={onClose}
                className="px-4 text-xs cursor-pointer"
              >
                关闭
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
};
