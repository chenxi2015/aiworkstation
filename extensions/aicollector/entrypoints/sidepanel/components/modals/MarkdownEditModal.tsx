import React, { useState } from 'react';
import { Modal, Button } from '@heroui/react';
import { Download, Copy, Check, FileText } from 'lucide-react';
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
    <Modal.Root isOpen={true} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container placement="top" className="p-2.5 pt-3">
          <Modal.Dialog className="p-3.5 max-w-full w-full">
            {/* Modal Header */}
            <Modal.Header>
              <Modal.Heading className="flex items-center gap-1.5 font-semibold">
                <FileText className="w-4 h-4 text-accent shrink-0" />
                <span>生成 / 编辑 Markdown</span>
              </Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>

            {/* Modal Body & Editor Area */}
            <Modal.Body className="mt-4">
              <div className="w-full rounded-lg border border-border bg-default-50/40 transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary overflow-hidden">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full h-72 p-3 bg-transparent text-foreground font-mono text-[11px] leading-relaxed resize-none outline-none border-none focus:outline-none focus:ring-0 block"
                  placeholder="Markdown 内容..."
                  spellCheck={false}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted mt-2">
                <span>支持自由编辑内容，可一键复制或下载：</span>
                <span>{content.length} 字符</span>
              </div>
            </Modal.Body>

            {/* Modal Footer */}
            <Modal.Footer className="flex w-full gap-2 mt-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCopy}
                className="flex-1 min-w-0 px-2 text-xs"
              >
                {copied ? <Check className="w-3.5 h-3.5 mr-1 shrink-0 text-success" /> : <Copy className="w-3.5 h-3.5 mr-1 shrink-0" />}
                <span className="truncate">{copied ? '已复制' : '复制 Markdown'}</span>
              </Button>

              <Button
                size="sm"
                variant="primary"
                onClick={handleDownload}
                className="flex-1 min-w-0 px-2 text-xs"
              >
                <Download className="w-3.5 h-3.5 mr-1 shrink-0" />
                <span className="truncate">下载 .md 文件</span>
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
};


