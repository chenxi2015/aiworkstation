import React, { useState } from 'react';
import { Tabs, Toast } from '@heroui/react';
import { MousePointerClick, Bookmark, Activity, Settings } from 'lucide-react';

import { useTheme } from './hooks/useTheme';
import { useWorkbench } from './hooks/useWorkbench';
import { useCurrentTdk } from './hooks/useCurrentTdk';
import { useBookmarks } from './hooks/useBookmarks';
import { useSyncLogs } from './hooks/useSyncLogs';
import { useVisualGrabber } from './hooks/useVisualGrabber';

import { Header } from './components/Header';
import { GrabTab } from './components/tabs/GrabTab';
import { BookmarksTab } from './components/tabs/BookmarksTab';
import { LogsTab } from './components/tabs/LogsTab';
import { SettingsTab } from './components/tabs/SettingsTab';

export type TabKey = 'grab' | 'bookmarks' | 'logs' | 'settings';

/**
 * Main application component for AI Collector sidepanel
 */
export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('grab');
  const [isScrolled, setIsScrolled] = useState(false);

  // Business hooks
  const { themeMode, toggleTheme, setSpecificTheme } = useTheme();
  const { isOnline, checkWorkbenchStatus, pushToWorkbench } = useWorkbench();
  const { currentTdk, refreshCurrentPageTDK } = useCurrentTdk();
  const { syncLogs, clearSyncLogs } = useSyncLogs();
  const {
    searchQuery,
    setSearchQuery,
    loadBookmarks,
    flattenedBookmarks,
    filteredBookmarks,
  } = useBookmarks();

  const { isGrabbing, grabbedContent, startGrab } = useVisualGrabber(() => {
    setActiveTab('grab');
  });

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    setIsScrolled(e.currentTarget.scrollTop > 2);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground font-sans antialiased text-[13px] select-none">
      {/* Header */}
      <Header
        isOnline={isOnline}
        themeMode={themeMode}
        onToggleTheme={toggleTheme}
      />

      {/* HeroUI Tabs */}
      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => {
          setActiveTab(key as TabKey);
          setIsScrolled(false);
        }}
        className="flex-1 flex flex-col min-h-0 w-full bg-white dark:bg-background"
      >
        {/* Sticky Tab Bar Container */}
        <div className="px-3 pt-2 shrink-0 z-30">
          <Tabs.ListContainer className="w-full">
            <Tabs.List aria-label="侧边栏导航" className="w-full grid grid-cols-4">
              <Tabs.Tab id="grab" className="px-1 text-xs min-w-0">
                <MousePointerClick className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">选区采集</span>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="bookmarks" className="px-1 text-xs min-w-0">
                <Bookmark className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">书签{flattenedBookmarks.length > 0 ? ` (${flattenedBookmarks.length})` : ''}</span>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="logs" className="px-1 text-xs min-w-0">
                <Activity className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">变动日志</span>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="settings" className="px-1 text-xs min-w-0">
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">设置</span>
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </div>

        {/* Main Tab Content */}
        <main
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-3 pb-3 pt-0 flex flex-col gap-3 min-h-0 bg-background"
        >
          <Tabs.Panel id="grab" className="p-0 outline-none">
            <GrabTab
              isGrabbing={isGrabbing}
              grabbedContent={grabbedContent}
              currentTdk={currentTdk}
              isScrolled={isScrolled}
              onStartGrab={startGrab}
              onRefreshTdk={refreshCurrentPageTDK}
              onPushToWorkbench={pushToWorkbench}
            />
          </Tabs.Panel>

          <Tabs.Panel id="bookmarks" className="p-0 outline-none">
            <BookmarksTab
              searchQuery={searchQuery}
              bookmarks={filteredBookmarks}
              onSearchChange={setSearchQuery}
              onRefresh={loadBookmarks}
              onPushToWorkbench={pushToWorkbench}
            />
          </Tabs.Panel>

          <Tabs.Panel id="logs" className="p-0 outline-none">
            <LogsTab
              logs={syncLogs}
              onClearLogs={clearSyncLogs}
            />
          </Tabs.Panel>

          <Tabs.Panel id="settings" className="p-0 outline-none">
            <SettingsTab
              themeMode={themeMode}
              onSetTheme={setSpecificTheme}
              onCheckWorkbenchStatus={() => checkWorkbenchStatus(true)}
            />
          </Tabs.Panel>
        </main>
      </Tabs>

      {/* Unified Global Toast Notification System */}
      <Toast.Provider placement="bottom" />
    </div>
  );
}
