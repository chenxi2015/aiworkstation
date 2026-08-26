import React from 'react';
import { Button } from '@heroui/react';
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
      {/* Visual Grab Button */}
      <Button
        variant="primary"
        className="w-full h-11 font-semibold shadow-md cursor-pointer"
        onClick={onStartGrab}
      >
        <MousePointerClick className="w-4 h-4 mr-2" />
        {isGrabbing ? '正在网页中选择目标区域...' : '选择网页区域 (Visual Grab)'}
      </Button>

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
