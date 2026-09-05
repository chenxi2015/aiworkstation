import React, { useState, useEffect } from 'react';
import {
  Radar,
  Download,
  Loader2,
  Check,
  Trash2,
  AlertCircle,
  Pause,
  Play,
  X,
  Zap,
  FolderOpen,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import type { SniffedStream } from '../../../../src/types';
import { hlsDownloadManager, type HlsTaskState } from '../../../../src/utils/hlsDownloadManager';
import { WorkbenchService, type ServerVideoTaskState } from '../../../../src/services/workbench';
import { CopyButton } from '../common/CopyButton';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface SniffedStreamsCardProps {
  streams: SniffedStream[];
  onClear: () => void;
  onRescan?: () => void;
  isRescanning?: boolean;
}

function describeStream(
  stream: SniffedStream,
  serverTask?: ServerVideoTaskState,
  clientTask?: HlsTaskState,
): { title: string; host: string; rawFileName: string } {
  let host = '';
  let rawFileName = 'index.m3u8';
  let pathToken = '';

  try {
    const u = new URL(stream.url);
    host = u.hostname;
    const parts = u.pathname.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      rawFileName = decodeURIComponent(lastPart);
      const prevPart = parts[parts.length - 2];
      if (prevPart) {
        pathToken = decodeURIComponent(prevPart);
      }
    }
  } catch {
    // Keep defaults
  }

  // Find most descriptive, human-readable video title
  const candidate =
    serverTask?.pageTitle?.trim() ||
    stream.pageTitle?.trim() ||
    serverTask?.filename?.replace(/\.mp4$/i, '').trim() ||
    clientTask?.filename?.replace(/\.mp4$/i, '').trim();

  let title = candidate || '';
  if (!title || title.toLowerCase() === 'video' || title.toLowerCase() === 'untitled') {
    title = pathToken ? `${pathToken} · ${rawFileName}` : rawFileName;
  }

  return { title, host, rawFileName };
}

/**
 * Card listing HLS streams sniffed on the current page or persisting from
 * ongoing/paused downloads. Supports dual-engine: Native local Node+FFmpeg
 * (unlimited size) or Client-side fallback.
 */
