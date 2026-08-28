import React, { useEffect, useState } from 'react';
import { Modal, Button } from '@heroui/react';
import { Download, Copy, Check, Loader2, Image as ImageIcon } from 'lucide-react';
import type { GrabbedContent } from '../../../../src/types';
import { generateContentImageDataUrl } from '../../../../src/utils/contentImageGenerator';

interface ContentImageModalProps {
  grabbedContent: GrabbedContent;
  onClose: () => void;
}

export const ContentImageModal: React.FC<ContentImageModalProps> = ({
  grabbedContent,
  onClose,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    generateContentImageDataUrl(grabbedContent)
      .then((url) => {
        if (isMounted) {
          setImageUrl(url);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to generate content image:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [grabbedContent]);

  const handleDownload = () => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    const title = (grabbedContent.tdk.title || 'content').slice(0, 25).trim();
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
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
    }
  };

  return (
    <Modal.Root isOpen={true} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container placement="top" className="p-2.5 pt-3">
          <Modal.Dialog className="p-3.5 max-w-full w-full">
            {/* Modal Header */}
            <Modal.Header className="pr-6">
              <Modal.Heading className="flex items-center gap-1.5 text-xs font-semibold">
                <ImageIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>选区内容快照生成</span>
              </Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>

            {/* Image Preview Container */}
            <Modal.Body className="mt-2">
              <div className="flex flex-col items-center justify-center min-h-[340px] max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-zinc-900/10 dark:bg-black/30 p-2">
                {loading ? (
                  <div className="flex flex-col items-center gap-2 text-muted py-12">
                    <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
                    <span className="text-xs font-medium text-zinc-500">正在生成高清快照卡片...</span>
                  </div>
                ) : imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Generated Content Preview"
                    className="max-h-full max-w-full object-contain rounded-md shadow-md border border-border/60 transition-all hover:scale-[1.01]"
                  />
                ) : (
                  <div className="text-xs text-muted">图片生成失败，请重试</div>
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
