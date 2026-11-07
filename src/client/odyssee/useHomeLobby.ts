// Accueil : se signaler au serveur à l'arrivée, pour jouer contre un autre visiteur arrivé en même temps.
//
// À l'arrivée, le navigateur envoie son fuseau horaire (le pays de l'adversaire en est déduit, sans géolocaliser
// l'adresse IP) et s'il est prêt : échiquier du haut sous les yeux, partie contre l'Oracle à peine commencée. Le serveur
// apparie deux visiteurs prêts arrivés depuis moins de 30 s (home:paired) ; au-delà, il ne cherche plus.
import { useEffect, useRef } from 'react';
import { getSocket } from '../socket';
import type { HomeDuel } from './useLiveGame';

export function useHomeLobby(ready: boolean, onPaired: (d: HomeDuel) => void) {
  const readyRef = useRef(ready);
  const pairedRef = useRef(onPaired);
  pairedRef.current = onPaired;

  useEffect(() => {
    const s = getSocket();
    let tz = '';
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    } catch {
      // fuseau inconnu : l'adversaire ne verra pas de pays
    }
    const hello = () => s.emit('home:hello', { tz, ready: readyRef.current });
    if (s.connected) hello();
    else s.once('connect', hello);
    const paired = (p: { gameId: string; color: HomeDuel['me']; opponent: { country: string | null } }) =>
      pairedRef.current({ id: p.gameId, me: p.color, country: p.opponent.country });
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
}
