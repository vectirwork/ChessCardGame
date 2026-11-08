// Crée la scène d'effets à la demande, une fois le plateau affiché.
// `pool` : la scène n'est pas détruite au démontage mais gardée un moment pour le prochain échiquier du même nom
// (la démonstration de l'accueil change d'échiquier à chaque lieu) : un seul contexte WebGL, des programmes déjà
// compilés, aucune image sautée pendant le défilement.
// Partage : deux échiquiers de la même page se passent la scène d'un même pool ('odyssee-stage' : la démonstration de
// la descente et la partie de l'accueil). Celui qui cède (`yields` : la partie hors mode immersif, qui n'anime aucun
// sort) la rend à l'autre dès que celui-ci en a besoin, et la reprend quand il la libère ; deux échiquiers qui ne
// cèdent pas ont chacun la leur (sur l'accueil : seulement juste après un sort, voir IDLE_BEFORE_YIELD_MS).
// Préparation : toute scène créée ici compile ses programmes au repos (VfxStage.warm) ; prewarmVfx() crée et prépare
// celle d'un pool avant même que son échiquier existe.
import { useEffect, useRef, useState } from 'react';
import type { Color } from '../../shared/chess';
import { skinStyle } from '../../shared/catalog';
import type { VfxStage } from './stage';

export type VfxModule = typeof import('./index');
export interface Vfx {
  stage: VfxStage;
  m: VfxModule;
}

/** Scène gardée sans échiquier au-delà de ce délai : elle est libérée (contexte WebGL rendu au navigateur). */
const POOL_KEEP_MS = 20000;
/**
 * Un sort laisse des minuteries derrière lui qui visent la scène et son échiquier (fin d'une ambiance, jusqu'à ≈ 2,7 s
 * après le début du sort ; éclats différés de la Déflagration, ≈ 0,5 s après l'impact), à peu près jusqu'à l'arrêt de
 * sa boucle d'images. La scène n'est donc reprise à un échiquier qui cède que si elle n'anime plus rien depuis
 * IDLE_BEFORE_YIELD_MS, et une scène libérée n'est rendue à l'échiquier qui l'attendait qu'au bout de HANDOFF_MS
 * (détachée entre-temps : les éclats tardifs sont effacés en la rattachant) : rien du sort d'un échiquier n'apparaît
 * sur l'autre.
 */
const IDLE_BEFORE_YIELD_MS = 1500;
const HANDOFF_MS = 900;

/** Un échiquier qui tient la scène d'un pool ou attend de la reprendre. */
interface Holder {
  wrap: HTMLElement;
  orientation: Color;
  /** N'anime aucun sort : la scène peut lui être reprise. */
  yields: boolean;
  grant: (v: Vfx | null) => void;
}
interface Slot {
  stage: VfxStage;
  m: VfxModule;
  holder: Holder | null;
  /** Échiquiers qui ont cédé la scène : le premier la reprend quand elle se libère. */
  waiting: Holder[];
  /** Libération (POOL_KEEP_MS) ou passage à l'échiquier qui attend (HANDOFF_MS). */
  timer: number;
}
const slots = new Map<string, Slot>();

const load = () => import('./index');

function create(m: VfxModule, wrap: HTMLElement, orientation: Color): VfxStage {
  const stage = new m.VfxStage(wrap, orientation);
  stage.markerFactory = m.createMarker;
  stage.arrivalFactory = m.playArrival;
  // Programmes des effets compilés au premier moment calme : le premier sort de chaque type ne bloque plus le fil
  // principal, et les suivants ne recompilent plus rien
  if (stage.ok) void stage.warm(m.warmObjects());
  return stage;
}

/** Rattache la scène du pool à `h`. */
function give(slot: Slot, h: Holder) {
  window.clearTimeout(slot.timer);
  slot.timer = 0;
  slot.holder = h;
  slot.stage.attach(h.wrap, h.orientation);
  h.grant({ stage: slot.stage, m: slot.m });
}

/** Scène sans échiquier : en sommeil, libérée au bout de POOL_KEEP_MS si personne ne la prend. */
function park(key: string, slot: Slot) {
  window.clearTimeout(slot.timer);
  slot.timer = window.setTimeout(() => {
    if (slots.get(key) !== slot || slot.holder) return;
    slots.delete(key);
    slot.stage.dispose();
  }, POOL_KEEP_MS);
}

/** La scène peut être reprise à celui qui la tient : il n'anime aucun sort et elle est au repos depuis assez longtemps. */
const takeable = (slot: Slot) => !slot.holder || (slot.holder.yields && slot.stage.idleMs >= IDLE_BEFORE_YIELD_MS);

/** Demande la scène du pool `key` pour `h` ; renvoie une scène propre à `h` quand elle ne peut pas être partagée. */
function request(key: string, m: VfxModule, h: Holder): VfxStage | null {
  const slot = slots.get(key);
  if (!slot) {
    const stage = create(m, h.wrap, h.orientation);
    // Sans WebGL, rien à partager
    if (!stage.ok) return stage;
    slots.set(key, { stage, m, holder: h, waiting: [], timer: 0 });
    h.grant({ stage, m });
    return null;
  }
  const cur = slot.holder;
  if (!cur) {
    give(slot, h);
    return null;
  }
  if (h.yields) {
    slot.waiting.push(h);
    return null;
  }
  if (!takeable(slot)) return create(m, h.wrap, h.orientation);
  // L'échiquier qui la tient n'anime rien : il la cède et la reprendra
  cur.grant(null);
  slot.waiting.unshift(cur);
  give(slot, h);
  return null;
}

