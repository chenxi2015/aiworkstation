import React, { useState } from 'react';
import { Radar, Download, Loader2, Check, Trash2, AlertCircle } from 'lucide-react';
import type { SniffedStream } from '../../../../src/types';
import { downloadHlsStream } from '../../../../src/utils/hlsDownloader';
import { CopyButton } from '../common/CopyButton';

interface SniffedStreamsCardProps {
  streams: SniffedStream[];
  onClear: () => void;
}

type DownloadState =
  | { status: 'idle' }
  | { status: 'downloading'; percent: number; phase?: 'downloading' | 'muxing' }
  | { status: 'done'; filename: string; warning?: string }
  | { status: 'error'; message: string };

/** How long the "已下载" success state shows before reverting to 下载 */
const DONE_STATE_RESET_MS = 3000;

function describeStream(url: string): { host: string; label: string } {
  try {
    const u = new URL(url);
    const fileName = u.pathname.split('/').filter(Boolean).pop() || u.pathname;
    return { host: u.hostname, label: decodeURIComponent(fileName) };
  } catch {
    return { host: '', label: url };
  }
}

function formatTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
  } catch {
    return '';
  }
}

/**
 * Card listing HLS streams sniffed on the current page with one-click
 * segment-merging download. Rendered only when at least one stream exists.
 */
export const SniffedStreamsCard: React.FC<SniffedStreamsCardProps> = ({
  streams,
  onClear,
}) => {
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({});
  const resetTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  React.useEffect(() => {
    const timers = resetTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  // Child playlists (variants / audio tracks) collapse into their master entry
  const visibleStreams = streams.filter((s) => !s.hidden);

  if (visibleStreams.length === 0) return null;

  const setStateFor = (url: string, state: DownloadState) => {
    setDownloadStates((prev) => ({ ...prev, [url]: state }));
  };

  const handleDownload = async (stream: SniffedStream) => {
    const current = downloadStates[stream.url];
    if (current?.status === 'downloading') return;

    clearTimeout(resetTimers.current[stream.url]);
    setStateFor(stream.url, { status: 'downloading', percent: 0 });
    try {
      const { filename, warning } = await downloadHlsStream(stream.url, {
        filenameBase: stream.pageTitle || describeStream(stream.url).label,
        onProgress: (p) =>
          setStateFor(stream.url, {
            status: 'downloading',
            percent: p.percent,
            phase: p.phase,
          }),
      });
      setStateFor(stream.url, { status: 'done', filename, warning });
      // Revert to the downloadable state so repeat downloads stay obvious
      resetTimers.current[stream.url] = setTimeout(() => {
        setStateFor(stream.url, { status: 'idle' });
      }, DONE_STATE_RESET_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStateFor(stream.url, { status: 'error', message });
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
        <button
          type="button"
          onClick={onClear}
          title="清空嗅探记录"
          aria-label="清空嗅探记录"
          className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Stream list */}
      <div className="flex flex-col divide-y divide-border/40 max-h-56 overflow-y-auto">
        {visibleStreams.map((stream) => {
          const state: DownloadState = downloadStates[stream.url] || { status: 'idle' };
          const { host, label } = describeStream(stream.url);

          return (
            <div key={stream.url} className="px-3 py-2 flex flex-col gap-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 px-1 py-px rounded text-[9px] font-bold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                  HLS
                </span>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[11px] text-foreground truncate" title={stream.url}>
                    {label}
                  </span>
                  <span className="text-[10px] text-muted/70 truncate">
                    {host}
                    {stream.bestResolution ? ` · 最高 ${stream.bestResolution}` : ''}
                    {stream.hasAudio ? ' · 视频+音轨' : ''}
                    {stream.detectedAt ? ` · ${formatTime(stream.detectedAt)}` : ''}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <CopyButton text={stream.url} title="复制 m3u8 地址" />
                  <button
                    type="button"
                    onClick={() => handleDownload(stream)}
                    disabled={state.status === 'downloading'}
                    title={
                      state.status === 'error'
                        ? state.message
                        : state.status === 'done'
                          ? `已下载: ${state.filename}（点击可重新下载）`
                          : '下载并合并分片'
                    }
                    className={`h-6 px-2 rounded-md flex items-center gap-1 text-[10px] font-medium transition-all cursor-pointer disabled:cursor-wait ${
                      state.status === 'done'
                        ? 'bg-success/10 text-success border border-success/20'
                        : state.status === 'error'
                          ? 'bg-danger/10 text-danger border border-danger/20'
                          : 'bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20'
                    }`}
                  >
                    {state.status === 'downloading' ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{state.phase === 'muxing' ? '合并中' : `${state.percent}%`}</span>
                      </>
                    ) : state.status === 'done' ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>已下载</span>
                      </>
                    ) : state.status === 'error' ? (
                      <>
                        <AlertCircle className="w-3 h-3" />
                        <span>重试</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3 h-3" />
                        <span>下载</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              {state.status === 'downloading' && (
                <div className="w-full bg-surface-tertiary h-1 rounded-full overflow-hidden border border-border/50">
                  <div
                    className="bg-violet-500 h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${Math.max(4, state.percent)}%` }}
                  />
                </div>
              )}

              {state.status === 'done' && state.warning && (
                <div className="text-[10px] text-amber-600 dark:text-amber-400 truncate" title={state.warning}>
                  {state.warning}
                </div>
              )}

              {state.status === 'error' && (
                <div className="text-[10px] text-danger/80 truncate" title={state.message}>
                  {state.message}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-3 py-1.5 border-t border-border/50 text-[10px] text-muted/60">
        自动选最高清晰度；音轨分离的视频经 ffmpeg 合并输出 MP4
      </div>
    </div>
  );
};
