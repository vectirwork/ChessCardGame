// « Affronter un humain » : file amicale du serveur (invités acceptés). Une fois apparié, on part vers /partie/:id.
// Pendant l'attente, la partie contre l'IA reste jouable.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Catalog } from '../../shared/cards';
import { emitAck, getSocket } from '../socket';
import { getGuestName, useApp } from '../store';

export type QueueStatus = 'idle' | 'joining' | 'waiting' | 'error';

/** Cadence de la file amicale ouverte depuis l'accueil. */
export const HUMAN_TC = '10+0';

export function useHumanQueue(catalog: Catalog) {
  const { me } = useApp();
  const navigate = useNavigate();
  const [status, setStatus] = useState<QueueStatus>('idle');
  const [since, setSince] = useState<number | null>(null);
  const [players, setPlayers] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    const s = getSocket();
    const onMatched = (p: { gameId: string }) => {
      setStatus('idle');
      navigate(`/partie/${p.gameId}`);
    };
    const onStatus = (p: { waiting: boolean; since: number | null; players: number }) => {
      setPlayers(p.players ?? 0);
      if (p.waiting) {
        setStatus('waiting');
        setSince(p.since ?? Date.now());
      } else if (statusRef.current === 'waiting') {
        setStatus('idle');
      }
    };
    s.on('queue:matched', onMatched);
    s.on('queue:status', onStatus);
    return () => {
      s.off('queue:matched', onMatched);
      s.off('queue:status', onStatus);
      if (statusRef.current === 'waiting' || statusRef.current === 'joining') s.emit('queue:leave');
    };
  }, [navigate]);

  const join = useCallback(async () => {
    setError(null);
    setStatus('joining');
    try {
      const guest = getGuestName();
      const name = !me && /^[\p{L}\p{N} _.-]{2,20}$/u.test(guest.trim()) ? guest.trim() : undefined;
      const r = await emitAck<{ ok: boolean; error?: string }>('queue:join', { tc: HUMAN_TC, rated: false, name, catalog });
      if (!r.ok) {
        setStatus('error');
        setError(r.error ?? 'Impossible de rejoindre la file.');
        return;
      }
      // queue:status arrive juste après ; s'il a déjà apparié, queue:matched nous a déjà emmenés
      if (statusRef.current === 'joining') {
        setStatus('waiting');
        setSince(Date.now());
      }
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Le serveur ne répond pas.');
    }
  }, [me, catalog]);

  const cancel = useCallback(() => {
    getSocket().emit('queue:leave');
    setStatus('idle');
    setSince(null);
    setError(null);
  }, []);

  return { status, since, players, error, join, cancel };
}

export type HumanQueue = ReturnType<typeof useHumanQueue>;
