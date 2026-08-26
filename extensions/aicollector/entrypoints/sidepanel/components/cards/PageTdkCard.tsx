import React from 'react';
import { Card, Chip, Separator, Button } from '@heroui/react';
import { Globe, RefreshCw, Send } from 'lucide-react';
import type { PageTDK } from '../../../../src/types';
import type { CollectPayload } from '../../../../src/services/workbench';

interface PageTdkCardProps {
  currentTdk: PageTDK | null;
  onRefresh: () => void;
  onPush: (payload: CollectPayload) => void;
}

/**
 * Card displaying active page metadata (Title, Description, Keywords, URL)
 */
export const PageTdkCard: React.FC<PageTdkCardProps> = ({
  currentTdk,
  onRefresh,
  onPush,
}) => {
  const handlePush = () => {
    if (!currentTdk) return;
    onPush({
      title: currentTdk.title,
      url: currentTdk.url,
      meta: currentTdk,
    });
  };

  return (
    <Card className="bg-surface shadow-sm">
      <Card.Header className="flex flex-row items-center justify-between w-full pb-2">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-accent shrink-0" />
          <Card.Title className="text-xs font-semibold leading-none">当前网页 TDK 元信息</Card.Title>
        </div>
        <div title="刷新元信息">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 cursor-pointer"
            onClick={onRefresh}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </Card.Header>
      <Separator />
      <Card.Content className="py-3 flex flex-col gap-2.5">
        {currentTdk ? (
          <>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Title</span>
              <div className="text-xs font-medium text-foreground leading-snug mt-0.5">
                {currentTdk.title || '无标题'}
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Description</span>
              <div className="text-xs text-muted leading-relaxed mt-0.5">
                {currentTdk.description || '页面未提供 description 描述'}
              </div>
            </div>

            {currentTdk.keywords && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Keywords</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {currentTdk.keywords.split(/[,，]/).slice(0, 5).map((kw, i) => (
                    <Chip key={i} size="sm" variant="secondary" className="text-[11px] h-5">
                      {kw.trim()}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">URL</span>
              <div className="text-[11px] text-muted truncate mt-0.5">
                {currentTdk.url}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full mt-1 cursor-pointer"
              onClick={handlePush}
            >
              <Send className="w-3.5 h-3.5 mr-1" />
              收藏整页到工作台
            </Button>
          </>
        ) : (
          <div className="text-center py-4 text-muted text-xs">
            正在提取页面元信息...
          </div>
        )}
      </Card.Content>
    </Card>
  );
};
