import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCw,
  RotateCcw,
  Download,
  Copy,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { Button, ButtonGroup, Toast, toast } from '@heroui/react';

interface ViewerImagePayload {
  url: string;
  title?: string;
  dimensions?: {
    width: number;
    height: number;
  };
  tag?: string;
  timestamp?: number;
}

export const ViewerApp: React.FC = () => {
  const [data, setData] = useState<ViewerImagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  // 1. Load image data from chrome.storage.local or URL parameters
  useEffect(() => {
    const loadPayload = async () => {
      try {
        const res = await chrome.storage.local.get('viewer_image');
        if (res.viewer_image && typeof res.viewer_image === 'object') {
          setData(res.viewer_image as ViewerImagePayload);
          setLoading(false);
          return;
        }

        // Fallback: check search params
        const params = new URLSearchParams(window.location.search);
        const urlParam = params.get('url');
        if (urlParam) {
          setData({
            url: decodeURIComponent(urlParam),
            title: params.get('title') || '区域截图',
          });
        }
      } catch (err) {
        console.error('Failed to load viewer image payload:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPayload();
  }, []);

  // 2. Fit to Screen calculation
  const handleFitToScreen = useCallback(() => {
    if (!imgRef.current) return;
    const img = imgRef.current;
    if (!img.naturalWidth || !img.naturalHeight) return;

    const padX = 80;
    const padY = 120;
    const availW = window.innerWidth - padX;
    const availH = window.innerHeight - padY;

    const isRotated90 = Math.abs(rotation % 180) === 90;
    const currentW = isRotated90 ? img.naturalHeight : img.naturalWidth;
    const currentH = isRotated90 ? img.naturalWidth : img.naturalHeight;

    const newScale = Math.min(availW / currentW, availH / currentH, 1);
    setScale(Math.max(0.1, newScale));
    setPan({ x: 0, y: 0 });
  }, [rotation]);

  // Initial fit once image loads
  const handleImageLoad = () => {
    handleFitToScreen();
  };

  // 3. Zoom Controls
  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev * 1.25, 15));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev * 0.8, 0.08));
  };

  const handleResetZoom = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  // 4. Rotation Controls
  const handleRotateRight = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleRotateLeft = () => {
    setRotation((prev) => (prev - 90 + 360) % 360);
  };

  // 5. Copy image to clipboard
  const handleCopyImage = async () => {
    if (!data?.url) return;
    try {
      const resp = await fetch(data.url);
      const blob = await resp.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      setCopied(true);
      toast.success('已复制高清图片到剪贴板', {
        description: '可直接在聊天软件或文档中粘贴',
        timeout: 2500,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy image:', err);
      toast.danger('复制图片失败', { timeout: 2500 });
    }
  };

  // 6. Download PNG
  const handleDownload = () => {
    if (!data?.url) return;
    const a = document.createElement('a');
    a.href = data.url;
    const filename = `screenshot_${(data.title || 'image').slice(0, 25).trim()}_${Date.now()}.png`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('已开始下载图片', { timeout: 2000 });
  };

  // 7. Close tab
  const handleClose = () => {
    window.close();
  };

  // 8. Wheel: scroll pans the image up/down; pinch gesture (ctrl+wheel) zooms at cursor
  // Note: viewport only exists after loading completes, so re-run when it mounts
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinch-to-zoom fires wheel events with ctrlKey=true in Chromium
        const zoomFactor = Math.exp(-e.deltaY * 0.01);
        const rect = viewport.getBoundingClientRect();
        const cursorX = e.clientX - rect.left - rect.width / 2;
        const cursorY = e.clientY - rect.top - rect.height / 2;

        const prevScale = scaleRef.current;
        const nextScale = Math.min(Math.max(0.08, prevScale * zoomFactor), 15);
        const ratio = nextScale / prevScale;
        const prevPan = panRef.current;

        setScale(nextScale);
        setPan({
          x: cursorX - ratio * (cursorX - prevPan.x),
          y: cursorY - ratio * (cursorY - prevPan.y),
        });
      } else {
        // Wheel / two-finger scroll pans the image
        const prevPan = panRef.current;
        setPan({
          x: prevPan.x - e.deltaX,
          y: prevPan.y - e.deltaY,
        });
      }
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [loading, data?.url]);

  // 8b. Block browser-native pinch zoom (e.g. when cursor hovers over the toolbar)
  useEffect(() => {
    const blockNativeZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    window.addEventListener('wheel', blockNativeZoom, { passive: false });
    return () => window.removeEventListener('wheel', blockNativeZoom);
  }, []);

  // 9. Mouse Drag to Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - pan.x,
      y: e.clientY - pan.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 10. Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.close();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleResetZoom();
      } else if (e.key === 'f' || e.key === 'F') {
        handleFitToScreen();
      } else if (e.key === 'r' || e.key === 'R') {
        handleRotateRight();
      } else if (e.key === 'l' || e.key === 'L') {
        handleRotateLeft();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFitToScreen]);

  const title = data?.title || '区域截图';
  const dimensions = data?.dimensions;
  const zoomPercent = Math.round(scale * 100);

  if (loading) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-zinc-950 text-white gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="text-sm font-medium text-zinc-400">正在载入原图...</span>
      </div>
    );
  }

  if (!data?.url) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-zinc-950 text-white gap-3">
        <p className="text-sm text-zinc-400">未找到图片数据</p>
        <button
          type="button"
          onClick={handleClose}
          className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium cursor-pointer"
        >
          关闭标签页
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#090d16] select-none flex flex-col dark" data-theme="dark">
      {/* Toast notification system */}
      <Toast.Provider placement="bottom" />

      {/* Radial mesh background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Top Floating Controls Toolbar */}
      <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 bg-surface/90 backdrop-blur-xl border border-border rounded-full shadow-2xl max-w-[95vw] animate-in fade-in slide-in-from-top-2 duration-200">
        {/* Title & Dimension info */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold text-foreground max-w-[140px] sm:max-w-[220px] truncate" title={title}>
            {title}
          </span>
          {dimensions && (
            <span className="font-mono text-foreground bg-default/40 border border-border px-1.5 py-0.5 rounded-full whitespace-nowrap">
              {dimensions.width} × {dimensions.height}
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleResetZoom}
            aria-label="点击重置为 100%"
          >
            {zoomPercent}%
          </Button>
        </div>

        {/* Action ButtonGroup */}
        <ButtonGroup size="lg" variant="ghost">
          <Button isIconOnly onClick={handleZoomOut} aria-label="缩小 (快捷键: -)">
            <ZoomOut />
          </Button>
          <Button isIconOnly onClick={handleZoomIn} aria-label="放大 (快捷键: +)">
            <ZoomIn />
          </Button>
          <Button isIconOnly onClick={handleFitToScreen} aria-label="适应屏幕 (快捷键: F)">
            <Maximize2 />
          </Button>
          <Button onClick={handleResetZoom} aria-label="原图 1:1 尺寸 (快捷键: 0)">
            1:1
          </Button>

          <ButtonGroup.Separator />

          <Button isIconOnly onClick={handleRotateLeft} aria-label="向左旋转 90° (快捷键: L)">
            <RotateCcw />
          </Button>
          <Button isIconOnly onClick={handleRotateRight} aria-label="向右旋转 90° (快捷键: R)">
            <RotateCw />
          </Button>

          <ButtonGroup.Separator />

          <Button isIconOnly onClick={handleCopyImage} aria-label="复制图片到剪贴板">
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
          <Button isIconOnly onClick={handleDownload} aria-label="下载 PNG 图片">
            <Download />
          </Button>
          <Button isIconOnly onClick={handleClose} aria-label="关闭页面 (Esc)">
            <X />
          </Button>
        </ButtonGroup>
      </header>

      {/* Main Pan & Zoom Viewport */}
      <main
        ref={viewportRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`w-full h-full flex items-center justify-center relative overflow-hidden ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <div
          className="relative transition-transform duration-75 ease-out will-change-transform flex items-center justify-center"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          <img
            ref={imgRef}
            src={data.url}
            alt={title}
            onLoad={handleImageLoad}
            className="max-w-none max-h-none rounded-md shadow-2xl border border-white/10 pointer-events-none"
            draggable={false}
          />
        </div>
      </main>

      {/* Bottom Shortcuts Footer Hint */}
      <footer className="fixed bottom-3 left-4 text-[11px] font-mono text-zinc-500 pointer-events-none z-20">
        滚轮/双指滚动图片 • 双指捏合缩放 • 拖拽平移 • [+/-] 缩放 • [0] 100% • [F] 适应屏幕 • [R/L] 旋转 • [Esc] 关闭
      </footer>
    </div>
  );
};
