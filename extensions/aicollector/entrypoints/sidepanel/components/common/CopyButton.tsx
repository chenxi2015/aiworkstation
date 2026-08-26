import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  text: string;
  htmlContent?: string;
  label?: string;
  title?: string;
  className?: string;
}

/**
 * Fallback clipboard copy using a hidden textarea for guaranteed reliability
 */
function fallbackCopyText(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch {
    return false;
  }
}

/**
 * Reusable copy to clipboard button with animated success feedback
 * Supports dual-format (rich text/html + plain text) copying
 */
export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  htmlContent,
  label,
  title = '复制',
  className = '',
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const plainText = text || htmlContent || '';
    if (!plainText) return;

    let success = false;

    // 1. Try modern dual-MIME clipboard write if html is provided
    if (htmlContent && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      try {
        const textBlob = new Blob([plainText], { type: 'text/plain' });
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': textBlob,
            'text/html': htmlBlob,
          }),
        ]);
        success = true;
      } catch (err) {
        console.warn('ClipboardItem write failed, falling back to writeText:', err);
      }
    }

    // 2. Fallback to standard clipboard.writeText
    if (!success && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(plainText);
        success = true;
      } catch (err) {
        console.warn('writeText failed, falling back to execCommand:', err);
      }
    }

    // 3. Fallback to legacy execCommand
    if (!success) {
      success = fallbackCopyText(plainText);
    }

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? '已复制' : title}
      className={`inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent transition-colors cursor-pointer ${className}`}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-success" />
          <span className="text-success text-[10px]">已复制</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          {label && <span>{label}</span>}
        </>
      )}
    </button>
  );
};
