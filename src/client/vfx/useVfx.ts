// Crée la scène d'effets à la demande, une fois le plateau affiché.
// `pool` : la scène n'est pas détruite au démontage mais gardée un moment pour le prochain échiquier du même nom
// (la démonstration de l'accueil change d'échiquier à chaque lieu) : un seul contexte WebGL, des programmes déjà
// compilés, aucune image sautée pendant le défilement.
// Partage : deux échiquiers de la même page se passent la scène d'un même pool ('odyssee-stage' : la démonstration de
// la descente et la partie de l'accueil). Celui qui cède (`yields` : la partie hors mode immersif, qui n'anime aucun
// sort) la rend à l'autre dès que celui-ci en a besoin, et la reprend quand il la libère ; deux échiquiers qui ne
// cèdent pas ont chacun la leur (sur l'accueil : seulement juste après un sort, voir IDLE_BEFORE_YIELD_MS).
// Familles : la partie (qui cède) d'un côté, les échiquiers de la démonstration (qui se passent la scène d'un lieu au
// suivant, comme avant le partage) de l'autre. La scène sait quelle famille la tient (VfxStage.family) : ce qu'un sort
// d'une famille a programmé pour plus tard ne la vise que si cette famille la tient encore, et rien du sort d'un
// échiquier n'apparaît sur l'autre.
// Préparation : toute scène créée ici compile ses programmes au repos (VfxStage.warm) ; prewarmVfx() crée et prépare
// celle d'un pool avant même que son échiquier existe.
import { useEffect, useRef, useState } from 'react';
import type { Color } from '../../shared/chess';
import { skinStyle } from '../../shared/catalog';
import { HANDOFF_MS, IDLE_BEFORE_YIELD_MS, POOL_KEEP_MS } from './sharing';
import type { VfxStage } from './stage';

export type VfxModule = typeof import('./index');
export interface Vfx {
  stage: VfxStage;
  m: VfxModule;
}

/*
 * Délais du partage (valeurs dans sharing.ts, avec les réglages). POOL_KEEP_MS : une scène gardée sans échiquier au-delà
 * de ce délai est libérée (contexte WebGL rendu au navigateur).
 * IDLE_BEFORE_YIELD_MS et HANDOFF_MS : un sort laisse des minuteries derrière lui qui visent la scène et son échiquier
 * (fin d'une ambiance, jusqu'à ≈ 2,7 s après le début du sort ; éclats différés de la Déflagration, ≈ 0,5 s après
 * l'impact), à peu près jusqu'à l'arrêt de sa boucle d'images. La scène n'est donc reprise à un échiquier qui cède que
 * si elle n'anime plus rien depuis IDLE_BEFORE_YIELD_MS (ou s'il ne s'en est pas servi), et une scène libérée n'est
 * rendue à l'échiquier qui l'attendait qu'au bout de HANDOFF_MS (détachée entre-temps : les éclats tardifs sont effacés
 * en la rattachant). Quand elle change de famille plus tôt (la partie qui la réclame ou la demande juste après la sortie
 * d'un lieu), ce que les sorts de l'autre famille avaient programmé ne la vise plus (VfxStage.family, later).
 */

/** Un échiquier qui tient la scène d'un pool ou attend de la reprendre. */
interface Holder {
  wrap: HTMLElement;
  orientation: Color;
  /** N'anime aucun sort : la scène peut lui être reprise. */
  yields: boolean;
  /** Famille : vrai pour un échiquier qui partage la scène en la cédant (la partie), faux pour la démonstration. */
  shares: boolean;
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
  /** Quand le détenteur actuel l'a reçue (horloge murale). */
  since: number;
}
const slots = new Map<string, Slot>();
/**
 * Pools dont la scène est gardée (prewarmVfx avec `keep`, jusqu'à releaseVfx) : en sommeil, elle n'est pas libérée au
 * bout de POOL_KEEP_MS, qu'elle n'ait encore servi à personne ou qu'un échiquier vienne de la rendre (la deuxième
 * descente de l'accueil la retrouve prête, programmes compilés).
 */
const kept = new Set<string>();

const load = () => import('./index');

