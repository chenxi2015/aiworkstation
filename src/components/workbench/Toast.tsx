
export interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  if (!message) return null;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[300] pointer-events-none transition-all duration-300 ease-out animate-in fade-in slide-in-from-bottom-3">
      <div className="rounded-full bg-[var(--foreground,oklch(0.21_0.006_285.89))] text-[var(--surface,oklch(1_0_0))] px-5 py-2.5 text-xs font-medium shadow-2xl tracking-wide flex items-center gap-2 border border-[var(--border,oklch(0.9_0.004_286.32))]">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent,oklch(0.62_0.195_253.83))]" />
        {message}
      </div>
    </div>
  );
}
