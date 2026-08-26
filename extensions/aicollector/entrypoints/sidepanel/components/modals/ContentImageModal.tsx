import React, { useEffect, useState } from 'react';
import { Button } from '@heroui/react';
import { X, Download, Copy, Check, Loader2, Image as ImageIcon } from 'lucide-react';
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
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border/80 rounded-xl shadow-2xl w-full max-w-[420px] flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
          <div className="flex items-center gap-1.5">
            <ImageIcon className="w-4 h-4 text-indigo-500" />
            <h3 className="text-xs font-semibold text-foreground">选区内容快照生成</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-muted hover:text-foreground hover:bg-surface-tertiary transition-colors cursor-pointer"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Image Preview Container */}
        <div className="p-3.5 flex-1 flex flex-col items-center justify-center min-h-[380px] max-h-[66vh] overflow-y-auto bg-zinc-900/10 dark:bg-black/30">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-muted py-12">
              <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
              <span className="text-xs font-medium text-zinc-500">正在生成高清快照卡片...</span>
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt="Generated Content Preview"
              className="max-h-full max-w-full object-contain rounded-lg shadow-lg border border-border/60 transition-all hover:scale-[1.01]"
            />
          ) : (
            <div className="text-xs text-muted">图片生成失败，请重试</div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 px-3.5 py-2.5 border-t border-border bg-surface-secondary">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleCopyImage}
            isDisabled={!imageUrl || loading}
            className="text-xs cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-success mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
            {copied ? '已复制图片' : '复制图片'}
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={handleDownload}
            isDisabled={!imageUrl || loading}
            className="text-xs cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            下载 PNG
          </Button>
        </div>
      </div>
    </div>
  );
};
