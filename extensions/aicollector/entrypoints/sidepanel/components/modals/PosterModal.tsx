import React, { useEffect, useState } from 'react';
import { Button } from '@heroui/react';
import { X, Download, Copy, Check, Loader2, Sparkles } from 'lucide-react';
import { generatePosterDataUrl, type PosterOptions } from '../../../../src/utils/posterGenerator';

interface PosterModalProps {
  options: PosterOptions;
  onClose: () => void;
}

export const PosterModal: React.FC<PosterModalProps> = ({ options, onClose }) => {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    generatePosterDataUrl(options)
      .then((url) => {
        if (isMounted) {
          setPosterUrl(url);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to generate poster:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [options]);

  const handleDownload = () => {
    if (!posterUrl) return;
    const a = document.createElement('a');
    a.href = posterUrl;
    a.download = `poster_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyImage = async () => {
    if (!posterUrl) return;
    try {
      const resp = await fetch(posterUrl);
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
        className="bg-surface border border-border/80 rounded-lg shadow-xl w-full max-w-sm flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-accent" />
            <h3 className="text-xs font-semibold text-foreground">分享海报生成</h3>
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

        {/* Poster Preview Container */}
        <div className="p-3 flex-1 flex flex-col items-center justify-center min-h-[360px] max-h-[60vh] overflow-y-auto bg-surface-tertiary">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-muted">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
              <span className="text-xs">海报渲染中...</span>
            </div>
          ) : posterUrl ? (
            <img
              src={posterUrl}
              alt="Generated Poster"
              className="max-h-full max-w-full object-contain rounded-md shadow-md border border-border"
            />
          ) : (
            <div className="text-xs text-muted">海报生成失败，请重试</div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 px-3 py-2.5 border-t border-border bg-surface-secondary">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleCopyImage}
            isDisabled={!posterUrl || loading}
            className="text-xs cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-success mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
            {copied ? '已复制图片' : '复制海报'}
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={handleDownload}
            isDisabled={!posterUrl || loading}
            className="text-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            下载海报图片
          </Button>
        </div>
      </div>
    </div>
  );
};
