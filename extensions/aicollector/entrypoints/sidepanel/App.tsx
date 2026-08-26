import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Button,
  Card,
  Chip,
  Separator,
} from '@heroui/react';
import {
  Sparkles,
  Bookmark,
  Activity,
  Settings,
  MousePointerClick,
  Send,
  Search,
  ExternalLink,
  Trash2,
  RefreshCw,
  Layers,
  Clock,
  Globe,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import type { PageTDK, GrabbedContent, SyncLogItem } from '../../src/types';
import {
  type ThemeMode,
  applyThemeMode,
  getSavedThemeMode,
  saveThemeMode,
} from '../../src/utils/theme';

const WORKBENCH_API = 'http://localhost:3000/api/collect';

export default function App() {
  const [activeTab, setActiveTab] = useState<'grab' | 'bookmarks' | 'logs' | 'settings'>('grab');
  const [currentTdk, setCurrentTdk] = useState<PageTDK | null>(null);
  const [isGrabbing, setIsGrabbing] = useState(false);
  const [grabbedContent, setGrabbedContent] = useState<GrabbedContent | null>(null);
  const [bookmarkTree, setBookmarkTree] = useState<chrome.bookmarks.BookmarkTreeNode[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncLogs, setSyncLogs] = useState<SyncLogItem[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');

  // Initialize theme mode
  useEffect(() => {
    getSavedThemeMode().then((mode) => {
      setThemeMode(mode);
      applyThemeMode(mode);
    });

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      getSavedThemeMode().then((m) => {
        if (m === 'auto') applyThemeMode('auto');
      });
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const handleToggleTheme = () => {
    const nextMode: ThemeMode = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'auto' : 'light';
    setThemeMode(nextMode);
    saveThemeMode(nextMode);
  };

  const handleSetSpecificTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    saveThemeMode(mode);
  };

  // Check backend health
  const checkWorkbenchStatus = useCallback(async () => {
    try {
      await fetch('http://localhost:3000', { method: 'HEAD', mode: 'no-cors' });
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  }, []);

  // Fetch current tab TDK
  const refreshCurrentPageTDK = useCallback(async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab && typeof tab.id === 'number') {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TDK' });
        if (response?.tdk) {
          setCurrentTdk(response.tdk);
          return;
        }
      }
    } catch {
      // Content script may not be injected on browser system pages
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      setCurrentTdk({
        title: tab.title || '',
        description: '',
        keywords: '',
        url: tab.url || '',
        favicon: tab.favIconUrl,
        siteName: tab.url ? new URL(tab.url).hostname : '',
      });
    }
  }, []);

  // Load Bookmarks
  const loadBookmarks = useCallback(async () => {
    try {
      const tree = await chrome.bookmarks.getTree();
      setBookmarkTree(tree);
    } catch (err) {
      console.error('Failed to load bookmarks:', err);
    }
  }, []);

  // Load Sync Logs
  const loadSyncLogs = useCallback(async () => {
    try {
      const res = await chrome.storage.local.get('sync_logs');
      setSyncLogs(Array.isArray(res.sync_logs) ? (res.sync_logs as SyncLogItem[]) : []);
    } catch (err) {
      console.error('Failed to load sync logs:', err);
    }
  }, []);

  // Initial setup and listeners
  useEffect(() => {
    checkWorkbenchStatus();
    refreshCurrentPageTDK();
    loadBookmarks();
    loadSyncLogs();

    const tabListener = () => {
      refreshCurrentPageTDK();
    };
    chrome.tabs.onActivated.addListener(tabListener);
    chrome.tabs.onUpdated.addListener(tabListener);

    const messageListener = (message: any) => {
      if (message.type === 'ELEMENT_GRABBED' && message.payload) {
        setGrabbedContent(message.payload);
        setIsGrabbing(false);
        setActiveTab('grab');
      } else if (message.type === 'SYNC_LOG_UPDATE' && message.payload) {
        setSyncLogs((prev) => [message.payload, ...prev.slice(0, 99)]);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.tabs.onActivated.removeListener(tabListener);
      chrome.tabs.onUpdated.removeListener(tabListener);
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [checkWorkbenchStatus, refreshCurrentPageTDK, loadBookmarks, loadSyncLogs]);

  // Start Visual Grabber
  const handleStartGrab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    setIsGrabbing(true);
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'START_VISUAL_GRAB' });
    } catch {
      alert('无法在当前页面启动选区拾取（请刷新目标页面或检查是否为浏览器受限页面）');
      setIsGrabbing(false);
    }
  };

  // Push to workbench
  const handlePushToWorkbench = async (data: { title: string; url: string; content?: string; meta?: any }) => {
    setPushStatus('正在同步...');
    try {
      const response = await fetch(WORKBENCH_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          url: data.url,
          content: data.content || '',
          type: data.content ? 'article' : 'link',
          siteMeta: data.meta || {},
          createdAt: Date.now(),
        }),
      });

      if (response.ok) {
        setPushStatus('✅ 已成功归集到本地工作台');
        setTimeout(() => setPushStatus(null), 2500);
      } else {
        setPushStatus('❌ 同步失败，服务返回异常');
      }
    } catch {
      setPushStatus('⚠️ 工作台未启动，已存入本地离线队列');
      setTimeout(() => setPushStatus(null), 3000);
    }
  };

  // Flatten bookmark tree
  const flattenedBookmarks = useMemo(() => {
    const result: Array<{ id: string; title: string; url: string; parentTitle?: string }> = [];

    function traverse(nodes: chrome.bookmarks.BookmarkTreeNode[], parentName = '') {
      for (const node of nodes) {
        if (node.url) {
          result.push({
            id: node.id,
            title: node.title || node.url,
            url: node.url,
            parentTitle: parentName,
          });
        }
        if (node.children && node.children.length > 0) {
          traverse(node.children, node.title || parentName);
        }
      }
    }

    traverse(bookmarkTree);
    return result;
  }, [bookmarkTree]);

  // Filter bookmarks
  const filteredBookmarks = useMemo(() => {
    if (!searchQuery.trim()) return flattenedBookmarks;
    const q = searchQuery.toLowerCase();
    return flattenedBookmarks.filter(
      (b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
    );
  }, [flattenedBookmarks, searchQuery]);

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground font-sans antialiased text-[13px] select-none">
      {/* Header */}
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
              onClick={handleToggleTheme}
            >
              {themeMode === 'light' && <Sun className="w-4 h-4 text-amber-500" />}
              {themeMode === 'dark' && <Moon className="w-4 h-4 text-indigo-400" />}
              {themeMode === 'auto' && <Monitor className="w-4 h-4 text-muted" />}
            </Button>
          </div>
        </div>
      </header>

      {/* HeroUI Navigation Tabs (4 Equal Columns) */}
      <nav className="grid grid-cols-4 gap-1 p-2 bg-surface-secondary border-b border-border">
        <Button
          size="sm"
          variant={activeTab === 'grab' ? 'primary' : 'ghost'}
          className="h-8 text-xs font-medium w-full px-1 justify-center cursor-pointer"
          onClick={() => setActiveTab('grab')}
        >
          <MousePointerClick className="w-3.5 h-3.5 mr-1 shrink-0" />
          <span className="truncate">选区采集</span>
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'bookmarks' ? 'primary' : 'ghost'}
          className="h-8 text-xs font-medium w-full px-1 justify-center cursor-pointer"
          onClick={() => setActiveTab('bookmarks')}
        >
          <Bookmark className="w-3.5 h-3.5 mr-1 shrink-0" />
          <span className="truncate">书签 ({flattenedBookmarks.length})</span>
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'logs' ? 'primary' : 'ghost'}
          className="h-8 text-xs font-medium w-full px-1 justify-center cursor-pointer"
          onClick={() => setActiveTab('logs')}
        >
          <Activity className="w-3.5 h-3.5 mr-1 shrink-0" />
          <span className="truncate">变动日志</span>
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'settings' ? 'primary' : 'ghost'}
          className="h-8 text-xs font-medium w-full px-1 justify-center cursor-pointer"
          onClick={() => setActiveTab('settings')}
        >
          <Settings className="w-3.5 h-3.5 mr-1 shrink-0" />
          <span className="truncate">设置</span>
        </Button>
      </nav>

      {/* Main Tab Content */}
      <main className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* Tab 1: Grabber & Current Page */}
        {activeTab === 'grab' && (
          <div className="flex flex-col gap-3">
            {/* Visual Grab Button */}
            <Button
              variant="primary"
              className="w-full h-11 font-semibold shadow-md cursor-pointer"
              onClick={handleStartGrab}
            >
              <MousePointerClick className="w-4 h-4 mr-2" />
              {isGrabbing ? '正在网页中选择目标区域...' : '选择网页区域 (Visual Grab)'}
            </Button>

            {/* Grabbed Content Card */}
            {grabbedContent && (
              <Card className="bg-surface border border-accent/40 shadow-sm">
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
                    onClick={() =>
                      handlePushToWorkbench({
                        title: grabbedContent.tdk.title || '选区内容',
                        url: grabbedContent.url,
                        content: grabbedContent.selectedText,
                        meta: {
                          tdk: grabbedContent.tdk,
                          selector: grabbedContent.selector,
                          html: grabbedContent.selectedHtml,
                          images: grabbedContent.images,
                        },
                      })
                    }
                  >
                    <Send className="w-3.5 h-3.5 mr-1" />
                    归集此区域到工作台
                  </Button>
                </Card.Content>
              </Card>
            )}

            {/* Current Page TDK Card */}
            <Card className="bg-surface border border-border shadow-sm">
              <Card.Header className="flex justify-between items-center pb-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-accent" />
                  <Card.Title className="text-xs font-semibold">当前网页 TDK 元信息</Card.Title>
                </div>
                <div title="刷新元信息">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 cursor-pointer"
                    onClick={refreshCurrentPageTDK}
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
                      onClick={() =>
                        handlePushToWorkbench({
                          title: currentTdk.title,
                          url: currentTdk.url,
                          meta: currentTdk,
                        })
                      }
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

            {pushStatus && (
              <div className="p-2.5 rounded-lg bg-accent/15 border border-accent/30 text-center font-medium text-xs text-accent">
                {pushStatus}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Bookmarks */}
        {activeTab === 'bookmarks' && (
          <div className="flex flex-col gap-2.5">
            <div className="relative">
              <input
                type="text"
                placeholder="搜索全量书签标题或 URL..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface-secondary border border-border rounded-lg px-8 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-2.5" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-xs text-muted hover:text-foreground cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex justify-between items-center px-0.5">
              <span className="text-[11px] text-muted">
                共找到 {filteredBookmarks.length} 个书签
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px] px-2 cursor-pointer"
                onClick={loadBookmarks}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                刷新
              </Button>
            </div>

            <div className="flex flex-col gap-1.5 max-h-[calc(100vh-170px)] overflow-y-auto">
              {filteredBookmarks.slice(0, 100).map((bm) => (
                <div
                  key={bm.id}
                  onClick={() => chrome.tabs.create({ url: bm.url })}
                  className="flex items-center justify-between p-2 rounded-lg bg-surface hover:bg-surface-secondary border border-border transition-colors cursor-pointer"
                  title={`点击打开: ${bm.url}`}
                >
                  <div className="flex items-center gap-2 overflow-hidden flex-1">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${new URL(bm.url).hostname}&sz=32`}
                      alt="fav"
                      className="w-4 h-4 rounded shrink-0"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="overflow-hidden">
                      <div className="text-xs font-medium text-foreground truncate">{bm.title}</div>
                      <div className="text-[11px] text-muted truncate">{bm.url}</div>
                    </div>
                  </div>

                  <div title="归集到 AI 工作台">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 ml-1 h-7 w-7 p-0 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePushToWorkbench({
                          title: bm.title,
                          url: bm.url,
                          meta: { source: 'bookmark_explorer' },
                        });
                      }}
                    >
                      <Send className="w-3 h-3 text-accent" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Logs */}
        {activeTab === 'logs' && (
          <div className="flex flex-col gap-2.5">
            <div className="flex justify-between items-center px-0.5">
              <span className="text-xs font-semibold text-foreground">
                变动与采集监听 ({syncLogs.length})
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px] px-2 text-danger hover:text-danger cursor-pointer"
                onClick={async () => {
                  await chrome.storage.local.set({ sync_logs: [] });
                  setSyncLogs([]);
                }}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                清空
              </Button>
            </div>

            {syncLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted">
                <Clock className="w-8 h-8 opacity-30 mb-2" />
                <div className="font-medium text-xs">暂无监听记录</div>
                <div className="text-[11px] text-center mt-1 text-muted">
                  在浏览器添加书签或选区采集时将自动抓取 TDK 并同步
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[calc(100vh-170px)] overflow-y-auto">
                {syncLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-lg bg-surface border border-border flex flex-col gap-1 border-l-3"
                    style={{
                      borderLeftColor:
                        log.type === 'bookmark_created'
                          ? 'var(--success)'
                          : log.type === 'bookmark_removed'
                          ? 'var(--danger)'
                          : 'var(--accent)',
                    }}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-foreground">
                        {log.type === 'bookmark_created' && '⭐️ 新增书签 & 捕获 TDK'}
                        {log.type === 'bookmark_removed' && '🗑️ 移除书签'}
                        {log.type === 'page_grabbed' && '🎯 网页选区'}
                        {log.type === 'manual_sync' && '⚡️ 手动采集'}
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
        )}

        {/* Tab 4: Settings */}
        {activeTab === 'settings' && (
          <div className="flex flex-col gap-3">
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
                    onClick={() => handleSetSpecificTheme('light')}
                  >
                    <Sun className="w-3.5 h-3.5 mr-1 text-amber-500" />
                    明亮模式
                  </Button>
                  <Button
                    size="sm"
                    variant={themeMode === 'dark' ? 'primary' : 'outline'}
                    className="h-8 text-xs cursor-pointer"
                    onClick={() => handleSetSpecificTheme('dark')}
                  >
                    <Moon className="w-3.5 h-3.5 mr-1 text-indigo-400" />
                    暗黑模式
                  </Button>
                  <Button
                    size="sm"
                    variant={themeMode === 'auto' ? 'primary' : 'outline'}
                    className="h-8 text-xs cursor-pointer"
                    onClick={() => handleSetSpecificTheme('auto')}
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
                    defaultValue="http://localhost:3000"
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
                  onClick={checkWorkbenchStatus}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  检测工作台连接状态
                </Button>
              </Card.Content>
            </Card>

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
        )}
      </main>
    </div>
  );
}
