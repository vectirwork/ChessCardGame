// Accueil : se signaler au serveur à l'arrivée, pour jouer contre un autre visiteur arrivé en même temps, ou chercher
// un vrai joueur à la demande.
//
// À l'arrivée, le navigateur envoie son fuseau horaire (le pays de l'adversaire en est déduit, sans géolocaliser
// l'adresse IP) et s'il est prêt : échiquier du haut sous les yeux, partie contre l'Oracle à peine commencée. Le serveur
// apparie deux visiteurs prêts arrivés depuis moins de 30 s (home:paired) ; au-delà, il ne cherche plus, sauf si le
// visiteur le demande (« Chercher un vrai joueur », home:search), et alors sans limite de temps.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../socket';
import type { HomeDuel } from './useLiveGame';

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

export function useHomeLobby(ready: boolean, onPaired: (d: HomeDuel) => void): HomeLobby {
  const readyRef = useRef(ready);
  const pairedRef = useRef(onPaired);
  pairedRef.current = onPaired;
  const [searching, setSearchingState] = useState(false);
  const [since, setSince] = useState<number | null>(null);
  const searchingRef = useRef(searching);
  searchingRef.current = searching;

  useEffect(() => {
    const s = getSocket();
    const tz = timezone();
    // À la connexion (et après une coupure) : présence, et recherche en cours le cas échéant
    const hello = () => {
      s.emit('home:hello', { tz, ready: readyRef.current });
      if (searchingRef.current) s.emit('home:search', { search: true, tz });
    };
    if (s.connected) hello();
    s.on('connect', hello);
    const paired = (p: { gameId: string; color: HomeDuel['me']; opponent: { country: string | null } }) => {
      setSearchingState(false);
      setSince(null);
      pairedRef.current({ id: p.gameId, me: p.color, country: p.opponent.country });
    };
    s.on('home:paired', paired);
    return () => {
      s.off('connect', hello);
      s.off('home:paired', paired);
      s.emit('home:bye');
    };
  }, []);

  useEffect(() => {
    if (readyRef.current === ready) return;
    readyRef.current = ready;
    const s = getSocket();
    if (s.connected) s.emit('home:ready', { ready });
  }, [ready]);

  const setSearching = useCallback((on: boolean) => {
    setSearchingState(on);
    setSince(on ? Date.now() : null);
    getSocket().emit('home:search', { search: on, tz: timezone() });
  }, []);

  return { searching, since, setSearching };
}
