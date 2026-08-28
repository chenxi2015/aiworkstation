import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, toast } from '@heroui/react';
import { Download, Copy, Check, Loader2, Sparkles, RefreshCw, ExternalLink } from 'lucide-react';
import { generatePosterDataUrl, type PosterOptions } from '../../../../src/utils/posterGenerator';
import { openImageViewerInNewTab } from '../../../../src/utils/imageViewerHelper';

interface PosterModalProps {
  options: PosterOptions;
  cachedUrl?: string | null;
  onGenerated?: (url: string) => void;
  onClose: () => void;
}

export const PosterModal: React.FC<PosterModalProps> = ({
  options,
  cachedUrl,
  onGenerated,
  onClose,
}) => {
  const [posterUrl, setPosterUrl] = useState<string | null>(cachedUrl || null);
  const [loading, setLoading] = useState<boolean>(!cachedUrl);
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback((isManual = false) => {
    setLoading(true);
    generatePosterDataUrl(options)
      .then((url) => {
        setPosterUrl(url);
        setLoading(false);
        onGenerated?.(url);
        if (isManual) {
          toast.success('已重新生成分享海报', { timeout: 2000 });
        }
      })
      .catch((err) => {
        console.error('Failed to generate poster:', err);
        setLoading(false);
        toast.danger('生成海报失败，请重试', { timeout: 2500 });
      });
  }, [options, onGenerated]);

  useEffect(() => {
    if (!posterUrl) {
      handleGenerate();
    }
  }, [posterUrl, handleGenerate]);

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
      toast.success('已复制海报到剪贴板', { timeout: 2000 });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
      toast.danger('复制海报失败', { timeout: 2500 });
    }
  };

  const handleOpenInNewTab = () => {
    if (!posterUrl) return;
    openImageViewerInNewTab({
      url: posterUrl,
      title: `${options.title || '精美海报'} - 分享海报`,
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
                <Sparkles className="w-4 h-4 text-accent shrink-0" />
                <span className="truncate">分享精美海报生成</span>
              </Modal.Heading>

              {/* Action Toolbar */}
              <div className="flex items-center gap-1 shrink-0 mr-1">
                {/* Re-generate button */}
                <button
                  type="button"
                  onClick={() => handleGenerate(true)}
                  disabled={loading}
                  className="p-1 rounded text-muted hover:text-foreground hover:bg-surface-tertiary transition-colors cursor-pointer disabled:opacity-50"
                  title="重新生成海报"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-accent' : ''}`} />
                </button>

                {/* Open in preview viewer */}
                {posterUrl && !loading && (
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

            {/* Poster Preview Area */}
            <Modal.Body className="mt-4">
              <div className="flex flex-col items-center justify-center min-h-[320px] max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-default-50/40 p-3">
                {loading ? (
                  <div className="flex flex-col items-center gap-2 text-muted py-12">
                    <Loader2 className="w-7 h-7 animate-spin text-accent" />
                    <span className="text-xs font-medium text-muted">正在生成高清分享海报...</span>
                  </div>
                ) : posterUrl ? (
                  <img
                    src={posterUrl}
                    alt="Generated Poster"
                    className="max-h-full max-w-full object-contain rounded-md shadow-sm border border-border/50 transition-all hover:scale-[1.01]"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted py-12 text-center m-auto">
                    <span className="text-xs text-muted">海报生成失败，请重试</span>
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
                isDisabled={!posterUrl || loading}
                className="flex-1 min-w-0 px-2 text-xs cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 mr-1 shrink-0 text-success" /> : <Copy className="w-3.5 h-3.5 mr-1 shrink-0" />}
                <span className="truncate">{copied ? '已复制' : '复制海报'}</span>
              </Button>

              <Button
                size="sm"
                variant="primary"
                onClick={handleDownload}
                isDisabled={!posterUrl || loading}
                className="flex-1 min-w-0 px-2 text-xs cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                <Download className="w-3.5 h-3.5 mr-1 shrink-0" />
                <span className="truncate">下载海报 PNG</span>
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
};
