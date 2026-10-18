/**
 * DensityProvider — user-selectable UI density: dense (default) / medium / large.
 * Sets `data-density` on <html>; every size token in index.css reacts to it.
 * Mirrors ThemeProvider (light/dark) — same persistence pattern.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Density = 'dense' | 'medium' | 'large';

interface DensityContextValue {
  density: Density;
  setDensity: (d: Density) => void;
}

const STORAGE_KEY = 'app_density';

function readInitial(): Density {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'dense' || v === 'medium' || v === 'large') return v;
  } catch {
    /* storage unavailable */
  }
  return 'dense';
}

const DensityContext = createContext<DensityContextValue>({ density: 'dense', setDensity: () => {} });

export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<Density>(readInitial);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    try {
      localStorage.setItem(STORAGE_KEY, density);
    } catch {
      /* storage unavailable */
    }
  }, [density]);

  const setDensity = useCallback((d: Density) => setDensityState(d), []);

  return <DensityContext.Provider value={{ density, setDensity }}>{children}</DensityContext.Provider>;
}

export function useDensity(): DensityContextValue {
  return useContext(DensityContext);
}

export const DENSITY_OPTIONS: { value: Density; label: string; hint: string }[] = [
  { value: 'dense', label: 'Dense', hint: 'Maximum information per screen' },
  { value: 'medium', label: 'Medium', hint: 'Balanced spacing' },
  { value: 'large', label: 'Large', hint: 'High readability / accessibility' },
];
