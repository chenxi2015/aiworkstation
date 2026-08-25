import { EditIcon, FolderIcon, ItemIcon } from './Icons';
import type { Folder } from './types';
import { ITEM_TYPES } from './types';

const EMPTY_SLOT_KEYS = [
  'slot-1',
  'slot-2',
  'slot-3',
  'slot-4',
  'slot-5',
  'slot-6',
  'slot-7',
  'slot-8',
  'slot-9',
];

interface FolderDetailPanelProps {
  folder: Folder | null;
  onEdit: (folder: Folder) => void;
}

export function FolderDetailPanel({ folder, onEdit }: FolderDetailPanelProps) {
  if (!folder) {
    return (
      <aside className="w-[360px] shrink-0 bg-[var(--surface,oklch(1_0_0))] border-l border-[var(--border,oklch(0.9_0.004_286.32))] p-7 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-[var(--surface-secondary,oklch(0.96_0.001_286.37))] flex items-center justify-center text-[var(--muted-foreground,oklch(0.55_0.014_285.94))] mb-4 opacity-40">
          <FolderIcon className="w-8 h-8" />
        </div>
        <h3 className="text-sm font-semibold text-[var(--foreground,oklch(0.21_0.006_285.89))] mb-1.5">
          选择一个文件夹
        </h3>
        <p className="text-xs text-[var(--muted-foreground,oklch(0.55_0.014_285.94))] leading-relaxed max-w-[220px]">
          点击左侧任意文件夹卡片
          <br />
          查看其中归集的工具与内容
        </p>
      </aside>
    );
  }

  // Calculate 9-grid preview items
  const maxPreview = 9;
  const hasMore = folder.items.length > maxPreview;
  const previewItems = hasMore
    ? folder.items.slice(0, maxPreview - 1)
    : folder.items.slice(0, maxPreview);
  const remainingCount = folder.items.length - (maxPreview - 1);

  // Fill up empty slots to keep a tidy 3x3 layout when items are 1-8
  const emptySlotsCount = Math.max(
    0,
    9 - (previewItems.length + (hasMore ? 1 : 0))
  );

  return (
    <aside className="w-[360px] shrink-0 bg-[var(--surface,oklch(1_0_0))] border-l border-[var(--border,oklch(0.9_0.004_286.32))] p-7 flex flex-col overflow-y-auto max-h-[calc(100vh-60px)] sticky top-[60px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <h2 className="text-xl font-bold text-[var(--foreground,oklch(0.21_0.006_285.89))] tracking-tight leading-snug break-all">
          {folder.name}
        </h2>
        <button
          type="button"
          onClick={() => onEdit(folder)}
          title="编辑文件夹"
          className="shrink-0 w-8 h-8 rounded-full border border-[var(--border,oklch(0.9_0.004_286.32))] bg-[var(--surface,oklch(1_0_0))] text-[var(--muted-foreground,oklch(0.55_0.014_285.94))] hover:text-[var(--accent,oklch(0.62_0.195_253.83))] hover:bg-[var(--surface-secondary,oklch(0.96_0.001_286.37))] hover:border-[var(--border-secondary,oklch(0.8_0.004_286.32))] flex items-center justify-center transition-all cursor-pointer"
        >
          <EditIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Creation Time */}
      <div className="mb-5">
        <div className="text-[11px] font-semibold tracking-wider text-[var(--muted-foreground,oklch(0.55_0.014_285.94))] uppercase mb-1.5">
          创建时间
        </div>
        <div className="text-xs text-[var(--foreground,oklch(0.21_0.006_285.89))] font-medium tabular-nums">
          {folder.createdAt}
        </div>
      </div>

      {/* Description */}
      <div className="mb-5">
        <div className="text-[11px] font-semibold tracking-wider text-[var(--muted-foreground,oklch(0.55_0.014_285.94))] uppercase mb-1.5">
          描述
        </div>
        <div className="text-xs text-[var(--foreground,oklch(0.21_0.006_285.89))] leading-relaxed">
          {folder.desc || (
            <span className="text-[var(--muted-foreground,oklch(0.55_0.014_285.94))]">
              暂无描述
            </span>
          )}
        </div>
      </div>

      <hr className="my-5 border-[var(--border,oklch(0.9_0.004_286.32))]" />

      {/* 9-Grid Preview */}
      <div className="mb-6">
        <div className="text-[11px] font-semibold tracking-wider text-[var(--muted-foreground,oklch(0.55_0.014_285.94))] uppercase mb-3">
          内容预览（{folder.items.length} 项）
        </div>

        {folder.items.length === 0 ? (
          <div className="text-xs text-[var(--muted-foreground,oklch(0.55_0.014_285.94))] py-4 text-center rounded-xl bg-[var(--surface-secondary,oklch(0.96_0.001_286.37))]">
            暂无内容
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {previewItems.map((item, index) => (
              <div
                key={item.id || `${item.name}-${index}`}
                title={item.name}
                className="group aspect-square rounded-xl bg-[var(--surface-secondary,oklch(0.96_0.001_286.37))] hover:bg-[var(--accent-soft,rgba(99,102,241,0.15))] hover:scale-[1.03] transition-all flex flex-col items-center justify-center p-1.5 cursor-pointer text-center"
              >
                <ItemIcon
                  type={item.type}
                  className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity"
                />
                <span className="text-[10px] text-[var(--muted-foreground,oklch(0.55_0.014_285.94))] group-hover:text-[var(--accent,oklch(0.62_0.195_253.83))] mt-1 line-clamp-1 truncate w-full px-1">
                  {item.name}
                </span>
              </div>
            ))}

            {hasMore && (
              <div className="aspect-square rounded-xl bg-[var(--surface-tertiary,oklch(0.93_0.001_286.37))] hover:bg-[var(--accent-soft,rgba(99,102,241,0.15))] hover:text-[var(--accent,oklch(0.62_0.195_253.83))] transition-all flex items-center justify-center text-xs font-bold text-[var(--foreground,oklch(0.21_0.006_285.89))] cursor-pointer">
                +{remainingCount}
              </div>
            )}

            {EMPTY_SLOT_KEYS.slice(0, emptySlotsCount).map((slotKey) => (
              <div
                key={slotKey}
                className="aspect-square rounded-xl border border-dashed border-[var(--border,oklch(0.9_0.004_286.32))] opacity-30"
              />
            ))}
          </div>
        )}
      </div>

      {/* Item List */}
      <div>
        <div className="text-[11px] font-semibold tracking-wider text-[var(--muted-foreground,oklch(0.55_0.014_285.94))] uppercase mb-2.5">
          包含内容
        </div>

        {folder.items.length === 0 ? (
          <div className="text-xs text-[var(--muted-foreground,oklch(0.55_0.014_285.94))] py-3 text-center">
            暂无归集内容
          </div>
        ) : (
          <div className="space-y-1">
            {folder.items.map((item, index) => {
              const typeInfo = ITEM_TYPES[item.type] || {
                label: '其他',
                color: 'currentColor',
              };
              return (
                <div
                  key={item.id || `${item.name}-${index}`}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--surface-secondary,oklch(0.96_0.001_286.37))] transition-colors cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft,rgba(99,102,241,0.12))] flex items-center justify-center shrink-0">
                    <ItemIcon type={item.type} className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-[var(--foreground,oklch(0.21_0.006_285.89))] truncate group-hover:text-[var(--accent,oklch(0.62_0.195_253.83))] transition-colors">
                      {item.name}
                    </div>
                    <div className="text-[10px] text-[var(--muted-foreground,oklch(0.55_0.014_285.94))] font-medium mt-0.5">
                      {typeInfo.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
