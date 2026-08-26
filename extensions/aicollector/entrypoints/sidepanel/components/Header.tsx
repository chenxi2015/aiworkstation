import React from 'react';
import { Button, Chip } from '@heroui/react';
import { Sparkles, Sun, Moon, Monitor } from 'lucide-react';
import type { ThemeMode } from '../../../src/utils/theme';

interface HeaderProps {
  isOnline: boolean;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
}

/**
 * Top header component with branding, connection status, and theme toggle
 */
export const Header: React.FC<HeaderProps> = ({
  isOnline,
  themeMode,
  onToggleTheme,
}) => {
  return (
    <header className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-accent text-accent-foreground flex items-center justify-center shadow-sm">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight text-foreground">AI Workstation</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Chip
          size="sm"
          variant="soft"
          color={isOnline ? 'success' : 'danger'}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full mr-1 inline-block ${isOnline ? 'bg-success' : 'bg-danger'}`}
          />
          {isOnline ? '在线' : '离线'}
        </Chip>

        {/* Theme Mode Toggle Button */}
        <div title={`当前主题: ${themeMode === 'light' ? '明亮模式' : themeMode === 'dark' ? '暗黑模式' : '跟随系统'}`}>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 cursor-pointer"
            onClick={onToggleTheme}
          >
            {themeMode === 'light' && <Sun className="w-4 h-4 text-amber-500" />}
            {themeMode === 'dark' && <Moon className="w-4 h-4 text-indigo-400" />}
            {themeMode === 'auto' && <Monitor className="w-4 h-4 text-muted" />}
          </Button>
        </div>
      </div>
    </header>
  );
};
