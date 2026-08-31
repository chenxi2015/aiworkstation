import React from 'react';
import { MousePointerClick, Trash2, Camera, Loader2 } from 'lucide-react';
import type { PageTDK, GrabbedContent, SniffedStream } from '../../../../src/types';
import type { CollectPayload } from '../../../../src/services/workbench';
import { GrabbedContentCard } from '../cards/GrabbedContentCard';
import { SniffedStreamsCard } from '../cards/SniffedStreamsCard';
import { PageTdkCard } from '../cards/PageTdkCard';

interface GrabTabProps {
  isGrabbing: boolean;
  isCapturingFullPage?: boolean;
  captureProgress?: { slice: number; totalSlices: number; percent: number } | null;
  grabbedContent: GrabbedContent | null;
  sniffedStreams?: SniffedStream[];
  currentTdk: PageTDK | null;
  isScrolled?: boolean;
  onStartGrab: () => void;
  onCaptureFullPage?: () => void;
  onClearGrabbed?: () => void;
  onClearSniffedStreams?: () => void;
  onRefreshTdk: () => void;
  onPushToWorkbench: (payload: CollectPayload) => void;
}

/**
 * Tab panel for visual element selection and current webpage TDK inspection
 */
export const GrabTab: React.FC<GrabTabProps> = ({
  isGrabbing,
  isCapturingFullPage = false,
  captureProgress,
  grabbedContent,
  sniffedStreams = [],
  currentTdk,
  isScrolled = false,
  onStartGrab,
  onCaptureFullPage,
  onClearGrabbed,
  onClearSniffedStreams,
  onRefreshTdk,
  onPushToWorkbench,
}) => {
  return (
    <div className="p-0 outline-none flex flex-col gap-3">
      {/* Visual Grab & Full Page Action Bar (Sticky Header with background and shadow on scroll) */}
      <div
        className={`sticky top-0 z-20 -mx-3 px-3 py-2 transition-all duration-200 pointer-events-auto ${
          isScrolled
            ? 'bg-white dark:bg-zinc-900 shadow-sm border-b border-black/5 dark:border-white/5'
            : 'bg-transparent'
        }`}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {/* 1. Visual Element Grab Button (First) */}
            <button
              type="button"
              onClick={onStartGrab}
              disabled={isCapturingFullPage}
              className={`relative flex-1 h-10 px-3 rounded-full flex items-center justify-center gap-2 font-medium text-xs transition-all duration-200 select-none group cursor-pointer active:scale-[0.99] shadow-sm hover:shadow-md min-w-0 ${
                isGrabbing
                  ? 'bg-amber-50/90 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 shadow-amber-500/10'
                  : 'bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-blue-50/80 hover:from-blue-100/90 hover:via-indigo-100/70 hover:to-blue-100/90 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-blue-950/30 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 shadow-blue-500/10'
              } disabled:opacity-50`}
            >
              {/* Animated Dashed Border SVG */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none rounded-full overflow-visible"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="1"
                  y="1"
                  width="calc(100% - 2px)"
                  height="calc(100% - 2px)"
                  rx="20"
                  ry="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={isGrabbing ? 2 : 1.5}
                  strokeDasharray="6 4"
                  className={`animate-marching-ants ${
                    isGrabbing
                      ? 'text-amber-500'
                      : 'text-blue-400/80 group-hover:text-blue-600 dark:text-blue-400/70 dark:group-hover:text-blue-300'
                  }`}
                />
              </svg>

              <MousePointerClick
                className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
                  isGrabbing
                    ? 'animate-bounce text-amber-500'
                    : 'text-blue-500 group-hover:scale-110 group-hover:-rotate-6 dark:text-blue-400'
                }`}
              />
              <span className="truncate">
                {isGrabbing ? '正在选择区域...' : '选区拾取'}
              </span>
            </button>

            {/* 2. Full Page Capture Button (Second) */}
            <button
              type="button"
              onClick={onCaptureFullPage}
              disabled={isCapturingFullPage || isGrabbing}
              className={`relative flex-1 h-10 px-3 rounded-full flex items-center justify-center gap-2 font-medium text-xs transition-all duration-200 select-none group cursor-pointer active:scale-[0.99] shadow-sm hover:shadow-md min-w-0 ${
                isCapturingFullPage
                  ? 'bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shadow-emerald-500/10'
                  : 'bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-emerald-50/80 hover:from-emerald-100/90 hover:via-teal-100/70 hover:to-emerald-100/90 dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 shadow-emerald-500/10'
              } disabled:opacity-75`}
            >
              {/* Animated Dashed Border SVG */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none rounded-full overflow-visible"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="1"
                  y="1"
                  width="calc(100% - 2px)"
                  height="calc(100% - 2px)"
                  rx="20"
                  ry="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={isCapturingFullPage ? 2 : 1.5}
                  strokeDasharray="6 4"
                  className={`animate-marching-ants ${
                    isCapturingFullPage
                      ? 'text-emerald-500'
                      : 'text-emerald-400/80 group-hover:text-emerald-600 dark:text-emerald-400/70 dark:group-hover:text-emerald-300'
                  }`}
                />
              </svg>

              {isCapturingFullPage ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-emerald-500" />
                  <span className="truncate">
                    {captureProgress && captureProgress.percent > 0
                      ? `整页截图中 ${captureProgress.percent}%`
                      : '正在截取整页...'}
                  </span>
                </>
              ) : (
                <>
                  <Camera className="w-3.5 h-3.5 shrink-0 text-emerald-500 group-hover:scale-110 group-hover:-rotate-6 transition-transform dark:text-emerald-400" />
                  <span className="truncate">整页截图采集</span>
                </>
              )}
            </button>

            {/* Clear Grabbed Content Button */}
            {grabbedContent && onClearGrabbed && (
              <button
                type="button"
                onClick={onClearGrabbed}
                title="清除已捕获区域内容"
                aria-label="清除已捕获区域内容"
                className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 border border-border/80 hover:border-danger/30 bg-surface dark:bg-surface-secondary shadow-xs hover:shadow-sm transition-all cursor-pointer active:scale-95 animate-in fade-in zoom-in-95 duration-150"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>



          {/* Progress bar when full-page capturing */}
          {isCapturingFullPage && captureProgress && (
            <div className="w-full bg-surface-tertiary h-1.5 rounded-full overflow-hidden border border-border/50 animate-in fade-in">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.max(8, captureProgress.percent)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Grabbed Content Card */}
      {grabbedContent && (
        <GrabbedContentCard
          grabbedContent={grabbedContent}
          onPush={onPushToWorkbench}
        />
      )}

      {/* Sniffed HLS video streams on the current page */}
      <SniffedStreamsCard
        streams={sniffedStreams}
        onClear={onClearSniffedStreams ?? (() => {})}
      />

      {/* Current Page TDK Card */}
      <PageTdkCard
        currentTdk={currentTdk}
        onRefresh={onRefreshTdk}
        onPush={onPushToWorkbench}
      />
    </div>
  );
};