export const SniffedStreamsCard: React.FC<SniffedStreamsCardProps> = ({
  streams,
  onClear,
  onRescan,
  isRescanning = false,
}) => {
  const [downloadStates, setDownloadStates] = useState<Record<string, HlsTaskState>>(() =>
    hlsDownloadManager.getAllStates(),
  );
  const [isWorkbenchOnline, setIsWorkbenchOnline] = useState(false);
  const [serverTasks, setServerTasks] = useState<Record<string, ServerVideoTaskState>>({});
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = hlsDownloadManager.subscribe(() => {
      setDownloadStates(hlsDownloadManager.getAllStates());
    });
    return unsubscribe;
  }, []);

  // Poll local workstation health and video tasks
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    const syncServer = async () => {
      const online = await WorkbenchService.checkHealth();
      setIsWorkbenchOnline(online);
      if (online) {
        const tasks = await WorkbenchService.getVideoTasks();
        const map: Record<string, ServerVideoTaskState> = {};
        for (const t of tasks) {
          const current = map[t.url];
          if (!current) {
            map[t.url] = t;
            continue;
          }
          const isActive = t.status === 'downloading' || t.status === 'muxing' || t.status === 'pending';
          const isCurrentActive = current.status === 'downloading' || current.status === 'muxing' || current.status === 'pending';
          if (isActive && !isCurrentActive) {
            map[t.url] = t;
          } else if (isActive === isCurrentActive && t.createdAt > current.createdAt) {
            map[t.url] = t;
          }
        }
        setServerTasks(map);
      }
    };

    syncServer();
    timer = setInterval(syncServer, 2000);
    return () => clearInterval(timer);
  }, []);

  // Child playlists collapse into their master entry
  const visibleStreams = streams.filter((s) => !s.hidden);

  if (visibleStreams.length === 0) return null;

  const handleStart = async (stream: SniffedStream, force = false) => {
    if (isWorkbenchOnline) {
      const { title, rawFileName } = describeStream(stream, serverTasks[stream.url], downloadStates[stream.url]);
      const res = await WorkbenchService.submitVideoTask({
        url: stream.url,
        pageTitle: title || stream.pageTitle || rawFileName,
        pageUrl: stream.pageUrl,
        force,
      });
      if (res.success && res.task) {
        setServerTasks((prev) => ({ ...prev, [stream.url]: res.task! }));
        return;
      }
    }
    hlsDownloadManager.start(stream);
  };

  const handleCancel = async (streamUrl: string) => {
    const sTask = serverTasks[streamUrl];
    if (sTask && (sTask.status === 'downloading' || sTask.status === 'pending')) {
      await WorkbenchService.cancelVideoTask(sTask.id);
      setServerTasks((prev) => ({
        ...prev,
        [streamUrl]: { ...sTask, status: 'cancelled' },
      }));
    }
    hlsDownloadManager.cancel(streamUrl);
  };

  const handleView = async (stream: SniffedStream) => {
    const serverTask = serverTasks[stream.url];
    const clientTask = downloadStates[stream.url];
    const filename = serverTask?.filename || clientTask?.filename;
    const outputPath = serverTask?.outputPath;

    if (isWorkbenchOnline) {
      const ok = await WorkbenchService.revealVideoTaskFile({
        id: serverTask?.id,
        filename,
        outputPath,
      });
      if (ok) return;
    }

    // Fallback: open chrome downloads page
    try {
      chrome.tabs.create({ url: 'chrome://downloads' });
    } catch {
      window.open('chrome://downloads', '_blank');
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-surface dark:bg-surface-secondary shadow-xs overflow-hidden animate-in fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-1.5 min-w-0 text-[11px] font-semibold text-muted">
          <Radar className="w-3.5 h-3.5 text-violet-500 shrink-0" />
          <span className="truncate">嗅探到视频流 ({visibleStreams.length})</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onRescan && (
            <button
              type="button"
              onClick={onRescan}
              disabled={isRescanning}
              title="重新扫描页面视频流（无需刷新网页）"
              aria-label="重新扫描页面视频流"
              className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted hover:text-violet-600 hover:bg-violet-500/10 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin text-violet-500' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsClearConfirmOpen(true)}
            title="清空嗅探记录"
            aria-label="清空嗅探记录"
            className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stream list */}
      <div className="flex flex-col divide-y divide-border/40 max-h-64 overflow-y-auto">
        {visibleStreams.map((stream) => {
          const clientTask = downloadStates[stream.url];
          const serverTask = serverTasks[stream.url];

          const isServerActive =
            serverTask &&
            (serverTask.status === 'downloading' ||
              serverTask.status === 'pending' ||
              serverTask.status === 'muxing');
          const isClientActive = clientTask && clientTask.status !== 'idle';
          const useServer = isServerActive || (!isClientActive && isWorkbenchOnline);

          const rawServerStatus = serverTask?.status;
          const normalizedServerStatus = rawServerStatus === 'cancelled' ? 'idle' : (rawServerStatus ?? 'idle');
          const status = useServer ? normalizedServerStatus : (clientTask?.status ?? 'idle');
          const percent = useServer ? (serverTask?.percent ?? 0) : (clientTask?.percent ?? 0);
          const doneSlices = useServer ? (serverTask?.doneSegments ?? 0) : (clientTask?.done ?? 0);
          const totalSlices = useServer ? (serverTask?.totalSegments ?? 0) : (clientTask?.total ?? 0);
          const phase = useServer ? serverTask?.phase : clientTask?.phase;
          const error = useServer ? serverTask?.error : clientTask?.error;
          const filename = useServer ? serverTask?.filename : clientTask?.filename;
          const warning = clientTask?.warning;

          const { title: displayTitle, host, rawFileName } = describeStream(stream, serverTask, clientTask);

          return (
            <div key={stream.url} className="px-3 py-2 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 px-1 py-px rounded text-[9px] font-bold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                  HLS
                </span>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <span
                      className="text-[11px] font-medium text-foreground truncate"
                      title={`${displayTitle}\n${stream.url}`}
                    >
                      {displayTitle}
                    </span>
                    {status === 'paused' && (
                      <span className="shrink-0 text-[9px] px-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium">
                        已暂停
                      </span>
                    )}
                    {(status === 'downloading' || status === 'pending') && (
                      <span className="shrink-0 text-[9px] px-1 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 font-medium">
                        {percent}%
                      </span>
                    )}
                    {status === 'muxing' && (
                      <span className="shrink-0 text-[9px] px-1 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 font-medium">
                        {useServer ? '合成中' : '合成 MP4'}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted/70 truncate flex items-center gap-1.5">
                    <span className="truncate">{host}</span>
                    {stream.bestResolution && (
                      <>
                        <span className="opacity-40">·</span>
                        <span className="shrink-0">{stream.bestResolution}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <CopyButton text={stream.url} title="复制 m3u8 地址" />

                  {/* Actions depending on state */}
                  {status === 'downloading' || status === 'pending' ? (
                    <div className="flex items-center gap-1">
                      {/* Cancel button */}
                      <button
                        type="button"
                        onClick={() => handleCancel(stream.url)}
                        title={totalSlices ? `取消下载 (${doneSlices}/${totalSlices})` : '取消下载'}
                        className="h-6 px-1.5 rounded-md flex items-center gap-1 text-[10px] font-medium text-muted hover:text-danger hover:bg-danger/10 border border-border/50 transition-colors cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                        <span>取消</span>
                      </button>
                    </div>
                  ) : status === 'paused' ? (
                    <div className="flex items-center gap-1">
                      {/* Resume button */}
                      <button
                        type="button"
                        onClick={() => hlsDownloadManager.resume(stream.url)}
                        title="点击继续下载"
                        className="h-6 px-2 rounded-md flex items-center gap-1 text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all cursor-pointer"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>继续 {percent}%</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancel(stream.url)}
                        title="取消并放弃"
                        className="h-6 w-6 rounded-md flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 border border-border/50 transition-colors cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : status === 'muxing' ? (
                    <div className="h-6 px-2 rounded-md flex items-center gap-1 text-[10px] font-medium bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>{useServer ? '原生合成...' : '合成 MP4...'}</span>
                    </div>
                  ) : status === 'done' ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleView(stream)}
                        title={filename ? `在访达/文件夹中查看: ${filename}` : '查看已下载文件'}
                        className="h-6 px-2 rounded-md flex items-center gap-1 text-[10px] font-medium bg-success/10 text-success border border-success/20 transition-all cursor-pointer hover:bg-success/20"
                      >
                        <FolderOpen className="w-3 h-3" />
                        <span>查看</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStart(stream, true)}
                        title="重新下载"
                        aria-label="重新下载"
                        className="h-6 w-6 rounded-md flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-tertiary border border-border/50 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    </div>
                  ) : status === 'error' ? (
                    <button
                      type="button"
                      onClick={() => handleStart(stream)}
                      title={error || '下载失败，点击重试'}
                      className="h-6 px-2 rounded-md flex items-center gap-1 text-[10px] font-medium bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 transition-all cursor-pointer"
                    >
                      <AlertCircle className="w-3 h-3" />
                      <span>重试</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStart(stream)}
                      title={isWorkbenchOnline ? '使用本地原生引擎极速下载（自动秒转MP4，无大小限制）' : '浏览器内置引擎下载并合并分片'}
                      className="h-6 px-2 rounded-md flex items-center gap-1 text-[10px] font-medium bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-all cursor-pointer"
                    >
                      {isWorkbenchOnline ? <Zap className="w-3 h-3 fill-current" /> : <Download className="w-3 h-3" />}
                      <span>{isWorkbenchOnline ? '极速下载' : '下载'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {(status === 'downloading' || status === 'paused' || status === 'pending') && (
                <div className="w-full bg-surface-tertiary h-1.5 rounded-full overflow-hidden border border-border/50">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${
                      status === 'paused' ? 'bg-amber-500' : 'bg-violet-500'
                    }`}
                    style={{ width: `${Math.max(4, percent)}%` }}
                  />
                </div>
              )}

              {status === 'done' && warning && (
                <div className="text-[10px] text-amber-600 dark:text-amber-400 truncate" title={warning}>
                  {warning}
                </div>
              )}

              {status === 'error' && error && (
                <div className="text-[10px] text-danger/80 truncate" title={error}>
                  {error}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-3 py-1.5 border-t border-border/50 text-[10px] text-muted/70 flex items-center justify-between">
        <div
          className="flex items-center gap-1.5"
          title={
            isWorkbenchOnline
              ? '本地工作台在线，支持后台极速并发下载与转码，视频将自动存入电脑 Downloads 目录'
              : '工作台未连接，当前使用浏览器内置引擎下载'
          }
        >
          {isWorkbenchOnline ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-foreground/80 font-medium">已连接工作台 · 下载直存电脑</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>未连接工作台 · 使用浏览器下载</span>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={isClearConfirmOpen}
        onOpenChange={setIsClearConfirmOpen}
        title="清空嗅探到的视频流"
        description="确定要清空当前网页嗅探到的所有视频流记录吗？清空后若需重新获取，请刷新网页。"
        confirmLabel="清空"
        cancelLabel="取消"
        danger={true}
        onConfirm={onClear}
      />
    </div>
  );
};
