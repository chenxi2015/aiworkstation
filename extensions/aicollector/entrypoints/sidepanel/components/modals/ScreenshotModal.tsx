import React, { useState, useEffect, useCallback } from 'react';
import { Button, toast } from '@heroui/react';
import {
  X,
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

  const title = (grabbedContent.tdk?.title || '选区截图').slice(0, 25).trim();
  const dimensions = grabbedContent.dimensions || { width: 0, height: 0 };
  const isLongImage = dimensions.height > dimensions.width * 1.2;
  const [viewMode, setViewMode] = useState<'scroll' | 'fit'>(isLongImage ? 'scroll' : 'fit');

  // Trigger on-demand scrolling capture
  const handleCapture = useCallback(async () => {
    setIsCapturing(true);
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
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border/80 rounded-xl shadow-2xl w-full max-w-[520px] flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border bg-surface-secondary/50">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-semibold text-foreground">选区真实截图</h3>
                {isLongImage && (
                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium">
                    长图拼接
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted flex items-center gap-1.5 font-mono">
                <span>
                  {dimensions.width} × {dimensions.height} px
                </span>
                <span>•</span>
                <span>{grabbedContent.tag || '选区'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {screenshotUrl && isLongImage && !isCapturing && (
              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'scroll' ? 'fit' : 'scroll')}
                className="px-2 py-1 rounded text-[11px] font-medium text-muted hover:text-foreground hover:bg-surface-tertiary transition-colors cursor-pointer border border-border/60"
                title={viewMode === 'scroll' ? '切换为适应窗口' : '切换为原比例滚动查看'}
              >
                {viewMode === 'scroll' ? '适应窗口' : '原比例浏览'}
              </button>
            )}

            {/* Re-capture button */}
            <button
              type="button"
              onClick={handleCapture}
              disabled={isCapturing}
              className="p-1.5 rounded text-muted hover:text-foreground hover:bg-surface-tertiary transition-colors cursor-pointer disabled:opacity-50"
              title="重新截取长图"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCapturing ? 'animate-spin text-emerald-500' : ''}`} />
            </button>

            {screenshotUrl && !isCapturing && (
              <button
                type="button"
                onClick={handleOpenInNewTab}
                className="p-1.5 rounded text-muted hover:text-foreground hover:bg-surface-tertiary transition-colors cursor-pointer"
                title="新标签页全屏查看与编辑原图"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded text-muted hover:text-foreground hover:bg-surface-tertiary transition-colors cursor-pointer"
              title="关闭 (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image Preview Container */}
        <div className="p-3.5 flex-1 flex flex-col items-center justify-start min-h-[320px] max-h-[66vh] overflow-y-auto bg-zinc-950/20 dark:bg-black/40">
          {isCapturing ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center m-auto">
              <div className="relative">
                <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
                <Camera className="w-4 h-4 text-emerald-400 absolute inset-0 m-auto" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-foreground">
                  {isLongImage ? '正在自动步进滚动截取长图...' : '正在截取选区画面...'}
                </span>
                <span className="text-[11px] text-muted">正在进行防浮动元素消隐与无缝像素拼接</span>
              </div>
            </div>
          ) : screenshotUrl ? (
            <div className="relative group w-full flex items-center justify-center">
              <img
                src={screenshotUrl}
                alt="Selected Area Screenshot"
                className={`${
                  viewMode === 'fit'
                    ? 'max-h-[58vh] max-w-full object-contain'
                    : 'w-full h-auto object-contain'
                } rounded-lg shadow-xl border border-border/60 transition-all`}
              />
              <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-xs text-white/90 text-[10px] font-mono px-2 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                {isLongImage ? '100% 滚动高清拼接' : '100% 原生渲染'}
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

        {/* Modal Footer */}
        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-t border-border bg-surface-secondary">
          <span className="text-[11px] text-muted truncate max-w-[160px]">
            {title}
          </span>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleCopyImage}
              isDisabled={!screenshotUrl || isCapturing}
              className="text-xs cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-success mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
              {copied ? '已复制' : '复制图片'}
            </Button>

            <Button
              size="sm"
              variant="primary"
              onClick={handleDownload}
              isDisabled={!screenshotUrl || isCapturing}
              className="text-xs cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              下载 PNG
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
