// Accueil : se signaler au serveur à l'arrivée, pour jouer contre un autre visiteur arrivé en même temps, ou chercher
// un vrai joueur à la demande.
//
// À l'arrivée, le navigateur envoie son fuseau horaire (le pays de l'adversaire en est déduit, sans géolocaliser
// l'adresse IP) et s'il est prêt : échiquier du haut sous les yeux, partie contre l'Oracle à peine commencée
// (HOME.readyMaxPly). Le serveur apparie deux visiteurs prêts arrivés depuis moins de HOME.pairWindowMs (30 s,
// home:paired) ; au-delà, il ne cherche plus, sauf si le visiteur le demande (« Chercher un vrai joueur »,
// home:search), et alors sans limite de temps.
//
// `enabled` : parties de l'accueil ouvertes (interrupteur homeDuel, création de parties, jeu sans compte pour un
// invité) et identité connue (/api/me a répondu). Sans cela, aucune connexion n'est ouverte : le cookie d'invité et le
// compte sont ceux de /api/me, et une connexion ouverte avant aurait été remplacée (resetSocket) à l'arrivée du compte,
// avec ses abonnements.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../socket';
import type { HomeDuel } from './useLiveGame';

/** Premiers gestes du visiteur : la connexion de l'accueil s'ouvre au premier d'entre eux (ou au repos). */
const WAKE = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

function timezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

export interface HomeLobby {
  /** Recherche d'un vrai joueur en cours. */
  searching: boolean;
  /** Début de la recherche (horodatage local). */
  since: number | null;
  setSearching: (on: boolean) => void;
}

export function useHomeLobby(enabled: boolean, ready: boolean, onPaired: (d: HomeDuel) => void): HomeLobby {
  const readyRef = useRef(ready);
  const pairedRef = useRef(onPaired);
  pairedRef.current = onPaired;
  const [searching, setSearchingState] = useState(false);
  const [since, setSince] = useState<number | null>(null);
  const searchingRef = useRef(searching);
  searchingRef.current = searching;

  /** Ouvre la connexion et se signale (une fois) ; null tant que l'accueil n'est pas monté. */
  const startRef = useRef<(() => void) | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const tz = timezone();
    let dead = false;
    // À la connexion (et après une coupure) : présence, et recherche en cours le cas échéant
    const hello = () => {
      const s = getSocket();
      s.emit('home:hello', { tz, ready: readyRef.current });
      if (searchingRef.current) s.emit('home:search', { search: true, tz });
    };
    const paired = (p: { gameId: string; color: HomeDuel['me']; opponent: { country: string | null } }) => {
      setSearchingState(false);
      setSince(null);
      pairedRef.current({ id: p.gameId, me: p.color, country: p.opponent.country });
    };
    // La connexion temps réel attend le repos après le chargement, ou le premier geste du visiteur : elle ne dispute
    // rien au premier affichage (négociation, premiers messages). Deux visiteurs arrivés ensemble restent appariés : le
    // serveur garde HOME.pairWindowMs de fenêtre (30 s), l'attente est d'une à trois secondes.
    const start = () => {
      if (dead || startedRef.current) return;
      startedRef.current = true;
      for (const ev of WAKE) window.removeEventListener(ev, start, true);
      const s = getSocket();
      if (s.connected) hello();
      s.on('connect', hello);
      s.on('home:paired', paired);
    };
    startRef.current = start;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const idle = () => (w.requestIdleCallback ? w.requestIdleCallback(start, { timeout: 3000 }) : window.setTimeout(start, 1));
    if (document.readyState === 'complete') idle();
    else window.addEventListener('load', idle, { once: true });
    for (const ev of WAKE) window.addEventListener(ev, start, { passive: true, capture: true });
    // Recherche demandée avant que la connexion soit permise (identité pas encore connue) : elle part tout de suite
    if (searchingRef.current) start();
    return () => {
      dead = true;
      startRef.current = null;
      window.removeEventListener('load', idle);
      for (const ev of WAKE) window.removeEventListener(ev, start, true);
      if (!startedRef.current) return;
      startedRef.current = false;
      const s = getSocket();
      s.off('connect', hello);
      s.off('home:paired', paired);
      s.emit('home:bye');
    };
  }, [enabled]);

  useEffect(() => {
    if (readyRef.current === ready) return;
    readyRef.current = ready;
    // Pas encore connecté : hello enverra l'état à jour
    if (!startedRef.current) return;
    const s = getSocket();
    if (s.connected) s.emit('home:ready', { ready });
  }, [ready]);

  const setSearching = useCallback((on: boolean) => {
    setSearchingState(on);
    setSince(on ? Date.now() : null);
    // Demande explicite : la connexion s'ouvre tout de suite si elle attendait encore (hello envoie alors la recherche)
    if (!startedRef.current) {
      searchingRef.current = on;
      startRef.current?.();
      return;
    }
    getSocket().emit('home:search', { search: on, tz: timezone() });
  }, []);

  return { searching, since, setSearching };
}
