import React from 'react';
import { MousePointerClick } from 'lucide-react';
import type { PageTDK, GrabbedContent } from '../../../../src/types';
import type { CollectPayload } from '../../../../src/services/workbench';
import { GrabbedContentCard } from '../cards/GrabbedContentCard';
import { PageTdkCard } from '../cards/PageTdkCard';

interface GrabTabProps {
  isGrabbing: boolean;
  grabbedContent: GrabbedContent | null;
  currentTdk: PageTDK | null;
  isScrolled?: boolean;
  onStartGrab: () => void;
  onRefreshTdk: () => void;
  onPushToWorkbench: (payload: CollectPayload) => void;
}

/**
 * Tab panel for visual element selection and current webpage TDK inspection
 */
export const GrabTab: React.FC<GrabTabProps> = ({
  isGrabbing,
  grabbedContent,
  currentTdk,
  isScrolled = false,
  onStartGrab,
  onRefreshTdk,
  onPushToWorkbench,
}) => {
  return (
    <div className="p-0 outline-none flex flex-col gap-3">
      {/* Visual Grab Button (Sticky Header with background and shadow on scroll) */}
      <div
        className={`sticky top-0 z-20 -mx-3 px-3 py-2 transition-all duration-200 pointer-events-auto ${
          isScrolled
            ? 'bg-white dark:bg-zinc-900 shadow-sm border-b border-black/5 dark:border-white/5'
            : 'bg-transparent'
        }`}
      >
        <button
          type="button"
          onClick={onStartGrab}
          className={`relative w-full h-10 px-3 sm:px-4 rounded-full flex items-center justify-center gap-2 font-medium text-xs sm:text-sm transition-all duration-200 select-none group cursor-pointer active:scale-[0.99] shadow-sm hover:shadow-md min-w-0 ${
            isGrabbing
              ? 'bg-amber-50/90 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 shadow-amber-500/10'
              : 'bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-blue-50/80 hover:from-blue-100/90 hover:via-indigo-100/70 hover:to-blue-100/90 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-blue-950/30 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 shadow-blue-500/10'
          }`}
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

          {/* Button Content */}
          <MousePointerClick
            className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
              isGrabbing
                ? 'animate-bounce text-amber-500'
                : 'text-blue-500 group-hover:scale-110 group-hover:-rotate-6 dark:text-blue-400'
            }`}
          />
          <span className="truncate tracking-wide">
            {isGrabbing ? '正在网页中选择目标区域...' : '选择网页区域 (Visual Grab)'}
          </span>
        </button>
      </div>

      {/* Grabbed Content Card */}
      {grabbedContent && (
        <GrabbedContentCard
          grabbedContent={grabbedContent}
          onPush={onPushToWorkbench}
        />
      )}

      {/* Current Page TDK Card */}
      <PageTdkCard
        currentTdk={currentTdk}
        onRefresh={onRefreshTdk}
        onPush={onPushToWorkbench}
      />
    </div>
  );
};
