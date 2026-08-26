import { useState, useEffect, useCallback } from 'react';
import {
  type ThemeMode,
  applyThemeMode,
  getSavedThemeMode,
  saveThemeMode,
} from '../../../src/utils/theme';

/**
 * Hook for managing app color theme mode (light, dark, auto)
 */
export function useTheme() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');

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

  const toggleTheme = useCallback(() => {
    const nextMode: ThemeMode =
      themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'auto' : 'light';
    setThemeMode(nextMode);
    saveThemeMode(nextMode);
  }, [themeMode]);

  const setSpecificTheme = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
    saveThemeMode(mode);
  }, []);

  return {
    themeMode,
    toggleTheme,
    setSpecificTheme,
  };
}
