// État global : utilisateur connecté, notifications, préférences.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { MeResponse, MeUser } from '../shared/protocol';
import { api, errMsg } from './api';
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
  /** Compte connecté ; null : invité, ou identité encore inconnue (voir ready). */
  me: MeUser | null;
  /**
   * /api/me a répondu : `me` est sûr (null = invité). Faux tant que l'identité est inconnue (premier chargement,
   * réseau coupé, serveur qui redémarre) : un joueur connecté n'est jamais pris pour un invité.
   */
  ready: boolean;
  payments: MeResponse['payments'];
  setMe: (u: MeUser | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  toast: (text: string, kind?: Toast['kind']) => void;
}

const Ctx = createContext<AppState>(null as unknown as AppState);
/**
 * Interrupteurs du site, dans un contexte à part : ils ne changent pas à chaque réponse de /api/me (même objet au
 * défaut, mergeFeatures), et App, qui en tire la table des routes, n'est pas redessiné pour autant.
 */
export const FeaturesContext = createContext<Readonly<Features>>(FEATURES);

/** Nouvel essai de /api/me tant que l'identité est inconnue : après 1 s, 3 s, 9 s, puis toutes les 10 s. */
const meRetryMs = (i: number) => Math.min(1000 * 3 ** i, 10_000);

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

  /** Relit /api/me (identité, paiements, interrupteurs) ; rejette si le serveur ne répond pas. */
  const refresh = useCallback(async () => {
    const r = await api<MeResponse>('/me');
    setMeState(r.user);
    setPayments(r.payments);
    // Même objet si rien ne change (mergeFeatures) : aucun rendu de plus au défaut.
    if (r.features) setFeatures(f => mergeFeatures(f, r.features));
    setReady(true);
  }, []);

  // Au chargement : /api/me jusqu'à ce qu'il réponde, avec des essais espacés ; `ready` reste faux en attendant.
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = (i: number) => {
      refresh().catch(() => {
        if (live) timer = setTimeout(attempt, meRetryMs(i), i + 1);
      });
    };
    attempt(0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
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

  /** Déconnexion : l'interface passe en invité même si la requête échoue (message d'erreur alors). */
  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
      toast('À bientôt !');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setMe(null);
    }
  }, [setMe, toast]);

  const value = useMemo(
    () => ({ me, ready, payments, setMe, refresh, logout, toast }),
    [me, ready, payments, setMe, refresh, logout, toast],
  );
  return (
    <Ctx.Provider value={value}>
      <FeaturesContext.Provider value={features}>{children}</FeaturesContext.Provider>
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
  return useContext(FeaturesContext)[k];
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
