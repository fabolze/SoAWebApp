import React, { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { BUTTON_CLASSES, BUTTON_SIZES } from '../styles/uiTokens';

const THEME_KEY = 'soa.theme';

const getInitialTheme = () => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(THEME_KEY) || localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  }
  return 'light';
};

interface DarkModeToggleProps {
  compact?: boolean;
}

const DarkModeToggle: React.FC<DarkModeToggleProps> = ({ compact = false }) => {
  const [theme, setTheme] = useState(getInitialTheme());

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'corporate');
    }
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return (
    <button
      className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm} gap-2 whitespace-nowrap ${compact ? "w-10 px-0" : ""}`}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle dark mode"
    >
      {theme === 'dark' ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
      {!compact && (theme === 'dark' ? 'Dark' : 'Light')}
    </button>
  );
};

export default DarkModeToggle;
