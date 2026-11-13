// Essai de la cabine : écart à la panoplie portée, gardé dans l'adresse (?essai=…, mise à jour 300 ms après le dernier
// geste, par history.replaceState) et dans sessionStorage. L'essai survit ainsi à l'inscription
// (/inscription?retour=…), au retour de Stripe (dont l'adresse de retour est fixe) et au partage d'un lien.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Collection, ItemKind } from '../../../shared/catalog';
import type { MeUser } from '../../../shared/protocol';
import { ownedIds, panoplieOf } from '../../skins';
import { RAYONS } from './RayonTabs';
import { available, formatEssai, normalize, parseEssai, revertSlot, surprise as draw, toggleItem, trialOf, withCollection } from './trial';
import type { Trial, TrialDelta } from './trial';

const STORE_KEY = 'sm:essai';
/** Essai vide gardé (après « Rétablir ») : l'arrivée suivante ne remet pas le roi mis en avant. */
const EMPTY = '-';

export function storedTrial(): TrialDelta {
  try {
    return parseEssai(sessionStorage.getItem(STORE_KEY));
  } catch {
    return {};
  }
}

/** Un essai (même vide) a-t-il déjà été gardé dans cette session ? */
export function hasStoredTrial(): boolean {
  try {
    return sessionStorage.getItem(STORE_KEY) !== null;
  } catch {
    return false;
  }
}

function storeTrial(delta: TrialDelta) {
  try {
    sessionStorage.setItem(STORE_KEY, formatEssai(delta) || EMPTY);
  } catch {
    // stockage indisponible : l'adresse suffit
  }
}

export interface TrialApi {
  /** Essai complet (panoplie + emplacements essayés). */
  trial: Trial;
  /** Panoplie portée. */
  pano: Trial;
  /** Emplacements essayés. */
  delta: TrialDelta;
  owned: string[];
  tryItem: (id: string) => void;
  tryCollection: (c: Collection) => void;
  revert: (kind: ItemKind) => void;
  revertAll: () => void;
  surprise: () => void;
  /** Remplace l'essai (déballage : les objets livrés). */
  set: (delta: TrialDelta) => void;
}

export function useTrial(me: MeUser | null, initial: () => TrialDelta): TrialApi {
  const pano = useMemo(() => panoplieOf(me), [me]);
  const owned = useMemo(() => ownedIds(me), [me]);
  const [raw, setRaw] = useState<TrialDelta>(initial);
  // Écart minimal recalculé quand la panoplie change (compte chargé après la page, objet équipé), sans objet retiré de
  // la vente que l'on ne possède pas
  const delta = useMemo(() => normalize(available(raw, owned), pano), [raw, owned, pano]);
  const trial = useMemo(() => trialOf(pano, delta), [pano, delta]);

  useEffect(() => storeTrial(delta), [delta]);

  const tryItem = useCallback((id: string) => setRaw(d => toggleItem(normalize(d, pano), pano, id)), [pano]);
  const tryCollection = useCallback((c: Collection) => setRaw(d => withCollection(normalize(d, pano), pano, c)), [pano]);
  const revert = useCallback((kind: ItemKind) => setRaw(d => revertSlot(d, kind)), []);
  const revertAll = useCallback(() => setRaw({}), []);
  const surprise = useCallback(() => setRaw(d => normalize(draw(trialOf(pano, normalize(d, pano))), pano)), [pano]);
  const set = useCallback((d: TrialDelta) => setRaw(d), []);

  return { trial, pano, delta, owned, tryItem, tryCollection, revert, revertAll, surprise, set };
}

/**
 * Adresse de la boutique : rayon et essai, écrits 300 ms après le dernier changement sans créer d'entrée d'historique
 * (l'état du routeur est gardé tel quel).
 */
export function useShopUrl(rayon: string, delta: TrialDelta, skip: boolean) {
  const essai = formatEssai(delta);
  useEffect(() => {
    if (skip) return;
    const t = window.setTimeout(() => {
      const q: string[] = [];
      if (rayon !== RAYONS[0]) q.push(`rayon=${rayon}`);
      if (essai) q.push(`essai=${essai}`);
      const url = `${window.location.pathname}${q.length ? `?${q.join('&')}` : ''}`;
      if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, '', url);
    }, 300);
    return () => window.clearTimeout(t);
  }, [rayon, essai, skip]);
}
