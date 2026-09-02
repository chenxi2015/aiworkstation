import React, { useState, useEffect } from 'react';
import { Card, Separator, Button, toast } from '@heroui/react';
import { Sun, Moon, Monitor, RefreshCw, Check, RotateCcw } from 'lucide-react';
import type { ThemeMode } from '../../../../src/utils/theme';
import { DEFAULT_WORKBENCH_URL, WorkbenchService } from '../../../../src/services/workbench';

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
  const [workbenchUrl, setWorkbenchUrl] = useState(DEFAULT_WORKBENCH_URL);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    WorkbenchService.getWorkbenchUrl().then((url) => {
      setWorkbenchUrl(url);
    });
  }, []);

  const handleSaveUrl = async () => {
    const trimmed = workbenchUrl.trim() || DEFAULT_WORKBENCH_URL;
    setIsSaving(true);
    await WorkbenchService.setWorkbenchUrl(trimmed);
    setWorkbenchUrl(trimmed);
    setIsSaving(false);
    toast.success('服务地址已更新', {
      description: trimmed,
      timeout: 2000,
    });
    onCheckWorkbenchStatus();
  };

  const handleResetUrl = async () => {
    setIsSaving(true);
    await WorkbenchService.setWorkbenchUrl(DEFAULT_WORKBENCH_URL);
    setWorkbenchUrl(DEFAULT_WORKBENCH_URL);
    setIsSaving(false);
    toast.success('已恢复默认服务地址', {
      description: DEFAULT_WORKBENCH_URL,
      timeout: 2000,
    });
    onCheckWorkbenchStatus();
  };

  return (
    <div className="p-0 outline-none flex flex-col gap-3 pt-2">
      {/* Theme Preference Card */}
      <Card className="bg-surface">
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
      <Card className="bg-surface">
        <Card.Header className="pb-2 flex justify-between items-center">
          <Card.Title className="text-xs font-semibold">本地 AI 工作台连接</Card.Title>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[11px] px-2 text-muted hover:text-foreground cursor-pointer"
            onClick={handleResetUrl}
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            恢复默认
          </Button>
        </Card.Header>
        <Separator />
        <Card.Content className="py-3 flex flex-col gap-3">
          <div>
            <span className="text-[11px] font-semibold text-muted">服务地址 (可自定义端口):</span>
            <div className="flex gap-1.5 mt-1">
              <input
                type="text"
                value={workbenchUrl}
                onChange={(e) => setWorkbenchUrl(e.target.value)}
                placeholder="http://localhost:3888"
                className="flex-1 bg-surface-secondary border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent"
              />
              <Button
                size="sm"
                variant="primary"
                className="h-8 text-xs px-3 cursor-pointer shrink-0"
                onClick={handleSaveUrl}
                isDisabled={isSaving}
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                保存
              </Button>
            </div>
          </div>

          <div>
            <span className="text-[11px] font-semibold text-muted">采集接收端点:</span>
            <div className="text-xs font-mono text-accent mt-0.5">
              POST {workbenchUrl.replace(/\/+$/, '')}/api/collect
            </div>
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
      <Card className="bg-surface">
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
            <strong className="text-foreground">3. 自动防盗链穿透：</strong>
            智能提取当前网站根域名动态穿透图片防盗链，支持全网任意站点 WebP/高清大图无缝预览。
          </div>
          <div>
            <strong className="text-foreground">4. 本地离线队列：</strong>
            工作台离线时自动在本地安全暂存。
          </div>
        </Card.Content>
      </Card>
    </div>
  );
};