function create(m: VfxModule, wrap: HTMLElement, orientation: Color): VfxStage {
  const stage = new m.VfxStage(wrap, orientation);
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
  slot.stage.family = h.shares;
  slot.since = Date.now();
  h.grant({ stage: slot.stage, m: slot.m });
}

/**
 * Scène sans échiquier : en sommeil, libérée au bout de POOL_KEEP_MS si personne ne la prend (sauf pool gardé, voir
 * kept).
 */
function park(key: string, slot: Slot) {
  window.clearTimeout(slot.timer);
  slot.timer = 0;
  if (kept.has(key)) return;
  slot.timer = window.setTimeout(() => {
    if (slots.get(key) !== slot || slot.holder) return;
    slots.delete(key);
    slot.stage.dispose();
  }, POOL_KEEP_MS);
}

/**
 * La scène peut être reprise à celui qui la tient : il n'anime aucun sort, et elle est au repos depuis assez longtemps
 * ou il ne s'en est pas servi depuis qu'il l'a reçue (la partie qui l'a récupérée en haut de page : la démonstration
 * peut la reprendre aussitôt qu'elle redescend).
 */
const takeable = (slot: Slot) =>
  !slot.holder || (slot.holder.yields && (slot.stage.idleMs >= IDLE_BEFORE_YIELD_MS || !slot.stage.ranSince(slot.since)));

