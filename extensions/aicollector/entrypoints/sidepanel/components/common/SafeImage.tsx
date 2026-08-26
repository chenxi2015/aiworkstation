import React, { useState, useEffect } from 'react';
import { ImageOff } from 'lucide-react';

export interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  pageUrl?: string;
  fallbackClassName?: string;
}

/**
 * Clean and robust auto-healing image component.
 * Strategy:
 * 1. Direct load with no-referrer
 * 2. Auto-retry via local Background Service Worker with dynamic website Referer
 * 3. Graceful fallback UI
 */
export const SafeImage: React.FC<SafeImageProps> = ({
  src,
  pageUrl,
  alt = 'image',
  className = '',
  fallbackClassName = '',
  onError,
  ...restProps
}) => {
  const [hasFailed, setHasFailed] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string>(src || '');

  useEffect(() => {
    setHasFailed(false);
    setIsRetrying(false);
    setCurrentSrc(src || '');
  }, [src]);

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) {
      setHasFailed(true);
      if (onError) onError(e);
      return;
    }

    // Attempt local background fetch with dynamic page referer
    if (!isRetrying) {
      setIsRetrying(true);
      try {
        chrome.runtime.sendMessage(
          {
            type: 'FETCH_IMAGE_DATA',
            url: src,
            pageUrl,
          },
          (response) => {
            if (response?.success && response.dataUrl) {
              setCurrentSrc(response.dataUrl);
            } else {
              setHasFailed(true);
              if (onError) onError(e);
            }
          },
        );
      } catch {
        setHasFailed(true);
        if (onError) onError(e);
      }
    } else {
      setHasFailed(true);
      if (onError) onError(e);
    }
  };

  if (hasFailed || !currentSrc) {
    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center p-1 text-muted text-[10px] gap-0.5 text-center bg-surface-tertiary ${fallbackClassName}`}
      >
        <ImageOff className="w-4 h-4 text-muted/60" />
        <span className="truncate max-w-full scale-90">无法加载</span>
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={handleError}
      className={className}
      {...restProps}
    />
  );
};
