import React, { useState } from 'react';
import { Card, Chip, Separator, Button } from '@heroui/react';
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
} from 'lucide-react';
import type { GrabbedContent } from '../../../../src/types';
import type { CollectPayload } from '../../../../src/services/workbench';
import { SafeImage } from '../common/SafeImage';
import { CopyButton } from '../common/CopyButton';
import { downloadImage, downloadImagesAsZip } from '../../../../src/utils/imageDownloader';
import { GrabActionToolbar } from '../actions/GrabActionToolbar';

interface GrabbedContentCardProps {
  grabbedContent: GrabbedContent;
  onPush: (payload: CollectPayload) => void;
}

/**
 * Thumbnail item with auto-healing safe image and preview trigger
 */
const ImageThumbnail: React.FC<{
  src: string;
  pageUrl?: string;
  index: number;
  total: number;
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
 * Card displaying captured DOM element data, full image previews, and quick push action
 */
export const GrabbedContentCard: React.FC<GrabbedContentCardProps> = ({
  grabbedContent,
  onPush,
}) => {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHtmlExpanded, setIsHtmlExpanded] = useState(false);
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [singleDownloading, setSingleDownloading] = useState(false);
  const [singleDownloadSuccess, setSingleDownloadSuccess] = useState(false);

  const images = grabbedContent.images || [];
  const maxInitialVisible = 4;
  const displayedImages = isExpanded ? images : images.slice(0, maxInitialVisible);

  // Keyboard navigation support for image preview lightbox
  React.useEffect(() => {
    if (previewIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewIndex(null);
      } else if (e.key === 'ArrowLeft' && images.length > 1) {
        setPreviewIndex((prev) => (prev !== null ? (prev - 1 + images.length) % images.length : null));
      } else if (e.key === 'ArrowRight' && images.length > 1) {
        setPreviewIndex((prev) => (prev !== null ? (prev + 1) % images.length : null));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewIndex, images.length]);

  const hasText = Boolean(grabbedContent.selectedText && grabbedContent.selectedText.trim());
  const hasHtml = Boolean(grabbedContent.selectedHtml && grabbedContent.selectedHtml.trim());

  const handlePush = () => {
    const fallbackContent = images.length > 0 ? `[包含 ${images.length} 张图片]` : '';
    onPush({
      title: grabbedContent.tdk.title || '选区内容',
      url: grabbedContent.url,
      content: hasText ? grabbedContent.selectedText : fallbackContent,
      meta: {
        tdk: grabbedContent.tdk,
        selector: grabbedContent.selector,
        html: grabbedContent.selectedHtml,
        images: grabbedContent.images,
      },
    });
  };

  const handleDownloadZip = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (images.length === 0 || downloading) return;
    try {
      setDownloading(true);
      setDownloadProgress(0);
      const filename = `images_${grabbedContent.tag || 'grab'}_${Date.now()}.zip`;
      await downloadImagesAsZip(
        images,
        grabbedContent.url,
        filename,
        (progress) => {
          setDownloadProgress(progress.percent);
        },
      );
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to download images as ZIP:', err);
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handleDownloadSingleImage = async (src: string | undefined, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!src || singleDownloading) return;
    try {
      setSingleDownloading(true);
      await downloadImage(src, grabbedContent.url);
      setSingleDownloadSuccess(true);
      setTimeout(() => setSingleDownloadSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to download single image:', err);
    } finally {
      setSingleDownloading(false);
    }
  };

  const handlePrevPreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewIndex !== null) {
      setPreviewIndex((previewIndex - 1 + images.length) % images.length);
    }
  };

  const handleNextPreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewIndex !== null) {
      setPreviewIndex((previewIndex + 1) % images.length);
    }
  };

  return (
    <>
      <Card className="bg-surface shadow-sm">
        <Card.Header className="flex flex-row items-center justify-between w-full pb-2">
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
          ) : images.length === 0 ? (
            <div>
              <span className="text-[11px] font-semibold text-muted">提取正文:</span>
              <div className="bg-surface-tertiary p-2 rounded-md font-mono text-[11px] text-muted/60 mt-0.5 italic">
                （无可见文本内容）
              </div>
            </div>
          ) : null}

          {/* Images Section */}
          {images.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-muted flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-accent" />
                    {images.length === 1 ? '包含图片:' : `包含图片 (${images.length}):`}
                  </span>
                  <button
                    type="button"
                    onClick={handleDownloadZip}
                    disabled={downloading}
                    title={
                      images.length === 1
                        ? '打包下载图片 (ZIP)'
                        : `打包下载全部 ${images.length} 张图片 (ZIP)`
                    }
                    className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    {downloading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                        <span className="text-[10px] text-accent font-mono">
                          {downloadProgress > 0 ? `打包中 ${downloadProgress}%` : '打包中...'}
                        </span>
                      </>
                    ) : downloadSuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-success" />
                        <span className="text-[10px] text-success">已下载 ZIP</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span className="text-[10px]">
                          {images.length === 1 ? '下载 ZIP' : `下载 ZIP (${images.length})`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
                {images.length > maxInitialVisible && (
                  <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-[11px] text-accent hover:underline font-medium cursor-pointer"
                  >
                    {isExpanded ? '收起' : `展开全部 (${images.length}张)`}
                  </button>
                )}
              </div>

              {/* Grid of image thumbnails */}
              <div
                className={`grid ${
                  images.length === 1 ? 'grid-cols-2 max-w-[200px]' : 'grid-cols-4'
                } gap-2 transition-all ${
                  isExpanded ? 'max-h-48 overflow-y-auto pr-0.5' : ''
                }`}
              >
                {displayedImages.map((src, i) => (
                  <ImageThumbnail
                    key={`${src}-${i}`}
                    src={src}
                    pageUrl={grabbedContent.url}
                    index={i}
                    total={images.length}
                    onClick={() => setPreviewIndex(i)}
                  />
                ))}
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

      {/* Image Preview Lightbox Modal */}
      {previewIndex !== null && images[previewIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-4 animate-in fade-in duration-150 select-none"
          onClick={() => setPreviewIndex(null)}
        >
          {/* Header controls */}
          <div
            className="absolute top-3 left-3 right-3 flex items-center justify-between text-white text-xs z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-black/60 px-2.5 py-1 rounded-full text-[11px] font-medium backdrop-blur-xs border border-white/10">
              {previewIndex + 1} / {images.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-all cursor-pointer border border-white/10"
                onClick={(e) => handleDownloadSingleImage(images[previewIndex], e)}
                disabled={singleDownloading}
                title="下载此原图"
              >
                {singleDownloading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-accent" />
                ) : singleDownloadSuccess ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </button>
              <a
                href={images[previewIndex]}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-all cursor-pointer border border-white/10"
                title="在浏览器新标签页打开原图"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
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

          {/* Main Image Container */}
          <div
            className="relative max-w-full max-h-[75vh] flex items-center justify-center px-8"
            onClick={(e) => e.stopPropagation()}
          >
            <SafeImage
              src={images[previewIndex]}
              pageUrl={grabbedContent.url}
              alt={`preview-${previewIndex}`}
              className="max-w-full max-h-[72vh] object-contain rounded shadow-2xl border border-white/10 pointer-events-auto"
            />
          </div>

          {/* Prev / Next controls fixed strictly to the left & right viewport sides */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrevPreview}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/65 hover:bg-black/90 text-white/90 hover:text-white backdrop-blur-xs border border-white/15 shadow-xl transition-all cursor-pointer hover:scale-105 active:scale-95"
                title="上一张 (←)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleNextPreview}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/65 hover:bg-black/90 text-white/90 hover:text-white backdrop-blur-xs border border-white/15 shadow-xl transition-all cursor-pointer hover:scale-105 active:scale-95"
                title="下一张 (→)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Footer URL hint */}
          <div
            className="mt-3 text-[11px] text-white/70 max-w-xs truncate text-center font-mono px-2 py-0.5 rounded bg-black/40 border border-white/5"
            onClick={(e) => e.stopPropagation()}
            title={images[previewIndex]}
          >
            {images[previewIndex]}
          </div>
        </div>
      )}
    </>
  );
};
