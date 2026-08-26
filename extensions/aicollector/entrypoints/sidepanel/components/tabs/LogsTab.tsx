import React from 'react';
import { Button } from '@heroui/react';
import { Trash2, Clock } from 'lucide-react';
import type { SyncLogItem } from '../../../../src/types';

interface LogsTabProps {
  logs: SyncLogItem[];
  onClearLogs: () => void;
}

/**
 * Tab panel for displaying real-time change listening and collection logs
 */
export const LogsTab: React.FC<LogsTabProps> = ({ logs, onClearLogs }) => {
  const getLogBorderColor = (type: SyncLogItem['type']) => {
    switch (type) {
      case 'bookmark_created':
        return 'var(--success)';
      case 'bookmark_removed':
        return 'var(--danger)';
      default:
        return 'var(--accent)';
    }
  };

  const getLogTitle = (type: SyncLogItem['type']) => {
    switch (type) {
      case 'bookmark_created':
        return '⭐️ 新增书签 & 捕获 TDK';
      case 'bookmark_removed':
        return '🗑️ 移除书签';
      case 'page_grabbed':
        return '🎯 网页选区';
      case 'manual_sync':
        return '⚡️ 手动采集';
      default:
        return '记录';
    }
  };

  return (
    <div className="p-0 outline-none flex flex-col gap-2.5">
      <div className="flex justify-between items-center px-0.5">
        <span className="text-xs font-semibold text-foreground">
          变动与采集监听 ({logs.length})
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[11px] px-2 text-danger hover:text-danger cursor-pointer"
          onClick={onClearLogs}
        >
          <Trash2 className="w-3 h-3 mr-1" />
          清空
        </Button>
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted">
          <Clock className="w-8 h-8 opacity-30 mb-2" />
          <div className="font-medium text-xs">暂无监听记录</div>
          <div className="text-[11px] text-center mt-1 text-muted">
            在浏览器添加书签或选区采集时将自动抓取 TDK 并同步
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[calc(100vh-170px)] overflow-y-auto">
          {logs.map((log) => (
            <div
              key={log.id}
              className="p-2.5 rounded-lg bg-surface border border-border flex flex-col gap-1 border-l-3"
              style={{
                borderLeftColor: getLogBorderColor(log.type),
              }}
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-foreground">
                  {getLogTitle(log.type)}
                </span>
                <span className="text-[10px] text-muted">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs font-medium text-foreground truncate">{log.title}</div>
              <div className="text-[11px] text-muted truncate">{log.url}</div>
              {log.details && (
                <div className="text-[11px] text-accent mt-0.5">{log.details}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
