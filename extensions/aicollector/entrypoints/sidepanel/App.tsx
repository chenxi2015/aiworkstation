import React, { useState } from 'react';
import { Tabs } from '@heroui/react';
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

  // Business hooks
  const { themeMode, toggleTheme, setSpecificTheme } = useTheme();
  const { isOnline, pushStatus, checkWorkbenchStatus, pushToWorkbench } = useWorkbench();
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
        onSelectionChange={(key) => setActiveTab(key as TabKey)}
        className="flex-1 flex flex-col min-h-0 w-full"
      >
        {/* Sticky Tab Bar Container with solid background */}
        <div className="bg-background px-3 pt-2 pb-1 shrink-0 z-30">
          <Tabs.ListContainer className="w-full">
            <Tabs.List aria-label="侧边栏导航" className="w-full grid grid-cols-4">
              <Tabs.Tab id="grab">
                <MousePointerClick className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">选区采集</span>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="bookmarks">
                <Bookmark className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">书签 ({flattenedBookmarks.length})</span>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="logs">
                <Activity className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">变动日志</span>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="settings">
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">设置</span>
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </div>

        {/* Main Tab Content */}
        <main className="flex-1 overflow-y-auto px-3 pb-3 pt-0 flex flex-col gap-3 min-h-0">
          <Tabs.Panel id="grab" className="p-0 outline-none">
            <GrabTab
              isGrabbing={isGrabbing}
              grabbedContent={grabbedContent}
              currentTdk={currentTdk}
              pushStatus={pushStatus}
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
              onCheckWorkbenchStatus={checkWorkbenchStatus}
            />
          </Tabs.Panel>
        </main>
      </Tabs>
    </div>
  );
}
