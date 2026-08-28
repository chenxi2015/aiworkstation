import React, { useEffect, useState } from 'react';
import { Modal, Button } from '@heroui/react';
import { Download, Copy, Check, Loader2, Sparkles } from 'lucide-react';
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
    <Modal.Root isOpen={true} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container placement="top" className="p-2.5 pt-3">
          <Modal.Dialog className="p-3.5 max-w-full w-full">
            {/* Modal Header */}
            <Modal.Header className="pr-6">
              <Modal.Heading className="flex items-center gap-1.5 text-xs font-semibold">
                <Sparkles className="w-4 h-4 text-blue-500 shrink-0" />
                <span>分享精美海报生成</span>
              </Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>

            {/* Poster Preview Area */}
            <Modal.Body className="mt-2">
              <div className="flex flex-col items-center justify-center min-h-[340px] max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-zinc-900/10 dark:bg-black/30 p-2">
                {loading ? (
                  <div className="flex flex-col items-center gap-2 text-muted py-12">
                    <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
                    <span className="text-xs font-medium text-zinc-500">正在生成高清分享海报...</span>
                  </div>
                ) : posterUrl ? (
                  <img
                    src={posterUrl}
                    alt="Generated Poster"
                    className="max-h-full max-w-full object-contain rounded-md shadow-md border border-border/60 transition-all hover:scale-[1.01]"
                  />
                ) : (
                  <div className="text-xs text-muted">海报生成失败，请重试</div>
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