/** `h` n'a plus besoin de la scène du pool `key` (démontage). */
function leave(key: string, h: Holder) {
  const slot = slots.get(key);
  if (!slot) return;
  const i = slot.waiting.indexOf(h);
  if (i >= 0) {
    slot.waiting.splice(i, 1);
    return;
  }
  if (slot.holder !== h) return;
  slot.holder = null;
  slot.stage.detach();
  if (!slot.waiting.length) {
    park(key, slot);
    return;
  }
  window.clearTimeout(slot.timer);
  slot.timer = window.setTimeout(() => {
    if (slots.get(key) !== slot || slot.holder) return;
    const next = slot.waiting.shift();
    if (next) give(slot, next);
    else park(key, slot);
  }, HANDOFF_MS);
}

/**
 * `h`, qui attendait la scène, en a besoin maintenant (partie de l'accueil passée en mode immersif) : elle lui revient
 * si personne ne la tient ou si celui qui la tient cède ; sinon (deux échiquiers qui animent) `h` a sa propre scène,
 * renvoyée ici.
 */
function claim(key: string, m: VfxModule, h: Holder): VfxStage | null {
  const slot = slots.get(key);
  const i = slot ? slot.waiting.indexOf(h) : -1;
  if (!slot || i < 0) return null;
  slot.waiting.splice(i, 1);
  if (!takeable(slot)) return create(m, h.wrap, h.orientation);
  const cur = slot.holder;
  if (cur) {
    cur.grant(null);
    slot.waiting.unshift(cur);
  }
  give(slot, h);
  return null;
}

/**
 * Prépare au repos la scène du pool `poolKey` avant que son échiquier existe : contexte WebGL, programmes des effets,
 * puis textures des `skins` (identifiants du catalogue). Rien de visible (calque caché, rien de dessiné). Si une scène
 * existe déjà dans le pool, seules les textures sont préparées. Sans échiquier pour la prendre, elle est libérée au
 * bout de POOL_KEEP_MS.
 * Appel prévu : à l'accueil, au premier défilement, à côté du préchargement de '../vfx/index' (OdysseeHome), avec les
 * skins des lieux : prewarmVfx('odyssee-stage', PLACES.map(p => p.skin)). La démonstration du premier lieu trouve
 * alors une scène prête au lieu de la créer pendant l'arrivée dans la Forêt.
 */
export function prewarmVfx(poolKey: string, skins: string[] = []): void {
  void load()
    .then(m => {
      let slot = slots.get(poolKey);
      if (!slot) {
        // Échiquier provisoire, hors du document : attach() le remplacera
        const stage = create(m, document.createElement('div'), 'w');
        if (!stage.ok) {
          stage.dispose();
          return;
        }
        slot = { stage, m, holder: null, waiting: [], timer: 0 };
        slots.set(poolKey, slot);
        park(poolKey, slot);
      }
      if (skins.length) void slot.stage.warm([], m.warmTextures(skins.map(skinStyle)));
    })
    .catch(() => undefined);
}

/**
 * Scène d'effets de l'échiquier `wrap` (null tant qu'elle se prépare, ou quand un autre échiquier l'a reprise).
 * `yields` (avec `poolKey`) : l'échiquier n'anime aucun sort pour l'instant ; la scène du pool peut lui être reprise
 * (une fois au repos), et lui revient quand l'autre la libère ou quand `yields` repasse à faux.
 */
export function useVfx(wrap: HTMLElement | null, orientation: Color, poolKey?: string, yields = false): Vfx | null {
  const [vfx, setVfx] = useState<Vfx | null>(null);
  const yieldsRef = useRef(yields);
  yieldsRef.current = yields;
  const holderRef = useRef<Holder | null>(null);
  /** Scène propre à cet échiquier (sans pool, ou pool tenu par un échiquier qui ne cède pas) : détruite au démontage. */
  const ownRef = useRef<VfxStage | null>(null);
  useEffect(() => {
    if (!wrap) return;
    let dead = false;
    const h: Holder = { wrap, orientation, yields: yieldsRef.current, grant: v => !dead && setVfx(v) };
    holderRef.current = h;
    void load().then(m => {
      if (dead) return;
      const own = poolKey ? request(poolKey, m, h) : create(m, wrap, orientation);
      if (!own) return;
      ownRef.current = own;
      setVfx({ stage: own, m });
    });
    return () => {
      dead = true;
      holderRef.current = null;
      setVfx(null);
      const own = ownRef.current;
      ownRef.current = null;
      if (own) own.dispose();
      else if (poolKey) leave(poolKey, h);
    };
    // L'orientation suivante passe par stage.setOrientation() pour ne pas recréer la scène
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrap]);
  useEffect(() => {
    const h = holderRef.current;
    if (!h || !poolKey) return;
    h.yields = yields;
    if (yields) return;
    const slot = slots.get(poolKey);
    if (ownRef.current || !slot) return;
    const own = claim(poolKey, slot.m, h);
    if (own) {
      ownRef.current = own;
      setVfx({ stage: own, m: slot.m });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yields]);
  return vfx;
}
