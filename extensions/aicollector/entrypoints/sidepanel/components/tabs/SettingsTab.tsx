import React from 'react';
import { Card, Separator, Button } from '@heroui/react';
import { Sun, Moon, Monitor, RefreshCw } from 'lucide-react';
import type { ThemeMode } from '../../../../src/utils/theme';
import { DEFAULT_WORKBENCH_URL } from '../../../../src/services/workbench';

interface SettingsTabProps {
  themeMode: ThemeMode;
  onSetTheme: (mode: ThemeMode) => void;
  onCheckWorkbenchStatus: () => void;
}

/**
 * Tab panel for application settings and information
 */
export const SettingsTab: React.FC<SettingsTabProps> = ({
  themeMode,
  onSetTheme,
  onCheckWorkbenchStatus,
}) => {
  return (
    <div className="p-0 outline-none flex flex-col gap-3">
      {/* Theme Preference Card */}
      <Card className="bg-surface border border-border shadow-sm">
        <Card.Header className="pb-2">
          <Card.Title className="text-xs font-semibold">界面主题外观</Card.Title>
        </Card.Header>
        <Separator />
        <Card.Content className="py-3 flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            <Button
              size="sm"
              variant={themeMode === 'light' ? 'primary' : 'outline'}
              className="h-8 text-xs cursor-pointer"
              onClick={() => onSetTheme('light')}
            >
              <Sun className="w-3.5 h-3.5 mr-1 text-amber-500" />
              明亮模式
            </Button>
            <Button
              size="sm"
              variant={themeMode === 'dark' ? 'primary' : 'outline'}
              className="h-8 text-xs cursor-pointer"
              onClick={() => onSetTheme('dark')}
            >
              <Moon className="w-3.5 h-3.5 mr-1 text-indigo-400" />
              暗黑模式
            </Button>
            <Button
              size="sm"
              variant={themeMode === 'auto' ? 'primary' : 'outline'}
              className="h-8 text-xs cursor-pointer"
              onClick={() => onSetTheme('auto')}
            >
              <Monitor className="w-3.5 h-3.5 mr-1" />
              跟随系统
            </Button>
          </div>
        </Card.Content>
      </Card>

      {/* Workbench Connection Card */}
      <Card className="bg-surface border border-border shadow-sm">
        <Card.Header className="pb-2">
          <Card.Title className="text-xs font-semibold">本地 AI 工作台连接</Card.Title>
        </Card.Header>
        <Separator />
        <Card.Content className="py-3 flex flex-col gap-3">
          <div>
            <span className="text-[11px] font-semibold text-muted">服务地址:</span>
            <input
              type="text"
              defaultValue={DEFAULT_WORKBENCH_URL}
              className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-1.5 text-xs text-foreground mt-1 focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <span className="text-[11px] font-semibold text-muted">采集接收端点:</span>
            <div className="text-xs font-mono text-accent mt-0.5">POST /api/collect</div>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="w-full mt-1 cursor-pointer"
            onClick={onCheckWorkbenchStatus}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            检测工作台连接状态
          </Button>
        </Card.Content>
      </Card>

      {/* Mechanics / Help Card */}
      <Card className="bg-surface border border-border shadow-sm">
        <Card.Header className="pb-2">
          <Card.Title className="text-xs font-semibold">机制说明</Card.Title>
        </Card.Header>
        <Separator />
        <Card.Content className="py-3 text-xs text-muted leading-relaxed flex flex-col gap-2">
          <div>
            <strong className="text-foreground">1. 书签变动监听：</strong>
            添加书签时自动从当前 Tab 抓取 TDK 元数据并回传工作台。
          </div>
          <div>
            <strong className="text-foreground">2. 智能选区拾取：</strong>
            在网页内悬浮选择，按 ↑/↓ 导航 DOM 层级，按 Esc 退出。
          </div>
          <div>
            <strong className="text-foreground">3. 本地离线队列：</strong>
            工作台离线时自动在本地安全暂存。
          </div>
        </Card.Content>
      </Card>
    </div>
  );
};
