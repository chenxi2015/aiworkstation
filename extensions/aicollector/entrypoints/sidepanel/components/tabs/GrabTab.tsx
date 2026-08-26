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
  pushStatus: string | null;
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
  pushStatus,
  onStartGrab,
  onRefreshTdk,
  onPushToWorkbench,
}) => {
  return (
    <div className="p-0 outline-none flex flex-col gap-3">
      {/* Visual Grab Button (Sticky Header with downward gradient fade) */}
      <div className="sticky top-0 z-20 -mx-3 px-3 pt-1 pb-2 bg-gradient-to-b from-background via-background via-85% to-transparent pointer-events-auto">
        <button
          type="button"
          onClick={onStartGrab}
          className={`relative w-full h-11 px-4 rounded-xl flex items-center justify-center gap-2.5 font-medium text-sm transition-all duration-200 select-none group cursor-pointer active:scale-[0.99] shadow-sm hover:shadow-md ${
            isGrabbing
              ? 'bg-amber-50/90 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 shadow-amber-500/10'
              : 'bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-blue-50/80 hover:from-blue-100/90 hover:via-indigo-100/70 hover:to-blue-100/90 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-blue-950/30 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 shadow-blue-500/10'
          }`}
        >
          {/* Animated Dashed Border SVG */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none rounded-xl overflow-visible"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="1"
              y="1"
              width="calc(100% - 2px)"
              height="calc(100% - 2px)"
              rx="11"
              ry="11"
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
            className={`w-4 h-4 transition-transform duration-200 ${
              isGrabbing
                ? 'animate-bounce text-amber-500'
                : 'text-blue-500 group-hover:scale-110 group-hover:-rotate-6 dark:text-blue-400'
            }`}
          />
          <span className="tracking-wide">
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

      {/* Push Status Feedback Banner */}
      {pushStatus && (
        <div className="p-2.5 rounded-lg bg-accent/15 border border-accent/30 text-center font-medium text-xs text-accent">
          {pushStatus}
        </div>
      )}
    </div>
  );
};
