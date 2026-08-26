export type ThemeMode = 'light' | 'dark' | 'auto';

/**
 * Apply theme mode to documentElement
 */
export function applyThemeMode(mode: ThemeMode): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode;

  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(resolved);

  if (mode === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', mode);
  }

  document.documentElement.style.colorScheme = resolved;
}

/**
 * Load saved theme mode from storage
 */
export async function getSavedThemeMode(): Promise<ThemeMode> {
  try {
    const res = await chrome.storage?.local?.get('app_theme');
    if (res?.app_theme === 'light' || res?.app_theme === 'dark' || res?.app_theme === 'auto') {
      return res.app_theme;
    }
  } catch {
    // Fallback to localStorage
  }

  const local = localStorage.getItem('app_theme');
  if (local === 'light' || local === 'dark' || local === 'auto') {
    return local;
  }

  return 'dark'; // Default to dark mode or auto
}

/**
 * Save theme mode to storage
 */
export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  applyThemeMode(mode);
  try {
    await chrome.storage?.local?.set({ app_theme: mode });
  } catch {
    // Fallback
  }
  localStorage.setItem('app_theme', mode);
}
