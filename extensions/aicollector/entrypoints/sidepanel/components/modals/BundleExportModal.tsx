import React, { useState } from 'react';
import { Modal, Button, toast } from '@heroui/react';
import {
  Archive,
  FileCode,
  Image as ImageIcon,
  Video as VideoIcon,
  Camera,
  Download,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import type { GrabbedContent, GrabbedVideo } from '../../../../src/types';
import { htmlToMarkdown } from '../../../../src/utils/markdownConverter';
import { cleanDocumentTitle } from '../../../../src/utils/exporters/exportUtils';
import { exportBundleZip } from '../../../../src/utils/exporters/zipExporter';
import { downloadVideo } from '../../../../src/utils/imageDownloader';

interface BundleExportModalProps {
  grabbedContent: GrabbedContent;
  onClose: () => void;
}

export const BundleExportModal: React.FC<BundleExportModalProps> = ({
  grabbedContent,
  onClose,
}) => {
  const rawImages = grabbedContent.images || [];
  const rawVideos = grabbedContent.videos || [];
  const rawScreenshot = grabbedContent.screenshot;

  const [includeMarkdown, setIncludeMarkdown] = useState(true);
  const [includeImages, setIncludeImages] = useState(rawImages.length > 0);
  const [includeVideos, setIncludeVideos] = useState(false); // Default false because videos are large
  const [includeScreenshot, setIncludeScreenshot] = useState(Boolean(rawScreenshot));

  const [isBundling, setIsBundling] = useState(false);
  const [bundlePercent, setBundlePercent] = useState(0);
  const [bundleMessage, setBundleMessage] = useState('');
  const [downloadingSingleVideo, setDownloadingSingleVideo] = useState<string | null>(null);

  const title = cleanDocumentTitle(grabbedContent.tdk.title || '选区内容');

  const selectedCount =
    (includeMarkdown ? 1 : 0) +
    (includeImages ? rawImages.length : 0) +
    (includeVideos ? rawVideos.length : 0) +
    (includeScreenshot && rawScreenshot ? 1 : 0);

  const handleStartBundle = async () => {
    if (isBundling || selectedCount === 0) return;
    try {
      setIsBundling(true);
      setBundlePercent(0);
      setBundleMessage('正在准备打包...');

      const md = htmlToMarkdown(grabbedContent.selectedHtml, grabbedContent.url);
      const zipName = `${title.slice(0, 30).trim() || 'bundle'}_${Date.now()}.zip`;

      await exportBundleZip({
        markdownContent: md,
        images: rawImages,
        videos: rawVideos,
        screenshot: rawScreenshot,
        pageUrl: grabbedContent.url,
        zipFilename: zipName,
        includeMarkdown,
        includeImages,
        includeVideos,
        includeScreenshot,
        onProgress: (progress) => {
          setBundlePercent(progress.percent);
          if (progress.message) {
            setBundleMessage(progress.message);
          }
        },
      });

      toast.success('打包下载完成', {
        description: zipName,
        timeout: 2500,
      });
      onClose();
    } catch (err) {
      console.error('Failed to bundle ZIP:', err);
      toast.danger('打包下载失败', {
        description: String(err),
        timeout: 3000,
      });
    } finally {
      setIsBundling(false);
      setBundlePercent(0);
      setBundleMessage('');
    }
  };

  const handleDownloadSingleVideoDirectly = async (video: GrabbedVideo, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!video.src || downloadingSingleVideo) return;
    try {
      setDownloadingSingleVideo(video.src);
      const customFilename = `${title.slice(0, 25).trim() || 'video'}_${index + 1}.mp4`;
      await downloadVideo(video.src, grabbedContent.url, customFilename);
      toast.success(`视频 ${index + 1} 已开始下载`, { timeout: 2000 });
    } catch (err) {
      console.error('Failed to download single video:', err);
      toast.danger('视频下载失败', { description: String(err) });
    } finally {
      setDownloadingSingleVideo(null);
    }
  };

  return (
    <Modal.Root isOpen={true} onOpenChange={(isOpen) => { if (!isOpen && !isBundling) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container placement="top" className="p-2.5 pt-3">
          <Modal.Dialog className="p-3.5 max-w-full w-full">
            {/* Header */}
            <Modal.Header>
              <Modal.Heading className="flex items-center gap-1.5 font-semibold text-sm">
                <Archive className="w-4 h-4 text-accent shrink-0" />
                <span>打包下载选区资源</span>
              </Modal.Heading>
              {!isBundling && <Modal.CloseTrigger />}
            </Modal.Header>

            {/* Body */}
            <Modal.Body className="mt-3 flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-0.5">
              {/* Document Overview */}
              <div className="p-2.5 rounded-lg bg-surface-secondary/70 border border-border flex flex-col gap-1.5 text-xs">
                <div className="font-medium text-foreground truncate" title={title}>
                  📄 {title}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span className="bg-default-100 px-1.5 py-0.5 rounded">Markdown 正文</span>
                  <span className="bg-default-100 px-1.5 py-0.5 rounded">{rawImages.length} 张图片</span>
                  {rawVideos.length > 0 && (
                    <span className="bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded font-medium">
                      {rawVideos.length} 个视频
                    </span>
                  )}
                  {rawScreenshot && (
                    <span className="bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded">选区截图</span>
                  )}
                </div>
              </div>

              {/* Package Options */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold text-muted">选择打包内容:</span>

                {/* 1. Markdown Checkbox Card */}
                <label className="flex items-center justify-between p-2.5 rounded-lg border border-border hover:border-accent/40 bg-surface-secondary/30 transition-all cursor-pointer select-none">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeMarkdown}
                      disabled={isBundling}
                      onChange={(e) => setIncludeMarkdown(e.target.checked)}
                      className="rounded text-accent focus:ring-accent w-3.5 h-3.5 cursor-pointer"
                    />
                    <div className="flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                      <span className="text-xs font-medium text-foreground">Markdown 文档 (index.md)</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted font-mono">1 篇</span>
                </label>

                {/* 2. Images Checkbox Card */}
                {rawImages.length > 0 && (
                  <label className="flex items-center justify-between p-2.5 rounded-lg border border-border hover:border-accent/40 bg-surface-secondary/30 transition-all cursor-pointer select-none">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={includeImages}
                        disabled={isBundling}
                        onChange={(e) => setIncludeImages(e.target.checked)}
                        className="rounded text-accent focus:ring-accent w-3.5 h-3.5 cursor-pointer"
                      />
                      <div className="flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="text-xs font-medium text-foreground">包含图片资源 (images/)</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted font-mono">{rawImages.length} 张</span>
                  </label>
                )}

                {/* 3. Videos Checkbox Card & Individual list */}
                {rawVideos.length > 0 && (
                  <div className="flex flex-col rounded-lg border border-border bg-surface-secondary/30 overflow-hidden">
                    <label className="flex items-center justify-between p-2.5 hover:border-accent/40 transition-all cursor-pointer select-none">
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={includeVideos}
                          disabled={isBundling}
                          onChange={(e) => setIncludeVideos(e.target.checked)}
                          className="rounded text-accent focus:ring-accent w-3.5 h-3.5 cursor-pointer shrink-0"
                        />
                        <div className="flex items-center gap-1.5 min-w-0">
                          <VideoIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span className="text-xs font-medium text-foreground truncate">
                            打包视频文件 (videos/)
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1 py-0.5 rounded font-mono">
                          体积较大
                        </span>
                        <span className="text-[10px] text-muted font-mono">{rawVideos.length} 个</span>
                      </div>
                    </label>

                    {/* Notice & Individual Video Download helper */}
                    <div className="px-2.5 pb-2.5 pt-0.5 flex flex-col gap-1.5 border-t border-border/40">
                      <div className="flex items-start gap-1 text-[10px] text-muted">
                        <AlertCircle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                        <span>视频体积较大，打包下载耗时可能较长；亦可在下方单独直接下载单个视频。</span>
                      </div>

                      {/* Video items mini list */}
                      <div className="flex flex-col gap-1 mt-1 max-h-32 overflow-y-auto">
                        {rawVideos.map((v, i) => (
                          <div
                            key={`video-${i}-${v.src}`}
                            className="flex items-center justify-between gap-2 p-1.5 rounded bg-surface-tertiary/60 border border-border/40 text-[11px]"
                          >
                            <span className="truncate flex-1 text-foreground/80 font-mono" title={v.title || v.src}>
                              🎬 视频 {i + 1} {v.title ? `(${v.title})` : ''}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => handleDownloadSingleVideoDirectly(v, i, e)}
                                disabled={downloadingSingleVideo === v.src || isBundling}
                                className="inline-flex items-center gap-0.5 text-[10px] text-accent hover:underline cursor-pointer disabled:opacity-50"
                                title="直接下载此视频"
                              >
                                {downloadingSingleVideo === v.src ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Download className="w-3 h-3" />
                                )}
                                <span>下载</span>
                              </button>
                              <a
                                href={v.src}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted hover:text-accent p-0.5"
                                title="新标签页打开视频"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Screenshot Checkbox Card */}
                {rawScreenshot && (
                  <label className="flex items-center justify-between p-2.5 rounded-lg border border-border hover:border-accent/40 bg-surface-secondary/30 transition-all cursor-pointer select-none">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={includeScreenshot}
                        disabled={isBundling}
                        onChange={(e) => setIncludeScreenshot(e.target.checked)}
                        className="rounded text-accent focus:ring-accent w-3.5 h-3.5 cursor-pointer"
                      />
                      <div className="flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="text-xs font-medium text-foreground">包含选区截图 (screenshot.png)</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted font-mono">1 张</span>
                  </label>
                )}
              </div>

              {/* Progress & Status Indicator */}
              {isBundling && (
                <div className="p-3 rounded-lg bg-accent/10 border border-accent/20 flex flex-col gap-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-medium text-accent">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {bundleMessage || '打包处理中...'}
                    </span>
                    <span className="font-mono">{bundlePercent}%</span>
                  </div>
                  <div className="w-full bg-surface-tertiary h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-accent h-full transition-all duration-200 ease-out rounded-full"
                      style={{ width: `${bundlePercent}%` }}
                    />
                  </div>
                </div>
              )}
            </Modal.Body>

            {/* Footer */}
            <Modal.Footer className="flex items-center justify-between w-full mt-3 pt-2 border-t border-border">
              <span className="text-[11px] text-muted">
                已选中 {selectedCount} 项资源
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={isBundling}
                  onClick={onClose}
                  className="px-3 text-xs cursor-pointer"
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  isDisabled={isBundling || selectedCount === 0}
                  onClick={handleStartBundle}
                  className="px-4 text-xs font-medium cursor-pointer"
                >
                  {isBundling ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      <span>{bundlePercent}% 打包中</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 mr-1" />
                      <span>下载 ZIP 归档</span>
                    </>
                  )}
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
};
