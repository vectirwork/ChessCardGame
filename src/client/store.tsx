// État global : utilisateur connecté, notifications, préférences.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { MeResponse, MeUser } from '../shared/protocol';
import { api } from './api';
import { resetSocket } from './socket';

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

interface AppState {
  me: MeUser | null;
  ready: boolean;
  payments: MeResponse['payments'];
  setMe: (u: MeUser | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  toast: (text: string, kind?: Toast['kind']) => void;
}

const Ctx = createContext<AppState>(null as unknown as AppState);

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<MeUser | null>(null);
  const [ready, setReady] = useState(false);
  const [payments, setPayments] = useState<MeResponse['payments']>('off');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const refresh = useCallback(async () => {
    try {
      const r = await api<MeResponse>('/me');
      setMeState(r.user);
      setPayments(r.payments);
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

  const value = useMemo(() => ({ me, ready, payments, setMe, refresh, logout, toast }), [me, ready, payments, setMe, refresh, logout, toast]);
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
