import React, { useState } from 'react';
import { Card, Chip, Separator, Button, toast } from '@heroui/react';
import {
  Layers,
  Send,
  Image as ImageIcon,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  Download,
  Loader2,
  Check,
  Play,
  Video as VideoIcon,
  Copy,
  Camera,
} from 'lucide-react';
import type { GrabbedContent, GrabbedVideo } from '../../../../src/types';
import type { CollectPayload } from '../../../../src/services/workbench';
import { SafeImage } from '../common/SafeImage';
import { CopyButton } from '../common/CopyButton';
import { downloadImage, downloadVideo } from '../../../../src/utils/imageDownloader';
import { GrabActionToolbar } from '../actions/GrabActionToolbar';
import { openImageViewerInNewTab } from '../../../../src/utils/imageViewerHelper';
import { BundleExportModal } from '../modals/BundleExportModal';

interface GrabbedContentCardProps {
  grabbedContent: GrabbedContent;
  onPush: (payload: CollectPayload) => void;
}

type MediaItem =
  | { type: 'screenshot'; src: string; key: string }
  | { type: 'video'; src: string; poster?: string; title?: string; key: string }
  | { type: 'image'; src: string; key: string };

/**
 * Screenshot thumbnail item
 */
const ScreenshotThumbnail: React.FC<{
  src: string;
  onClick: () => void;
}> = ({ src, onClick }) => {
  return (
    <div
      className="group relative aspect-square rounded-md overflow-hidden border border-emerald-500/60 bg-surface-tertiary cursor-pointer hover:border-emerald-500 hover:shadow-md transition-all ring-1 ring-emerald-500/20"
      onClick={onClick}
      title="选区真实截图 (点击查看原图)"
    >
      <img
        src={src}
        alt="area-screenshot"
        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
        loading="lazy"
      />
      {/* Top badge */}
      <div className="absolute top-0.5 left-0.5 px-1 py-0.2 rounded bg-emerald-600/90 text-[8px] font-medium text-white pointer-events-none flex items-center gap-0.5 shadow-xs">
        <Camera className="w-2.5 h-2.5" />
        <span>截图</span>
      </div>

      {/* Hover preview icon overlay */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white pointer-events-none">
        <Eye className="w-3.5 h-3.5" />
      </div>
    </div>
  );
};

/**
 * Image thumbnail item with auto-healing safe image and preview trigger
 */
const ImageThumbnail: React.FC<{
  src: string;
  pageUrl?: string;
  index: number;
  onClick: () => void;
}> = ({ src, pageUrl, index, onClick }) => {
  return (
    <div
      className="group relative aspect-square rounded-md overflow-hidden border border-border/80 bg-surface-tertiary cursor-pointer hover:border-accent/80 hover:shadow-sm transition-all"
      onClick={onClick}
      title={`图片 #${index + 1} (点击预览)`}
    >
      <SafeImage
        src={src}
        pageUrl={pageUrl}
        alt={`img-${index}`}
        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
        loading="lazy"
      />

      {/* Hover preview icon overlay */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white pointer-events-none">
        <Eye className="w-3.5 h-3.5" />
      </div>

      {/* Index badge */}
      <div className="absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded bg-black/60 text-[9px] font-mono text-white/90 pointer-events-none">
        {index + 1}
      </div>
    </div>
  );
};

/**
 * Video thumbnail item with poster, play badge, and preview trigger
 */
const VideoThumbnail: React.FC<{
  video: GrabbedVideo;
  pageUrl?: string;
  index: number;
  onClick: () => void;
}> = ({ video, pageUrl, index, onClick }) => {
  return (
    <div
      className="group relative aspect-square rounded-md overflow-hidden border border-border/80 bg-zinc-900 cursor-pointer hover:border-accent/80 hover:shadow-md transition-all flex items-center justify-center"
      onClick={onClick}
      title={`视频 #${index + 1} (点击播放预览)`}
    >
      {video.poster ? (
        <SafeImage
          src={video.poster}
          pageUrl={pageUrl}
          alt={`video-poster-${index}`}
          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105 opacity-85 group-hover:opacity-95"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950 text-zinc-400">
          <VideoIcon className="w-6 h-6 opacity-60 group-hover:scale-110 transition-transform" />
        </div>
      )}

      {/* Centered Play Button Overlay */}
      <div className="absolute inset-0 bg-black/35 group-hover:bg-black/20 transition-all flex items-center justify-center">
        <div className="w-7 h-7 rounded-full bg-accent/90 group-hover:bg-accent text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
        </div>
      </div>

      {/* Video tag badge on top left */}
      <div className="absolute top-0.5 left-0.5 px-1 py-0.2 rounded bg-accent/80 text-[8px] font-medium text-white pointer-events-none flex items-center gap-0.5 shadow-xs">
        <VideoIcon className="w-2.5 h-2.5" />
        <span>视频</span>
      </div>

      {/* Index badge on bottom right */}
      <div className="absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded bg-black/70 text-[9px] font-mono text-white/90 pointer-events-none">
        {index + 1}
      </div>
    </div>
  );
};

/**
 * Card displaying captured DOM element data, media (images/videos) previews, and quick push action
 */
export const GrabbedContentCard: React.FC<GrabbedContentCardProps> = ({
  grabbedContent,
  onPush,
}) => {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHtmlExpanded, setIsHtmlExpanded] = useState(false);
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const [showBundleModal, setShowBundleModal] = useState(false);
  const [singleDownloading, setSingleDownloading] = useState(false);
  const [singleDownloadSuccess, setSingleDownloadSuccess] = useState(false);
  const [copiedMediaUrl, setCopiedMediaUrl] = useState(false);

  const rawImages = grabbedContent.images || [];
  const rawVideos = grabbedContent.videos || [];
  const rawScreenshot = grabbedContent.screenshot;

  // Build unified media items list: screenshot first, then videos, then images
  const mediaItems: MediaItem[] = [
    ...(rawScreenshot ? [{ type: 'screenshot' as const, src: rawScreenshot, key: 'screenshot-primary' }] : []),
    ...rawVideos.map((v, i) => ({
      type: 'video' as const,
      src: v.src,
      poster: v.poster,
      title: v.title,
      key: `video-${i}-${v.src}`,
    })),
    ...rawImages.map((src, i) => ({
      type: 'image' as const,
      src,
      key: `image-${i}-${src}`,
    })),
  ];

  const maxInitialVisible = 4;
  const displayedMedia = isExpanded ? mediaItems : mediaItems.slice(0, maxInitialVisible);

  // Keyboard navigation support for media preview lightbox
  React.useEffect(() => {
    if (previewIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewIndex(null);
      } else if (e.key === 'ArrowLeft' && mediaItems.length > 1) {
        setPreviewIndex((prev) => (prev !== null ? (prev - 1 + mediaItems.length) % mediaItems.length : null));
      } else if (e.key === 'ArrowRight' && mediaItems.length > 1) {
        setPreviewIndex((prev) => (prev !== null ? (prev + 1) % mediaItems.length : null));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewIndex, mediaItems.length]);

  const hasText = Boolean(grabbedContent.selectedText && grabbedContent.selectedText.trim());
  const hasHtml = Boolean(grabbedContent.selectedHtml && grabbedContent.selectedHtml.trim());

  const handlePush = () => {
    let fallbackContent = '';
    if (rawVideos.length > 0 && rawImages.length > 0) {
      fallbackContent = `[包含 ${rawVideos.length} 个视频，${rawImages.length} 张图片]`;
    } else if (rawVideos.length > 0) {
      fallbackContent = `[包含 ${rawVideos.length} 个视频]`;
    } else if (rawImages.length > 0) {
      fallbackContent = `[包含 ${rawImages.length} 张图片]`;
    }

    onPush({
      title: grabbedContent.tdk.title || '选区内容',
      url: grabbedContent.url,
      content: hasText ? grabbedContent.selectedText : fallbackContent,
      meta: {
        tdk: grabbedContent.tdk,
        selector: grabbedContent.selector,
        html: grabbedContent.selectedHtml,
        images: grabbedContent.images,
        videos: grabbedContent.videos,
        screenshot: grabbedContent.screenshot,
      },
    });
  };

  const handleDownloadCurrentMedia = async (media: MediaItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!media.src || singleDownloading) return;
    try {
      setSingleDownloading(true);
      if (media.type === 'video') {
        const docTitle = (grabbedContent.tdk.title || 'video').slice(0, 25).trim();
        await downloadVideo(media.src, grabbedContent.url, `${docTitle}_${Date.now()}.mp4`);
        setSingleDownloadSuccess(true);
        toast.success('已触发视频下载', { timeout: 2000 });
        setTimeout(() => setSingleDownloadSuccess(false), 2000);
      } else if (media.type === 'screenshot') {
        const a = document.createElement('a');
        a.href = media.src;
        const docTitle = (grabbedContent.tdk.title || 'screenshot').slice(0, 25).trim();
        a.download = `screenshot_${docTitle}_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setSingleDownloadSuccess(true);
        toast.success('区域截图已下载', { timeout: 2000 });
        setTimeout(() => setSingleDownloadSuccess(false), 2000);
      } else {
        await downloadImage(media.src, grabbedContent.url);
        setSingleDownloadSuccess(true);
        toast.success('图片已开始下载', { timeout: 2000 });
        setTimeout(() => setSingleDownloadSuccess(false), 2000);
      }
    } catch (err) {
      console.error('Failed to download media item:', err);
      toast.danger('下载失败', {
        description: String(err),
        timeout: 3000,
      });
    } finally {
      setSingleDownloading(false);
    }
  };

  const handleCopyCurrentMediaUrl = (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedMediaUrl(true);
    toast.success('已复制媒体直链', { timeout: 1800 });
    setTimeout(() => setCopiedMediaUrl(false), 2000);
  };

  const handlePrevPreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewIndex !== null) {
      setPreviewIndex((previewIndex - 1 + mediaItems.length) % mediaItems.length);
    }
  };

  const handleNextPreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewIndex !== null) {
      setPreviewIndex((previewIndex + 1) % mediaItems.length);
    }
  };

  const currentPreviewMedia = previewIndex !== null ? mediaItems[previewIndex] : null;

  return (
    <>
      <Card>
        <Card.Header className="flex flex-row items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent shrink-0" />
            <Card.Title className="text-xs font-semibold leading-none">已捕获区域</Card.Title>
          </div>
          <Chip size="sm" variant="soft" color="accent" className="shrink-0 font-mono">
            {grabbedContent.tag} ({grabbedContent.dimensions.width}×{grabbedContent.dimensions.height})
          </Chip>
        </Card.Header>
        <Separator />
        <Card.Content className="py-2.5 flex flex-col gap-2.5">
          {/* Selector */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted">CSS 选择器:</span>
              <CopyButton text={grabbedContent.selector} title="复制选择器" />
            </div>
            <div className="text-[11px] font-mono text-accent mt-0.5 break-all">
              {grabbedContent.selector}
            </div>
          </div>

          {/* HTML Content (Full content rendered without substring truncation) */}
          {hasHtml && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted">HTML 内容:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsHtmlExpanded(!isHtmlExpanded)}
                    className="text-[11px] text-accent hover:underline font-medium cursor-pointer"
                  >
                    {isHtmlExpanded ? '收起' : '展开查看'}
                  </button>
                  <CopyButton
                    text={grabbedContent.selectedHtml}
                    htmlContent={grabbedContent.selectedHtml}
                    title="复制完整 HTML 内容"
                  />
                </div>
              </div>
              <div
                className={`bg-surface-tertiary p-2 rounded-md font-mono text-[11px] text-foreground ${
                  isHtmlExpanded ? 'max-h-72 overflow-y-auto' : 'max-h-24 overflow-hidden'
                } mt-0.5 whitespace-pre-wrap break-all leading-relaxed transition-all select-text`}
              >
                {grabbedContent.selectedHtml}
              </div>
            </div>
          )}

          {/* Text Content (Full content rendered without substring truncation) */}
          {hasText ? (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted">提取正文:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsTextExpanded(!isTextExpanded)}
                    className="text-[11px] text-accent hover:underline font-medium cursor-pointer"
                  >
                    {isTextExpanded ? '收起' : '展开查看'}
                  </button>
                  <CopyButton text={grabbedContent.selectedText} title="复制提取正文" />
                </div>
              </div>
              <div
                className={`bg-surface-tertiary p-2 rounded-md font-mono text-[11px] text-foreground ${
                  isTextExpanded ? 'max-h-72 overflow-y-auto' : 'max-h-24 overflow-hidden'
                } mt-0.5 whitespace-pre-wrap leading-relaxed transition-all select-text`}
              >
                {grabbedContent.selectedText}
              </div>
            </div>
          ) : mediaItems.length === 0 ? (
            <div>
              <span className="text-[11px] font-semibold text-muted">提取正文:</span>
              <div className="bg-surface-tertiary p-2 rounded-md font-mono text-[11px] text-muted/60 mt-0.5 italic">
                （无可见文本内容）
              </div>
            </div>
          ) : null}

          {/* Media (Images & Videos) Section */}
          {mediaItems.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-[11px] font-semibold text-muted flex items-center gap-1 truncate">
                    {rawVideos.length > 0 ? (
                      <VideoIcon className="w-3.5 h-3.5 text-accent shrink-0" />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5 text-accent shrink-0" />
                    )}
                    <span>
                      {rawVideos.length > 0 && rawImages.length > 0
                        ? `媒体资源 (${rawImages.length} 图 · ${rawVideos.length} 视):`
                        : rawVideos.length > 0
                          ? `包含视频 (${rawVideos.length}):`
                          : `包含图片 (${rawImages.length}):`}
                    </span>
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowBundleModal(true)}
                    title="打包下载选区媒体资源 (ZIP)"
                    className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>下载 ZIP</span>
                  </button>

                  {mediaItems.length > maxInitialVisible && (
                    <button
                      type="button"
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="text-[11px] text-accent hover:underline font-medium cursor-pointer"
                    >
                      {isExpanded ? '收起' : '展开全部'}
                    </button>
                  )}
                </div>
              </div>

              {/* Grid of media thumbnails */}
              <div
                className={`grid ${
                  mediaItems.length === 1 ? 'grid-cols-2 max-w-[200px]' : 'grid-cols-4'
                } gap-2 transition-all ${
                  isExpanded ? 'max-h-48 overflow-y-auto pr-0.5' : ''
                }`}
              >
                {displayedMedia.map((item, i) =>
                  item.type === 'screenshot' ? (
                    <ScreenshotThumbnail
                      key={item.key}
                      src={item.src}
                      onClick={() => setPreviewIndex(i)}
                    />
                  ) : item.type === 'video' ? (
                    <VideoThumbnail
                      key={item.key}
                      video={{ src: item.src, poster: item.poster, title: item.title }}
                      pageUrl={grabbedContent.url}
                      index={i}
                      onClick={() => setPreviewIndex(i)}
                    />
                  ) : (
                    <ImageThumbnail
                      key={item.key}
                      src={item.src}
                      pageUrl={grabbedContent.url}
                      index={i}
                      onClick={() => setPreviewIndex(i)}
                    />
                  ),
                )}
              </div>
            </div>
          )}

            {/* Modular 12-Action Toolbox */}
          <GrabActionToolbar grabbedContent={grabbedContent} />


          {/* Push to workbench button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-1 font-medium cursor-pointer"
            onClick={handlePush}
          >
            <Send className="w-3.5 h-3.5 mr-1" />
            归集此区域到工作台
          </Button>

        </Card.Content>
      </Card>

      {/* Media Preview Lightbox Modal */}
      {previewIndex !== null && currentPreviewMedia && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-4 animate-in fade-in duration-150 select-none"
          onClick={() => setPreviewIndex(null)}
        >
          {/* Header controls */}
          <div
            className="absolute top-3 left-3 right-3 flex items-center justify-between text-white text-xs z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-black/60 px-2.5 py-1 rounded-full text-[11px] font-medium backdrop-blur-xs border border-white/10 flex items-center gap-1.5">
              <span>
                {previewIndex + 1} / {mediaItems.length}
              </span>
              <span className="text-white/40">|</span>
              <span className="text-accent text-[10px]">
                {currentPreviewMedia.type === 'screenshot'
                  ? '选区截图'
                  : currentPreviewMedia.type === 'video'
                    ? '视频预览'
                    : '图片预览'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-all cursor-pointer border border-white/10"
                onClick={(e) => handleCopyCurrentMediaUrl(currentPreviewMedia.src, e)}
                title="复制媒体直链"
              >
                {copiedMediaUrl ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-all cursor-pointer border border-white/10"
                onClick={(e) => handleDownloadCurrentMedia(currentPreviewMedia, e)}
                disabled={singleDownloading}
                title={currentPreviewMedia.type === 'video' ? '下载此视频' : '下载此原图'}
              >
                {singleDownloading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-accent" />
                ) : singleDownloadSuccess ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </button>
              {currentPreviewMedia.type === 'video' ? (
                <a
                  href={currentPreviewMedia.src}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-all cursor-pointer border border-white/10"
                  title="在浏览器新标签页打开视频"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    openImageViewerInNewTab({
                      url: currentPreviewMedia.src,
                      title: grabbedContent.tdk.title,
                      dimensions: grabbedContent.dimensions,
                      tag: grabbedContent.tag,
                    })
                  }
                  className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-all cursor-pointer border border-white/10"
                  title="在新标签页全屏查看与编辑原图"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-all cursor-pointer border border-white/10"
                onClick={() => setPreviewIndex(null)}
                title="关闭 (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Main Media Preview Container */}
          <div
            className="relative max-w-full max-h-[75vh] flex items-center justify-center px-8"
            onClick={(e) => e.stopPropagation()}
          >
            {currentPreviewMedia.type === 'video' ? (
              <video
                key={currentPreviewMedia.src}
                src={currentPreviewMedia.src}
                poster={currentPreviewMedia.poster}
                controls
                autoPlay
                playsInline
                className="max-w-full max-h-[72vh] rounded-md shadow-2xl border border-white/15 bg-black object-contain pointer-events-auto"
              />
            ) : (
              <SafeImage
                key={currentPreviewMedia.src}
                src={currentPreviewMedia.src}
                pageUrl={grabbedContent.url}
                alt={`preview-${previewIndex}`}
                className="max-w-full max-h-[72vh] object-contain rounded shadow-2xl border border-white/10 pointer-events-auto"
              />
            )}
          </div>

          {/* Prev / Next controls fixed strictly to the left & right viewport sides */}
          {mediaItems.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrevPreview}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/65 hover:bg-black/90 text-white/90 hover:text-white backdrop-blur-xs border border-white/15 shadow-xl transition-all cursor-pointer hover:scale-105 active:scale-95"
                title="上一个 (←)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleNextPreview}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/65 hover:bg-black/90 text-white/90 hover:text-white backdrop-blur-xs border border-white/15 shadow-xl transition-all cursor-pointer hover:scale-105 active:scale-95"
                title="下一个 (→)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Footer URL hint */}
          <div
            className="mt-3 text-[11px] text-white/70 max-w-xs truncate text-center font-mono px-2 py-0.5 rounded bg-black/40 border border-white/5 cursor-pointer hover:text-white transition-colors"
            onClick={(e) => handleCopyCurrentMediaUrl(currentPreviewMedia.src, e)}
            title={`点击复制: ${currentPreviewMedia.src}`}
          >
            {currentPreviewMedia.src}
          </div>
        </div>
      )}
      {/* Bundle Export Modal */}
      {showBundleModal && (
        <BundleExportModal
          grabbedContent={grabbedContent}
          onClose={() => setShowBundleModal(false)}
        />
      )}
    </>
  );
};

