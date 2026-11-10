// Boutique : le Bazar céleste, devenu une cabine d'essayage. On compose sa panoplie (roi, échiquier, sorts) en touchant
// des cartes dessinées, on la voit tout de suite (le roi en portrait, puis en partie avec ses sorts), et l'on achète
// puis équipe d'un seul geste. Les collections assorties ajoutent une exclusivité : le sceau de collection.
// Composants dans pages/shop/ (cabine, rayons, cartes, déballage…) ; état de la page ici : essai, rayon, vue, adresse,
// retour du paiement. Rien ne donne d'avantage en partie.
// Adresses : /boutique?essai=king:braise,board:ruby (essai, partageable), ?rayon=rois|echiquiers|sorts|collections,
// ?objet=skin:inferno (ancienne adresse : essaie l'objet et ouvre son rayon), #grimoires (rayon Collections),
// ?achat=<session> (retour de Stripe), ?annule=1 (paiement annulé, l'essai est gardé).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ITEMS, formatPrice, itemById, unitPrice } from '../../shared/catalog';
import type { Collection, ItemKind, Product } from '../../shared/catalog';
import type { ConfirmResponse, MeUser } from '../../shared/protocol';
import { api, errMsg } from '../api';
import { isEquipped, owns } from '../skins';
import { useApp } from '../store';
import { PageHead, PlacePage, StarMark, useTitle } from './PageScene';
import { Cabin } from './shop/Cabin';
import type { CabinView } from './shop/Cabin';
import { CheckoutModal, DELIVERY_KEY } from './shop/CheckoutModal';
import type { Order } from './shop/CheckoutModal';
import { CollectionCard, GrimoireCard, TresorBanner } from './shop/CollectionCard';
import { ItemCard } from './shop/ItemCard';
import { PanoplieBar } from './shop/PanoplieBar';
import { Rack } from './shop/Rack';
import { RAYONS, RayonTabs } from './shop/RayonTabs';
import type { Rayon } from './shop/RayonTabs';
import { ShopDock } from './shop/ShopDock';
import { Seal, ShopPromise } from './shop/ShopPromise';
import { TrialAction, actionTexts } from './shop/TrialAction';
import { PACKS, PREMIUM_COLLECTIONS, bestCollection, formatEssai, itemPhrase, itemState, mainAction, parseEssai, quoteTrial } from './shop/trial';
import type { CollectionHint, TrialDelta } from './shop/trial';
import { storedTrial, useShopUrl, useTrial } from './shop/useTrial';
import './shop/shop.css';

const KIND_RAYON: Record<ItemKind, Rayon> = { king: 'rois', board: 'echiquiers', skin: 'sorts' };
const RAYON_KIND: Record<Exclude<Rayon, 'collections'>, ItemKind> = { rois: 'king', echiquiers: 'board', sorts: 'skin' };
/** Roi mis en essai à l'arrivée, quand rien d'autre n'est demandé. */
const FEATURED: TrialDelta = { king: 'king:braise' };
const GRIMOIRE = PACKS.find(p => p.id === 'pack:skins');
const TRESOR = PACKS.find(p => p.id === 'pack:tresor');

/** Arrivée : essai, rayon et vue d'après l'adresse (lue une fois). */
function arrival() {
  const q = new URLSearchParams(window.location.search);
  const objet = itemById(q.get('objet') ?? '');
  const fromUrl = parseEssai(q.get('essai'));
  let delta: TrialDelta;
  if (Object.keys(fromUrl).length) delta = fromUrl;
  else if (objet) delta = { [objet.kind]: objet.id };
  else {
    const stored = storedTrial();
    delta = Object.keys(stored).length ? stored : q.get('achat') ? {} : FEATURED;
  }
  const r = q.get('rayon') as Rayon | null;
  const rayon: Rayon =
    r && RAYONS.includes(r) ? r : window.location.hash === '#grimoires' ? 'collections' : objet ? KIND_RAYON[objet.kind] : 'rois';
  const view: CabinView = objet && objet.kind !== 'king' ? 'partie' : 'roi';
  return { delta, rayon, view, achat: q.get('achat'), annule: !!q.get('annule') };
}

