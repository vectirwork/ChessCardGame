// Stockage local tolérant : navigation privée, quota plein ou stockage bloqué ne cassent jamais une page.
import { useCallback, useEffect, useState } from 'react';

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const v = JSON.parse(raw) as T;
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // stockage indisponible : la progression ne sera simplement pas conservée
  }
  // Prévient les autres composants de la page (l'événement « storage » ne concerne que les autres onglets).
  try {
    window.dispatchEvent(new CustomEvent('sm:stored', { detail: key }));
  } catch {
    // ignoré
  }
}

/** Valeur JSON conservée dans le navigateur, partagée entre les composants qui lisent la même clé. */
export function useStored<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [v, setV] = useState<T>(() => readJson(key, initial));
  useEffect(() => {
    const sync = (e: Event) => {
      const k = e instanceof StorageEvent ? e.key : (e as CustomEvent<string>).detail;
      if (k === key) setV(readJson(key, initial));
    };
    window.addEventListener('storage', sync);
    window.addEventListener('sm:stored', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('sm:stored', sync);
    };
    // `initial` est une valeur par défaut : seule la clé compte.
  }, [key]);
  const set = useCallback((x: T | ((prev: T) => T)) => {
    const next = typeof x === 'function' ? (x as (p: T) => T)(readJson(key, initial)) : x;
    setV(next);
    writeJson(key, next);
  }, [key]);
  return [v, set];
}

/** Clé de date locale « AAAA-MM-JJ ». */
export function dayKey(d: Date = new Date()): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
