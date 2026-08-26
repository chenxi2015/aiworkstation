import React from 'react';
import { Card, Chip, Separator, Button } from '@heroui/react';
import { Layers, Send } from 'lucide-react';
import type { GrabbedContent } from '../../../../src/types';
import type { CollectPayload } from '../../../../src/services/workbench';

interface GrabbedContentCardProps {
  grabbedContent: GrabbedContent;
  onPush: (payload: CollectPayload) => void;
}

/**
 * Card displaying captured DOM element data and quick push action
 */
export const GrabbedContentCard: React.FC<GrabbedContentCardProps> = ({
  grabbedContent,
  onPush,
}) => {
  const handlePush = () => {
    onPush({
      title: grabbedContent.tdk.title || '选区内容',
      url: grabbedContent.url,
      content: grabbedContent.selectedText,
      meta: {
        tdk: grabbedContent.tdk,
        selector: grabbedContent.selector,
        html: grabbedContent.selectedHtml,
        images: grabbedContent.images,
      },
    });
  };

  return (
    <Card className="bg-surface">
      <Card.Header className="flex justify-between items-center pb-2">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-accent" />
          <Card.Title className="text-xs font-semibold">已捕获区域</Card.Title>
        </div>
        <Chip size="sm" variant="soft" color="accent">
          {grabbedContent.tag} ({grabbedContent.dimensions.width}×{grabbedContent.dimensions.height})
        </Chip>
      </Card.Header>
      <Separator />
      <Card.Content className="py-2.5 flex flex-col gap-2.5">
        <div>
          <span className="text-[11px] font-semibold text-muted">CSS 选择器:</span>
          <div className="text-[11px] font-mono text-accent mt-0.5 break-all">
            {grabbedContent.selector}
          </div>
        </div>

        <div>
          <span className="text-[11px] font-semibold text-muted">提取正文:</span>
          <div className="bg-surface-tertiary p-2 rounded-md font-mono text-[11px] text-foreground max-h-32 overflow-y-auto mt-0.5 whitespace-pre-wrap">
            {grabbedContent.selectedText.slice(0, 300)}
            {grabbedContent.selectedText.length > 300 ? '...' : ''}
          </div>
        </div>

        {grabbedContent.images.length > 0 && (
          <div>
            <span className="text-[11px] font-semibold text-muted">
              包含图片 ({grabbedContent.images.length}):
            </span>
            <div className="flex gap-1.5 overflow-x-auto py-1">
              {grabbedContent.images.slice(0, 4).map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt="thumb"
                  className="w-12 h-12 object-cover rounded border border-border"
                />
              ))}
            </div>
          </div>
        )}

        <Button
          variant="primary"
          size="sm"
          className="w-full mt-1 font-medium cursor-pointer"
          onClick={handlePush}
        >
          <Send className="w-3.5 h-3.5 mr-1" />
          归集此区域到工作台
        </Button>
      </Card.Content>
    </Card>
  );
};
