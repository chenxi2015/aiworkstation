import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, toast } from '@heroui/react';
import {
  Download,
  Copy,
  Check,
  Camera,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { GrabbedContent } from '../../../../src/types';
import { openImageViewerInNewTab } from '../../../../src/utils/imageViewerHelper';

interface ScreenshotModalProps {
  grabbedContent: GrabbedContent;
  onClose: () => void;
}

export const ScreenshotModal: React.FC<ScreenshotModalProps> = ({
  grabbedContent,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | undefined>(grabbedContent.screenshot);
  const [isCapturing, setIsCapturing] = useState(!grabbedContent.screenshot);
  const [progress, setProgress] = useState<{ slice: number; totalSlices: number; percent: number } | null>(null);

  const title = (grabbedContent.tdk?.title || '选区截图').slice(0, 25).trim();
  const dimensions = grabbedContent.dimensions || { width: 0, height: 0 };
  const isLongImage = dimensions.height > dimensions.width * 1.2;
  const [viewMode, setViewMode] = useState<'scroll' | 'fit'>(isLongImage ? 'scroll' : 'fit');

  // Listen for real-time capture progress
  useEffect(() => {
    const listener = (msg: any) => {
      if (msg?.type === 'SCREENSHOT_PROGRESS' && msg.payload) {
        setProgress(msg.payload);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  // Trigger on-demand scrolling capture
  const handleCapture = useCallback(async () => {
    setIsCapturing(true);
    setProgress({ slice: 1, totalSlices: 1, percent: 0 });
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        toast.danger('未找到当前活动标签页', { timeout: 2500 });
        setIsCapturing(false);
        return;
      }

      const pageRect = grabbedContent.pageRect || {
        left: 0,
        top: 0,
        width: dimensions.width,
        height: dimensions.height,
      };
      const pageScroll = grabbedContent.pageScroll;

      // Pre-scroll page to target area before capture to handle user scroll drift
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'SCROLL_TO_AREA',
          payload: { pageRect, pageScroll },
        });
      } catch {
        // Non-critical: captureAndCropArea has its own pre-scroll as fallback
      }

      const response: { success: boolean; screenshot?: string; error?: string } =
        await chrome.tabs.sendMessage(tab.id, {
          type: 'CAPTURE_AREA_SCREENSHOT',
          payload: { pageRect },
        });

      if (response?.success && response.screenshot) {
        setScreenshotUrl(response.screenshot);
        grabbedContent.screenshot = response.screenshot;
        toast.success('高清截图生成完成', { timeout: 2000 });
      } else {
        toast.danger('生成截图失败', {
          description: response?.error || '网页未能成功响应截屏请求',
          timeout: 3000,
        });
      }
    } catch (err) {
      console.error('Failed to capture area screenshot on demand:', err);
      toast.danger('截屏请求失败', {
        description: String(err),
        timeout: 3000,
      });
    } finally {
      setIsCapturing(false);
    }
  }, [dimensions.height, dimensions.width, grabbedContent]);

  // If no screenshot exists on mount, auto-trigger capture on modal open
  useEffect(() => {
    if (!screenshotUrl) {
      handleCapture();
    }
  }, [screenshotUrl, handleCapture]);

  const handleDownload = () => {
    if (!screenshotUrl) return;
    try {
      const a = document.createElement('a');
      a.href = screenshotUrl;
      a.download = `screenshot_${title}_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('区域截图已下载', { timeout: 2000 });
    } catch (err) {
      console.error('Download screenshot failed:', err);
      toast.danger('下载截图失败', { timeout: 2000 });
    }
  };

  const handleCopyImage = async () => {
    if (!screenshotUrl) return;
    try {
      const resp = await fetch(screenshotUrl);
      const blob = await resp.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      setCopied(true);
      toast.success('已复制截图到剪贴板', {
        description: '可直接在聊天软件或文档中粘贴',
        timeout: 2200,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
      toast.danger('复制图片失败', {
        description: String(err),
        timeout: 3000,
      });
    }
  };

  const handleOpenInNewTab = () => {
    if (!screenshotUrl) return;
    openImageViewerInNewTab({
      url: screenshotUrl,
      title: `${title} - 区域截图`,
      dimensions,
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
                <Camera className="w-4 h-4 text-accent shrink-0" />
                <span className="truncate">选区真实截图</span>
                {isLongImage && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded bg-accent/15 text-accent text-[10px] font-medium leading-none">
                    长图
                  </span>
                )}
                <span className="text-[10px] font-normal text-muted font-mono truncate ml-0.5">
                  {dimensions.width}×{dimensions.height}
                </span>
              </Modal.Heading>

              {/* Action Toolbar */}
              <div className="flex items-center gap-1 shrink-0 mr-1">
                {screenshotUrl && isLongImage && !isCapturing && (
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === 'scroll' ? 'fit' : 'scroll')}
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium text-muted hover:text-foreground hover:bg-surface-tertiary transition-colors cursor-pointer border border-border/60 shrink-0"
                    title={viewMode === 'scroll' ? '切换为适应窗口' : '切换为原比例滚动查看'}
                  >
                    {viewMode === 'scroll' ? '适应' : '原图'}
                  </button>
                )}

                {/* Re-capture button */}
                <button
                  type="button"
                  onClick={handleCapture}
                  disabled={isCapturing}
                  className="p-1 rounded text-muted hover:text-foreground hover:bg-surface-tertiary transition-colors cursor-pointer disabled:opacity-50"
                  title="重新截取"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCapturing ? 'animate-spin text-accent' : ''}`} />
                </button>

                {screenshotUrl && !isCapturing && (
                  <button
                    type="button"
                    onClick={handleOpenInNewTab}
                    className="p-1 rounded text-muted hover:text-foreground hover:bg-surface-tertiary transition-colors cursor-pointer"
                    title="新标签页查看"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <Modal.CloseTrigger />
            </Modal.Header>

            {/* Image Preview Container */}
            <Modal.Body className="mt-4">
              <div className="flex flex-col items-center justify-start min-h-[300px] max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-default-50/40 p-3">
                {isCapturing ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-14 text-center m-auto max-w-[280px]">
                    <div className="relative">
                      <Loader2 className="w-10 h-10 animate-spin text-accent" />
                      <Camera className="w-4 h-4 text-accent absolute inset-0 m-auto" />
                    </div>
                    <div className="flex flex-col gap-1.5 w-full">
                      <span className="text-xs font-semibold text-foreground">
                        {isLongImage
                          ? progress && progress.totalSlices > 1
                            ? `正在步进截取长图 (${progress.slice}/${progress.totalSlices} 屏)`
                            : '正在步进平稳截取长图...'
                          : '正在截取选区画面...'}
                      </span>
                      <span className="text-[11px] text-muted">
                        {progress && progress.percent > 0
                          ? `已完成 ${progress.percent}% • 帧缓冲与无缝对齐`
                          : '防浮动元素消隐与像素级无缝拼接'}
                      </span>
                      {isLongImage && progress && (
                        <div className="w-full bg-default-100 h-1.5 rounded-full overflow-hidden mt-1.5 border border-border/50">
                          <div
                            className="bg-accent h-full rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${Math.max(5, progress.percent)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ) : screenshotUrl ? (
                  <div className="relative group w-full flex items-center justify-center">
                    <img
                      src={screenshotUrl}
                      alt="Selected Area Screenshot"
                      className={`${
                        viewMode === 'fit'
                          ? 'max-h-[55vh] max-w-full object-contain'
                          : 'w-full h-auto object-contain'
                      } rounded-md shadow-sm border border-border/50 transition-all`}
                    />
                    <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-xs text-white/90 text-[10px] font-mono px-2 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                      {isLongImage ? '100% 高清拼接' : '100% 原生渲染'}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted py-12 text-center m-auto">
                    <Camera className="w-8 h-8 opacity-40 text-muted" />
                    <span className="text-xs">未捕获到截图数据</span>
                    <Button size="sm" variant="secondary" onClick={handleCapture} className="text-xs mt-2">
                      点击重新截取
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
                isDisabled={!screenshotUrl || isCapturing}
                className="flex-1 min-w-0 px-2 text-xs cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 mr-1 shrink-0 text-success" /> : <Copy className="w-3.5 h-3.5 mr-1 shrink-0" />}
                <span className="truncate">{copied ? '已复制' : '复制图片'}</span>
              </Button>

              <Button
                size="sm"
                variant="primary"
                onClick={handleDownload}
                isDisabled={!screenshotUrl || isCapturing}
                className="flex-1 min-w-0 px-2 text-xs cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
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
