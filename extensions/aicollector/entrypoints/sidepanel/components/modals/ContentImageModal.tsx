import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, toast } from '@heroui/react';
import { Download, Copy, Check, Loader2, Image as ImageIcon, RefreshCw, ExternalLink } from 'lucide-react';
import type { GrabbedContent } from '../../../../src/types';
import { generateContentImageDataUrl } from '../../../../src/utils/contentImageGenerator';
import { openImageViewerInNewTab } from '../../../../src/utils/imageViewerHelper';

interface ContentImageModalProps {
  grabbedContent: GrabbedContent;
  cachedUrl?: string | null;
  onGenerated?: (url: string) => void;
  onClose: () => void;
}

export const ContentImageModal: React.FC<ContentImageModalProps> = ({
  grabbedContent,
  cachedUrl,
  onGenerated,
  onClose,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(cachedUrl || null);
  const [loading, setLoading] = useState<boolean>(!cachedUrl);
  const [copied, setCopied] = useState(false);

  const title = (grabbedContent.tdk.title || '选区内容').slice(0, 25).trim();

  const handleGenerate = useCallback((isManual = false) => {
    setLoading(true);
    generateContentImageDataUrl(grabbedContent)
      .then((url) => {
        setImageUrl(url);
        setLoading(false);
        onGenerated?.(url);
        if (isManual) {
          toast.success('已重新生成快照卡片', { timeout: 2000 });
        }
      })
      .catch((err) => {
        console.error('Failed to generate content image:', err);
        setLoading(false);
        toast.danger('生成快照卡片失败，请重试', { timeout: 2500 });
      });
  }, [grabbedContent, onGenerated]);

  useEffect(() => {
    if (!imageUrl) {
      handleGenerate();
    }
  }, [imageUrl, handleGenerate]);

  const handleDownload = () => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `image_${title}_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyImage = async () => {
    if (!imageUrl) return;
    try {
      const resp = await fetch(imageUrl);
      const blob = await resp.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      setCopied(true);
      toast.success('已复制快照图片到剪贴板', { timeout: 2000 });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
      toast.danger('复制图片失败', { timeout: 2500 });
    }
  };

  const handleOpenInNewTab = () => {
    if (!imageUrl) return;
    openImageViewerInNewTab({
      url: imageUrl,
      title: `${title} - 选区快照`,
      dimensions: grabbedContent.dimensions,
      tag: grabbedContent.tag,
    });
  };

  return (
    <Modal.Root isOpen={true} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container placement="top" className="p-2.5 pt-3">
          <Modal.Dialog className="p-3.5 max-w-full w-full">
            {/* Modal Header */}
            <Modal.Header className="flex items-center justify-between gap-2">
              <Modal.Heading className="flex items-center gap-1.5 font-semibold min-w-0 flex-1">
                <ImageIcon className="w-4 h-4 text-accent shrink-0" />
                <span className="truncate">选区内容快照生成</span>
              </Modal.Heading>

              {/* Action Toolbar */}
              <div className="flex items-center gap-1 shrink-0 mr-1">
                {/* Re-generate button */}
                <button
                  type="button"
                  onClick={() => handleGenerate(true)}
                  disabled={loading}
                  className="p-1 rounded text-muted hover:text-foreground hover:bg-surface-tertiary transition-colors cursor-pointer disabled:opacity-50"
                  title="重新生成快照卡片"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-accent' : ''}`} />
                </button>

                {/* Open in preview viewer */}
                {imageUrl && !loading && (
                  <button
                    type="button"
                    onClick={handleOpenInNewTab}
                    className="p-1 rounded text-muted hover:text-foreground hover:bg-surface-tertiary transition-colors cursor-pointer"
                    title="在预览组件中打开"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <Modal.CloseTrigger />
            </Modal.Header>

            {/* Image Preview Container */}
            <Modal.Body className="mt-4">
              <div className="flex flex-col items-center justify-center min-h-[320px] max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-default-50/40 p-3">
                {loading ? (
                  <div className="flex flex-col items-center gap-2 text-muted py-12">
                    <Loader2 className="w-7 h-7 animate-spin text-accent" />
                    <span className="text-xs font-medium text-muted">正在生成高清快照卡片...</span>
                  </div>
                ) : imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Generated Content Preview"
                    className="max-h-full max-w-full object-contain rounded-md shadow-sm border border-border/50 transition-all hover:scale-[1.01]"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted py-12 text-center m-auto">
                    <span className="text-xs text-muted">图片生成失败，请重试</span>
                    <Button size="sm" variant="secondary" onClick={() => handleGenerate(true)} className="text-xs mt-2">
                      点击重新生成
                    </Button>
                  </div>
                )}
              </div>
            </Modal.Body>

            {/* Modal Footer */}
            <Modal.Footer className="flex w-full gap-2 mt-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCopyImage}
                isDisabled={!imageUrl || loading}
                className="flex-1 min-w-0 px-2 text-xs cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 mr-1 shrink-0 text-success" /> : <Copy className="w-3.5 h-3.5 mr-1 shrink-0" />}
                <span className="truncate">{copied ? '已复制图片' : '复制图片'}</span>
              </Button>

              <Button
                size="sm"
                variant="primary"
                onClick={handleDownload}
                isDisabled={!imageUrl || loading}
                className="flex-1 min-w-0 px-2 text-xs cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
              >
                <Download className="w-3.5 h-3.5 mr-1 shrink-0" />
                <span className="truncate">下载 PNG</span>
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
};
