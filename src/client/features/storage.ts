// Stockage local tolérant : navigation privée, quota plein ou stockage bloqué ne cassent jamais une page.
// Les clés sont celles de KEYS (storageKeys.ts), rangé dans le même morceau que ce module (il en lit STORED_EVENT).
import { useCallback, useEffect, useState } from 'react';
import { STORED_EVENT } from '../storageKeys';

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
    window.dispatchEvent(new CustomEvent(STORED_EVENT, { detail: key }));
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
    window.addEventListener(STORED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(STORED_EVENT, sync);
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

/**
 * Préférence locale (rois classiques, moteur d'analyse…) : useStored sur une clé de KEYS (src/client/storageKeys.ts,
 * valeurs inchangées), partagée entre les composants et les onglets. Exemple : usePref(KEYS.classicKings, false).
 * (Remplace l'ancien usePref de store.tsx, retiré du paquet principal : même valeur stockée, sous la même clé.)
 */
export function usePref<T>(key: string, initial: T): [T, (v: T) => void] {
  return useStored<T>(key, initial);
}

/** Clé de date locale « AAAA-MM-JJ ». */
export function dayKey(d: Date = new Date()): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
