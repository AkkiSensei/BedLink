import { create } from 'zustand';

interface SettingsState {
  isDark: boolean;
  highContrast: boolean;
  largeText: boolean;
  soundEnabled: boolean;
  toggleTheme: () => void;
  toggleHighContrast: () => void;
  toggleLargeText: () => void;
  toggleSound: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => {
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const themeParam = urlParams?.get('theme');
  const storedTheme = typeof window !== 'undefined' ? localStorage.getItem('bedlink_theme') : null;
  const initialDark = themeParam ? themeParam === 'dark' : storedTheme === 'dark';
  
  const storedHighContrast = typeof window !== 'undefined' ? localStorage.getItem('bedlink_high_contrast') === 'true' : false;
  const storedLargeText = typeof window !== 'undefined' ? localStorage.getItem('bedlink_large_text') === 'true' : false;
  const storedSound = typeof window !== 'undefined' ? localStorage.getItem('bedlink_sound') !== 'false' : true;

  if (typeof document !== 'undefined') {
    if (initialDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    if (storedHighContrast) document.documentElement.classList.add('high-contrast');
    if (storedLargeText) document.documentElement.classList.add('large-text');
  }

  return {
    isDark: initialDark,
    highContrast: storedHighContrast,
    largeText: storedLargeText,
    soundEnabled: storedSound,

    toggleTheme: () => set((state) => {
      const nextDark = !state.isDark;
      if (typeof document !== 'undefined') {
        if (nextDark) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('bedlink_theme', nextDark ? 'dark' : 'light');
      return { isDark: nextDark };
    }),

    toggleHighContrast: () => set((state) => {
      const next = !state.highContrast;
      if (typeof document !== 'undefined') {
        if (next) document.documentElement.classList.add('high-contrast');
        else document.documentElement.classList.remove('high-contrast');
      }
      localStorage.setItem('bedlink_high_contrast', String(next));
      return { highContrast: next };
    }),

    toggleLargeText: () => set((state) => {
      const next = !state.largeText;
      if (typeof document !== 'undefined') {
        if (next) document.documentElement.classList.add('large-text');
        else document.documentElement.classList.remove('large-text');
      }
      localStorage.setItem('bedlink_large_text', String(next));
      return { largeText: next };
    }),

    toggleSound: () => set((state) => {
      const next = !state.soundEnabled;
      localStorage.setItem('bedlink_sound', String(next));
      return { soundEnabled: next };
    }),
  };
});