export default function Shop() {
  useTitle('Boutique');
  const { me, setMe, toast, payments, ready } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [start] = useState(arrival);
  const t = useTrial(me, () => start.delta);
  const [rayon, setRayon] = useState<Rayon>(start.rayon);
  const [view, setView] = useState<CabinView>(start.view);
  const [mine, setMine] = useState(false);
  const [spellKick, setSpellKick] = useState(0);
  const [order, setOrder] = useState<{ order: Order; equipOwned: string[] } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [unbox, setUnbox] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [casting, setCasting] = useState(false);
  const [lastTried, setLastTried] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const cabinRef = useRef<HTMLDivElement>(null);

  const loggedIn = !!me;
  const sale = payments !== 'off' && ready;
  const quote = useMemo(() => quoteTrial(t.trial, t.pano, t.owned), [t.trial, t.pano, t.owned]);
  const action = useMemo(() => mainAction(quote, { loggedIn, sale }), [quote, loggedIn, sale]);
  const hint = useMemo(() => bestCollection(t.trial, t.pano, t.owned), [t.trial, t.pano, t.owned]);

  useShopUrl(rayon, t.delta, confirming);

  // ---------------------------------------------------------------------------------------------
  // Livraison (retour de Stripe, paiement simulé) : déballage, essai = objets livrés, message

  const deliver = useCallback(
    async (items: string[], user: MeUser) => {
      setMe(user);
      const known = items.filter(i => itemById(i));
      // Un objet par emplacement : il entre dans la cabine (s'il est équipé, l'essai redevient la panoplie)
      const delta: TrialDelta = {};
      const many = new Set<ItemKind>();
      for (const id of known) {
        const k = itemById(id)!.kind;
        if (delta[k]) many.add(k);
        else delta[k] = id;
      }
      for (const k of many) delete delta[k];
      t.set(delta);
      setView(known.some(i => itemById(i)?.kind === 'king') ? 'roi' : 'partie');
      setUnbox(known);
      const worn = known.filter(i => isEquipped(user, i));
      let msg: string;
      if (worn.length > 1) msg = 'Panoplie équipée : vos adversaires verront votre roi et vos sorts.';
      else if (worn.length === 1) msg = equippedMessage(worn[0]);
      else if (known.length === 1) msg = `Merci ! ${itemPhrase(itemById(known[0])!)} est dans votre collection.`;
      else msg = `Merci ! ${known.length} skins ajoutés à votre collection.`;
      if (worn.some(i => itemById(i)?.kind === 'king') && (await gameInProgress())) msg += ' Votre nouveau roi vous attend à la prochaine partie.';
      toast(msg, 'success');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setMe, toast],
  );

  // Retour de Stripe (?achat=<session>) : on vérifie le paiement sans attendre le webhook
  useEffect(() => {
    if (start.annule) toast('Paiement annulé : aucun montant n’a été débité. Votre essai est gardé.');
    if (!start.achat || !ready) return;
    if (!me) return;
    setConfirming(true);
    api<ConfirmResponse>(`/shop/confirm/${encodeURIComponent(start.achat)}`)
      .then(r => {
        if (r.status === 'paid') void deliver(r.items ?? readDelivery(), r.user);
        else {
          setMe(r.user);
          toast('Paiement en cours de validation : il apparaîtra d’ici quelques instants.');
        }
      })
      .catch(e => toast(errMsg(e), 'error'))
      .finally(() => {
        setConfirming(false);
        clearDelivery();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Paiement simulé réussi (mode démo) : la page de démo revient ici avec les objets livrés
  useEffect(() => {
    const st = location.state as { livre?: string[]; user?: MeUser } | null;
    if (!st?.livre || !st.user) return;
    void deliver(st.livre, st.user);
    clearDelivery();
    window.history.replaceState({ ...window.history.state, usr: null }, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ancre #grimoires : le rayon Collections, à l'écran
  useEffect(() => {
    if (window.location.hash !== '#grimoires') return;
    const tm = window.setTimeout(() => document.getElementById('rayons')?.scrollIntoView({ block: 'start' }), 120);
    return () => window.clearTimeout(tm);
  }, []);

  // ---------------------------------------------------------------------------------------------
  // Gestes

  const tryItem = (id: string) => {
    const it = itemById(id);
    if (!it) return;
    const on = t.trial[it.kind] !== id || t.pano[it.kind] === id;
    t.tryItem(id);
    setLastTried(on ? id : null);
    if (it.kind === 'king') setView('roi');
    else setView('partie');
    if (it.kind === 'skin' && on) setSpellKick(n => n + 1);
  };

  const tryCollection = (c: Collection) => {
    t.tryCollection(c);
    setLastTried(c.id);
    setView('partie');
    setSpellKick(n => n + 1);
  };

  const onHint = (h: CollectionHint) => tryCollection(h.collection);

  const surprise = () => {
    t.surprise();
    setLastTried(null);
    setView('partie');
    setSpellKick(n => n + 1);
  };

  const openSlot = (k: ItemKind) => {
    setRayon(KIND_RAYON[k]);
    setView(k === 'king' ? 'roi' : 'partie');
  };

  const signup = () => {
    const essai = formatEssai(t.delta);
    navigate(`/inscription?retour=${encodeURIComponent(`/boutique${essai ? `?essai=${essai}` : ''}`)}`);
  };

  const equip = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(ids.join(','));
    try {
      const r = await api<{ user: MeUser }>('/account/equip', { body: ids.length === 1 ? { itemId: ids[0] } : { itemIds: ids } });
      setMe(r.user);
      let msg = ids.length > 1 ? 'Panoplie équipée : vos adversaires verront votre roi et vos sorts.' : equippedMessage(ids[0]);
      if (ids.some(i => itemById(i)?.kind === 'king') && (await gameInProgress())) msg += ' Votre nouveau roi vous attend à la prochaine partie.';
      toast(msg, 'success');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const buy = (p: Product) => {
    if (!me) return signup();
    setOrder({ order: { kind: 'product', product: p }, equipOwned: [] });
  };

  const onMain = () => {
    if (action.kind === 'equip') void equip(action.ids);
    else if (action.kind === 'buy') setOrder({ order: { kind: 'cart', itemIds: action.ids }, equipOwned: quote.equip });
    else if (action.kind === 'signup') signup();
  };

  const backToCabin = () => cabinRef.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });

  // ---------------------------------------------------------------------------------------------
  // Affichage

  const ownedCount = ITEMS.filter(i => owns(me, i.id)).length;
  const counts = { rois: 0, echiquiers: 0, sorts: 0, collections: PREMIUM_COLLECTIONS.length } as Record<Rayon, number>;
  for (const i of ITEMS) counts[KIND_RAYON[i.kind]]++;
  const live = liveText(lastTried, quote, action);
  const onCasting = useCallback((on: boolean) => setCasting(on), []);

  const rack = () => {
    if (rayon === 'collections') {
      const list = PREMIUM_COLLECTIONS.filter(c => !mine || [c.king, c.board, c.skin].some(i => t.owned.includes(i)));
      return (
        <Rack rayon="collections" empty={list.length ? undefined : <EmptyMine />}>
          {list.map(c => (
            <CollectionCard
              key={c.id}
              c={c}
              owned={t.owned}
              loggedIn={loggedIn}
              sale={sale}
              ready={ready}
              trying={t.trial.king === c.king && t.trial.board === c.board && t.trial.skin === c.skin}
              onTry={tryCollection}
              onBuy={buy}
            />
          ))}
        </Rack>
      );
    }
    const kind = RAYON_KIND[rayon];
    const list = ITEMS.filter(i => i.kind === kind && (!mine || t.owned.includes(i.id)));
    return (
      <Rack rayon={rayon} empty={list.length ? undefined : <EmptyMine />}>
        {kind === 'skin' && GRIMOIRE && !mine && <GrimoireCard product={GRIMOIRE} owned={t.owned} loggedIn={loggedIn} sale={sale} ready={ready} onBuy={buy} />}
        {list.map(i => {
          const state = itemState(i.id, t.pano, t.owned);
          return (
            <ItemCard
              key={i.id}
              id={i.id}
              state={state}
              trying={t.trial[i.kind] === i.id && t.pano[i.kind] !== i.id}
              canEquip={loggedIn && (state === 'owned' || state === 'free')}
              equipping={busy === i.id}
              onTry={tryItem}
              onEquip={id => void equip([id])}
            />
          );
        })}
      </Rack>
    );
  };

  return (
    <PlacePage place="bazar" className={`bz ${casting ? 'is-casting' : ''}`}>
      <header className={`bz-band ${loggedIn ? '' : 'is-guest'}`}>
        <PageHead
          num="V"
          place="Le Bazar céleste"
          aside="Boutique"
          title={
            <>
              Votre roi, votre échiquier, <em>vos sorts.</em>
            </>
          }
          lede={
            loggedIn
              ? 'Essayez tout dans la cabine, gratuitement. Des skins qui changent l’apparence, jamais la partie.'
              : 'Essayez tout librement. Un compte gratuit garde vos skins et les montre à vos adversaires.'
          }
        />
        <div className="bz-band-side">
          {loggedIn && (
            <span className="bz-count">
              <StarMark size={11} /> Ma collection : {ownedCount} sur {ITEMS.length}
            </span>
          )}
          <Seal />
        </div>
      </header>

      <div className="bz-main">
        <div className="bz-cabin" ref={cabinRef}>
          <Cabin
            view={view}
            onView={setView}
            trial={t.trial}
            spellKick={spellKick}
            reduced={reduced}
            soon={ready && payments === 'off'}
            confirming={confirming}
            unbox={unbox}
            onUnboxDone={() => setUnbox(null)}
            live={live}
            onCasting={onCasting}
          >
            <PanoplieBar trial={t.trial} pano={t.pano} owned={t.owned} loggedIn={loggedIn} onOpen={openSlot} onRevert={t.revert} />
            <div ref={setAnchor}>
              <TrialAction
                quote={quote}
                action={action}
                hint={hint}
                busy={!!busy && busy === (action.kind === 'equip' ? action.ids.join(',') : '')}
                waiting={!ready}
                demo={payments === 'demo'}
                onMain={onMain}
                onEquipOwned={() => void equip(quote.equip)}
                onRevertAll={() => {
                  t.revertAll();
                  setLastTried(null);
                }}
                onHint={onHint}
              />
            </div>
          </Cabin>
        </div>

        <section className="bz-rayons" id="rayons" aria-label="Rayons">
          <RayonTabs rayon={rayon} counts={counts} onRayon={setRayon} mine={loggedIn ? mine : null} onMine={setMine} onSurprise={surprise} />
          {rack()}
        </section>
      </div>

      <section className="bz-colls" aria-labelledby="bz-colls-t">
        <PageHead
          as="h2"
          place="Les collections"
          aside={`${PREMIUM_COLLECTIONS.length} panoplies`}
          title={
            <span id="bz-colls-t">
              Tout assorti, <em>en un geste.</em>
            </span>
          }
          lede="Un roi, un échiquier et des sorts qui vont ensemble, et le sceau de la collection à côté de votre pseudo : on ne le trouve nulle part ailleurs."
        />
        <div className="bz-colls-grid">
          {PREMIUM_COLLECTIONS.map(c => (
            <CollectionCard
              key={c.id}
              c={c}
              large
              owned={t.owned}
              loggedIn={loggedIn}
              sale={sale}
              ready={ready}
              trying={t.trial.king === c.king && t.trial.board === c.board && t.trial.skin === c.skin}
              onTry={c2 => {
                tryCollection(c2);
                backToCabin();
              }}
              onBuy={buy}
            />
          ))}
        </div>
      </section>
      {TRESOR && <TresorBanner product={TRESOR} owned={t.owned} loggedIn={loggedIn} sale={sale} ready={ready} onBuy={buy} />}

      <ShopPromise />

      <ShopDock anchor={anchor} trial={t.trial} quote={quote} action={action} busy={!!busy} waiting={!ready} onMain={onMain} onBack={backToCabin} />

      {order && (
        <CheckoutModal
          order={order.order}
          owned={t.owned}
          demo={payments === 'demo'}
          equipOwned={order.equipOwned}
          onEquipped={setMe}
          onClose={() => setOrder(null)}
        />
      )}
    </PlacePage>
  );
}

function EmptyMine() {
  return <p className="rack-empty">Rien de ce rayon dans votre collection pour l’instant. Touchez « Tout » pour tout essayer.</p>;
}

/** Message après équipement d'un objet. */
function equippedMessage(id: string): string {
  const it = itemById(id);
  if (!it) return 'Équipé.';
  if (it.kind === 'king') return `${it.name} équipé. Vos adversaires le verront dès votre prochaine partie.`;
  if (it.kind === 'board') return `Échiquier ${it.name} équipé : il vous suit dans toutes vos parties.`;
  return `Sorts ${it.name} équipés : vos adversaires les verront à chacun de vos sorts.`;
}

/** Une partie est-elle en cours (le roi est pris à l'assise : le nouveau vaut pour la suivante) ? */
async function gameInProgress(): Promise<boolean> {
  try {
    const r = await api<{ games: { status: string }[] }>('/games/mine');
    return r.games.some(g => g.status !== 'ended');
  } catch {
    return false;
  }
}

/** Objets attendus au retour du paiement (gardés avant de partir payer). */
function readDelivery(): string[] {
  try {
    return (JSON.parse(sessionStorage.getItem(DELIVERY_KEY) ?? '{}') as { items?: string[] }).items ?? [];
  } catch {
    return [];
  }
}
function clearDelivery() {
  try {
    sessionStorage.removeItem(DELIVERY_KEY);
  } catch {
    // stockage indisponible
  }
}

/** Annonce de la zone aria-live : « Roi de braise en essai, 2,99 €. Essai : 2 skins à acheter, 4,98 €. » */
function liveText(lastTried: string | null, q: ReturnType<typeof quoteTrial>, a: ReturnType<typeof mainAction>): string {
  const t = actionTexts(q, a);
  const it = lastTried ? itemById(lastTried) : undefined;
  const first = it ? `${itemPhrase(it)} en essai${!it.free ? `, ${formatPrice(unitPrice(it.id))}` : ''}. ` : '';
  const total = q.cart ? `, ${formatPrice(q.cart.totalCents)}` : '';
  return `${first}${a.kind === 'none' ? 'Votre panoplie actuelle.' : `Essai : ${t.line}${total}.`}`;
}
