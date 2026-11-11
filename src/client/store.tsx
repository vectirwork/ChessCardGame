// État global : utilisateur connecté, notifications, préférences.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { MeResponse, MeUser } from '../shared/protocol';
import { api } from './api';
import { resetSocket } from './socket';
// Importé après api et socket, à garder ici : plus haut, l'ordre d'exécution change et Vite fond le morceau api-*.js
// dans le paquet principal (index.html perd une ligne modulepreload ; vérifié au build).
import { FEATURES, mergeFeatures } from '../shared/config/features';
import type { FeatureKey, Features } from '../shared/config/features';

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

interface AppState {
  me: MeUser | null;
  ready: boolean;
  payments: MeResponse['payments'];
  /** Interrupteurs du site (useFeature). */
  features: Readonly<Features>;
  setMe: (u: MeUser | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  toast: (text: string, kind?: Toast['kind']) => void;
}

const Ctx = createContext<AppState>(null as unknown as AppState);

/**
 * Interrupteurs posés par le serveur dans la page (<meta name="sm-features" content='{"shop":false}'>), présents
 * seulement si l'un diffère des défauts : lus une fois, au montage, sans attendre /api/me (aucun clignotement).
 */
function featuresFromPage(): Readonly<Features> {
  if (typeof document === 'undefined') return FEATURES;
  const content = document.querySelector('meta[name="sm-features"]')?.getAttribute('content');
  if (!content) return FEATURES;
  try {
    return mergeFeatures(FEATURES, JSON.parse(content));
  } catch {
    return FEATURES;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<MeUser | null>(null);
  const [ready, setReady] = useState(false);
  const [payments, setPayments] = useState<MeResponse['payments']>('off');
  const [features, setFeatures] = useState<Readonly<Features>>(featuresFromPage);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const refresh = useCallback(async () => {
    try {
      const r = await api<MeResponse>('/me');
      setMeState(r.user);
      setPayments(r.payments);
      // Même objet si rien ne change (mergeFeatures) : aucun rendu de plus au défaut.
      if (r.features) setFeatures(f => mergeFeatures(f, r.features));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setMe = useCallback((u: MeUser | null) => {
    setMeState(prev => {
      if ((prev?.id ?? null) !== (u?.id ?? null)) resetSocket();
      return u;
    });
  }, []);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', body: {} });
    setMe(null);
    toast('À bientôt !');
  }, [setMe, toast]);

  const value = useMemo(
    () => ({ me, ready, payments, features, setMe, refresh, logout, toast }),
    [me, ready, payments, features, setMe, refresh, logout, toast],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useApp = () => useContext(Ctx);

/**
 * Une fonction du site est-elle ouverte ? D'abord la meta sm-features de la page, puis /api/me ; à défaut, FEATURES
 * (src/shared/config/features.ts).
 */
export function useFeature(k: FeatureKey): boolean {
  return useContext(Ctx).features[k];
}

/** Préférence locale (son, animations…) conservée dans le navigateur. */
export function usePref<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem('sm:' + key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = useCallback((x: T) => {
    setV(x);
    try {
      localStorage.setItem('sm:' + key, JSON.stringify(x));
    } catch {
      // stockage indisponible
    }
  }, [key]);
  return [v, set];
}

export function getGuestName(): string {
  try {
    return localStorage.getItem('sm:guestName') ?? '';
  } catch {
    return '';
  }
}
export function setGuestName(n: string) {
  try {
    localStorage.setItem('sm:guestName', n);
  } catch {
    // stockage indisponible
  }
}