/** Demande la scène du pool `key` pour `h` ; renvoie une scène propre à `h` quand elle ne peut pas être partagée. */
function request(key: string, m: VfxModule, h: Holder): VfxStage | null {
  const slot = slots.get(key);
  if (!slot) {
    const stage = create(m, h.wrap, h.orientation);
    // Sans WebGL, rien à partager
    if (!stage.ok) return stage;
    stage.family = h.shares;
    slots.set(key, { stage, m, holder: h, waiting: [], timer: 0, since: Date.now() });
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
 * si personne ne la tient (même pendant le délai de passage : les restes du sort de la démonstration ne la visent
 * plus, VfxStage.family) ou si celui qui la tient cède ; sinon (deux échiquiers qui animent) `h` a sa propre scène, renvoyée ici.
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
 * Appelée par l'accueil à l'ordinateur (OdysseeHome), au repos après le chargement, avec les skins des lieux et `keep`
 * (gardée jusqu'à ce qu'un échiquier la prenne : un lecteur qui reste longtemps sur le héros ne perd pas la
 * préparation). La démonstration du premier lieu trouve alors une scène prête, programmes compilés, au lieu de les
 * compiler au premier sort, en pleine descente dans les nuées.
 */
export function prewarmVfx(poolKey: string, skins: string[] = [], keep = false): void {
  if (keep) kept.add(poolKey);
  void load()
    .then(m => {
      // Page quittée pendant le chargement de three.js : plus rien à préparer
      if (keep && !kept.has(poolKey)) return;
      let slot = slots.get(poolKey);
      if (!slot) {
        // Échiquier provisoire, hors du document : attach() le remplacera
        const stage = create(m, document.createElement('div'), 'w');
        if (!stage.ok) {
          stage.dispose();
          return;
        }
        slot = { stage, m, holder: null, waiting: [], timer: 0, since: 0 };
        slots.set(poolKey, slot);
        park(poolKey, slot);
      } else if (keep && !slot.holder && !slot.waiting.length) park(poolKey, slot);
      if (skins.length) void slot.stage.warm([], m.warmTextures(skins.map(skinStyle)));
    })
    .catch(() => undefined);
}

/**
 * La scène préparée et gardée du pool `poolKey` (prewarmVfx avec `keep`) n'est plus attendue (l'accueil est quitté) :
 * le pool n'est plus gardé ; si aucun échiquier ne la tient, elle est libérée au bout de POOL_KEEP_MS, comme toute
 * scène en sommeil (sinon, à son tour, quand il la rend). Une préparation encore en cours n'aboutit pas.
 */
export function releaseVfx(poolKey: string): void {
  kept.delete(poolKey);
  const slot = slots.get(poolKey);
  if (slot && !slot.holder && !slot.waiting.length && !slot.timer) park(poolKey, slot);
}

/** Scène d'un échiquier qui partage celle de son pool en la cédant (useSharedVfx). */
export interface VfxShare {
  /**
   * Vrai dès que la scène de cet échiquier est prête, même s'il l'a cédée pour l'instant : c'est le moment où, avant le
   * partage, il avait la sienne pour de bon.
   */
  ready: boolean;
  /**
   * La scène quand cet échiquier la tient, null sinon (changée dès qu'elle est cédée ou rendue, sans rendu React) :
   * lue au moment de s'en servir.
   */
  now: { readonly current: Vfx | null };
}

/**
 * Scène d'effets de l'échiquier `wrap` (null tant qu'elle se prépare). `poolKey` : voir l'en-tête (scène gardée pour
 * le prochain échiquier du même nom).
 */
export function useVfx(wrap: HTMLElement | null, orientation: Color, poolKey?: string): Vfx | null {
  return useVfxCore(wrap, orientation, poolKey, undefined, undefined).vfx;
}

/**
 * Scène d'effets d'un échiquier qui partage celle du pool `poolKey` en la cédant (la partie de l'accueil). `yields` :
 * l'échiquier n'anime aucun sort pour l'instant ; la scène du pool peut lui être reprise (une fois au repos), et lui
 * revient quand l'autre la libère ou quand `yields` repasse à faux. `onGrant` est appelé à chaque passage (la scène,
 * ou null quand elle est reprise), sans rendu React : seul `ready` en provoque un, une fois.
 */
export function useSharedVfx(wrap: HTMLElement | null, orientation: Color, poolKey: string, yields: boolean, onGrant: (v: Vfx | null) => void): VfxShare {
  const { ready, now } = useVfxCore(wrap, orientation, poolKey, yields, onGrant);
  return { ready, now };
}

/** `yields` indéfini : l'échiquier ne cède jamais la scène (famille de la démonstration). */
function useVfxCore(
  wrap: HTMLElement | null,
  orientation: Color,
  poolKey: string | undefined,
  yields: boolean | undefined,
  onGrant: ((v: Vfx | null) => void) | undefined,
): VfxShare & { vfx: Vfx | null } {
  const [vfx, setVfx] = useState<Vfx | null>(null);
  const [ready, setReady] = useState(false);
  const nowRef = useRef<Vfx | null>(null);
  const onGrantRef = useRef(onGrant);
  onGrantRef.current = onGrant;
  const shares = yields !== undefined;
  const yieldsRef = useRef(!!yields);
  yieldsRef.current = !!yields;
  const holderRef = useRef<Holder | null>(null);
  /** Scène propre à cet échiquier (sans pool, ou pool tenu par un échiquier qui ne cède pas) : détruite au démontage. */
  const ownRef = useRef<VfxStage | null>(null);
  useEffect(() => {
    if (!wrap) return;
    let dead = false;
    const show = (v: Vfx | null) => {
      if (dead) return;
      nowRef.current = v;
      if (onGrantRef.current) onGrantRef.current(v);
      else setVfx(v);
    };
    const h: Holder = { wrap, orientation, yields: yieldsRef.current, shares, grant: show };
    holderRef.current = h;
    void load().then(
      m => {
        if (dead) return;
        setReady(true);
        const own = poolKey ? request(poolKey, m, h) : create(m, wrap, orientation);
        if (!own) return;
        ownRef.current = own;
        show({ stage: own, m });
      },
      // Module des effets introuvable (réseau) : pas de scène pour cet échiquier, ses sorts se jouent sans (l'état est
      // appliqué sans mise en scène). Seul l'échec du chargement est attendu ici : une erreur levée en créant ou en
      // passant la scène reste un rejet non traité, visible dans la console, comme avant.
      () => undefined,
    );
    return () => {
      show(null);
      dead = true;
      holderRef.current = null;
      setReady(false);
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
    h.yields = !!yields;
    if (yields) return;
    const slot = slots.get(poolKey);
    if (ownRef.current || !slot) return;
    const own = claim(poolKey, slot.m, h);
    if (own) {
      ownRef.current = own;
      h.grant({ stage: own, m: slot.m });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yields]);
  return { vfx, ready, now: nowRef };
}
