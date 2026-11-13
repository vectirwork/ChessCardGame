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
import {
  ITEMS, PACKS, PREMIUM_COLLECTIONS, SHOP_FEATURED, SLOTS, SLOT_DEFS, alone, bySlot, collectionById, collectionItems, equippedMessage,
  formatPrice, itemById, itemLabel, unitPrice,
} from '../../shared/catalog';
import type { Collection, ItemKind, Product } from '../../shared/catalog';
import type { ConfirmResponse, MeUser } from '../../shared/protocol';
import { api, errMsg } from '../api';
import { isEquipped, owns } from '../skins';
import { useApp, useFeature } from '../store';
import { PageHead, PlacePage, StarMark, useTitle } from './PageScene';
import { Cabin } from './shop/Cabin';
import type { CabinView } from './shop/Cabin';
import { CheckoutModal, DELIVERY_KEY } from './shop/CheckoutModal';
import type { Delivery } from './shop/CheckoutModal';
import { CollectionCard, PackCard, TresorBanner } from './shop/CollectionCard';
import { ItemCard } from './shop/ItemCard';
import { PanoplieBar } from './shop/PanoplieBar';
import { Rack } from './shop/Rack';
import { RAYONS, RayonTabs, kindOfRayon, rayonOf } from './shop/RayonTabs';
import type { Rayon } from './shop/RayonTabs';
import { ShopDock } from './shop/ShopDock';
import { Seal, ShopPromise } from './shop/ShopPromise';
import { TrialAction, actionTexts } from './shop/TrialAction';
import {
  bestCollection, equipNote, formatEssai, isTrying, itemState, mainAction, parseEssai, quoteTrial, rackOrder, withCollection,
} from './shop/trial';
import type { CollectionHint, Order, TrialDelta } from './shop/trial';
import { hasStoredTrial, storedTrial, useShopUrl, useTrial } from './shop/useTrial';
import './shop/shop.css';

/** Packs en bandeau, sous les collections (le Trésor du Bazar). Les autres packs ont leur carte en tête d'un rayon. */
const BANNERS = PACKS.filter(p => p.display === 'banner');

/** Arrivée : essai, rayon et vue d'après l'adresse (lue une fois). */
function arrival() {
  const q = new URLSearchParams(window.location.search);
  const objet = itemById(q.get('objet') ?? '');
  const fromUrl = parseEssai(q.get('essai'));
  let delta: TrialDelta;
  if (Object.keys(fromUrl).length) delta = fromUrl;
  else if (objet) delta = { [objet.kind]: objet.id };
  else {
    // Un essai déjà gardé dans la session, même vide (« Rétablir »), est repris tel quel
    const stored = storedTrial();
    // Objet mis en essai à la première arrivée de la session, quand rien d'autre n'est demandé (SHOP_FEATURED)
    delta = Object.keys(stored).length ? stored : q.get('achat') || hasStoredTrial() ? {} : { ...SHOP_FEATURED };
  }
  const r = q.get('rayon') as Rayon | null;
  const rayon: Rayon = r && RAYONS.includes(r) ? r : window.location.hash === '#grimoires' ? 'collections' : objet ? rayonOf(objet.kind) : RAYONS[0];
  const view: CabinView = objet ? SLOT_DEFS[objet.kind].view : 'roi';
  return { delta, rayon, view, achat: q.get('achat'), annule: !!q.get('annule') };
}

/** Requête média suivie (rotation, fenêtre redimensionnée). */
function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const change = () => setOn(m.matches);
    change();
    m.addEventListener('change', change);
    return () => m.removeEventListener('change', change);
  }, [query]);
  return on;
}

export default function Shop() {
  useTitle('Boutique');
  return useFeature('shop') ? <Bazar /> : <ShopClosed />;
}

/** Boutique coupée (FEATURE_SHOP=0) : la page reste, sans rayons ni prix. */
function ShopClosed() {
  return (
    <PlacePage place="bazar" className="bz">
      <PageHead
        num="V"
        place="Le Bazar céleste"
        aside="Boutique"
        title={<>La boutique est fermée.</>}
        lede="Elle rouvrira bientôt. Vos skins restent dans votre collection et s’équipent depuis votre compte."
      />
    </PlacePage>
  );
}

function Bazar() {
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
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Téléphone : la ligne d'action passe sous le portant (la barre fixe porte le même bouton), pour que la vue de la
  // cabine et le portant tiennent ensemble à l'écran
  const phone = useMedia('(max-width: 700px)');
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
    async (items: string[], user: MeUser, equipOwned: readonly string[] = []) => {
      // Objets déjà possédés de l'essai, équipés avec l'achat (case cochée au récapitulatif) : maintenant qu'il est livré
      let u = user;
      const extra = equipOwned.filter(i => owns(u, i) && !isEquipped(u, i));
      if (extra.length) {
        try {
          u = (await api<{ user: MeUser }>('/account/equip', { body: extra.length === 1 ? { itemId: extra[0] } : { itemIds: extra } })).user;
        } catch {
          // l'achat est livré ; ces objets s'équipent ensuite d'un geste
        }
      }
      setMe(u);
      const sel = bySlot(items);
      const known = sel.items.map(i => i.id);
      // L'objet seul de son emplacement entre dans la cabine (s'il est équipé, l'essai redevient la panoplie)
      const delta: TrialDelta = {};
      for (const k of SLOTS) {
        const it = alone(sel, k);
        if (it) delta[k] = it.id;
      }
      t.set(delta);
      setView(sel.items.some(i => SLOT_DEFS[i.kind].view === 'roi') ? 'roi' : 'partie');
      setUnbox(known);
      const worn = [...known, ...extra].filter(i => isEquipped(u, i));
      let msg: string;
      if (worn.length > 1) msg = `Panoplie équipée : ${equipNote(worn)}.`;
      else if (worn.length === 1) msg = equipped(worn[0]);
      else if (known.length === 1) msg = `Merci ! ${itemLabel(sel.items[0])} est dans votre collection.`;
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
    const d = readDelivery();
    api<ConfirmResponse>(`/shop/confirm/${encodeURIComponent(start.achat)}`)
      .then(r => {
        if (r.status === 'paid') void deliver(r.items ?? d.items, r.user, d.equipOwned);
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
    void deliver(st.livre, st.user, readDelivery().equipOwned);
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
    setView(SLOT_DEFS[it.kind].view);
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
    setRayon(rayonOf(k));
    setView(SLOT_DEFS[k].view);
  };

  /** Inscription, puis retour à la boutique avec cet essai et ce rayon. */
  const signup = (delta: TrialDelta = t.delta, to: Rayon = rayon) => {
    const q: string[] = [];
    if (to !== RAYONS[0]) q.push(`rayon=${to}`);
    const essai = formatEssai(delta);
    if (essai) q.push(`essai=${essai}`);
    navigate(`/inscription?retour=${encodeURIComponent(`/boutique${q.length ? `?${q.join('&')}` : ''}`)}`);
  };

  const equip = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(ids.join(','));
    try {
      const r = await api<{ user: MeUser }>('/account/equip', { body: ids.length === 1 ? { itemId: ids[0] } : { itemIds: ids } });
      setMe(r.user);
      let msg = ids.length > 1 ? `Panoplie équipée : ${equipNote(ids)}.` : equipped(ids[0]);
      if (ids.some(i => itemById(i)?.kind === 'king') && (await gameInProgress())) msg += ' Votre nouveau roi vous attend à la prochaine partie.';
      toast(msg, 'success');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const buy = (p: Product) => {
    const c = p.kind === 'collection' ? collectionById(p.id) : undefined;
    if (!me) {
      // Visiteur : on revient de l'inscription avec ce qu'il voulait acheter (la collection en essai, son rayon)
      if (c) return signup(withCollection(t.delta, t.pano, c), 'collections');
      // Pack en tête d'un rayon : on revient sur ce rayon
      return signup(t.delta, p.display && p.display !== 'banner' ? rayonOf(p.display) : rayon);
    }
    // Collection complétée : les pièces déjà possédées sont équipées avec les nouvelles (à la livraison, case cochée)
    const equipOwned = c ? p.items.filter(i => owns(me, i) && !isEquipped(me, i)) : [];
    setOrder({ order: { kind: 'product', product: p }, equipOwned });
  };

  const onMain = () => {
    if (action.kind === 'equip') void equip(action.ids);
    else if (action.kind === 'buy') setOrder({ order: { kind: 'cart', itemIds: action.ids }, equipOwned: quote.equip });
    else if (action.kind === 'signup') signup();
  };

  const onUnboxDone = useCallback(() => setUnbox(null), []);

  const backToCabin = () => cabinRef.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });

  // ---------------------------------------------------------------------------------------------
  // Affichage

  // Objets montrés : ceux des rayons, plus un objet retiré que l'on possède
  const shown = ITEMS.filter(i => !i.retired || owns(me, i.id));
  const ownedCount = shown.filter(i => owns(me, i.id)).length;
  const counts = Object.fromEntries(RAYONS.map(r => [r, 0])) as Record<Rayon, number>;
  counts.collections = PREMIUM_COLLECTIONS.length;
  for (const i of shown) counts[rayonOf(i.kind)]++;
  const live = liveText(lastTried, quote, action);
  const onCasting = useCallback((on: boolean) => setCasting(on), []);

  // Ligne d'action : dans la cabine, ou sous le portant sur téléphone. La barre fixe observe ses boutons.
  const trialAction = (
    <TrialAction
      quote={quote}
      action={action}
      hint={hint}
      busy={!!busy && busy === (action.kind === 'equip' ? action.ids.join(',') : '')}
      waiting={!ready}
      demo={payments === 'demo'}
      loggedIn={loggedIn}
      btnsRef={setAnchor}
      onMain={onMain}
      onEquipOwned={() => void equip(quote.equip)}
      onRevertAll={() => {
        t.revertAll();
        setLastTried(null);
      }}
      onHint={onHint}
    />
  );

  const rack = () => {
    if (rayon === 'collections') {
      const list = PREMIUM_COLLECTIONS.filter(c => !mine || collectionItems(c).some(i => t.owned.includes(i)));
      return (
        <Rack key="collections" rayon="collections" empty={list.length ? undefined : <EmptyMine />}>
          {list.map(c => (
            <CollectionCard
              key={c.id}
              c={c}
              owned={t.owned}
              loggedIn={loggedIn}
              sale={sale}
              ready={ready}
              trying={isTrying(t.trial, c)}
              onTry={tryCollection}
              onBuy={buy}
            />
          ))}
        </Rack>
      );
    }
    const kind = kindOfRayon(rayon)!;
    const list = rackOrder(shown.filter(i => i.kind === kind && (!mine || t.owned.includes(i.id))));
    return (
      // Une clé par rayon : le portant repart du début (son défilement horizontal n'est pas celui du rayon d'avant)
      <Rack key={rayon} rayon={rayon} empty={list.length ? undefined : <EmptyMine />}>
        {!mine &&
          PACKS.filter(p => p.display === kind).map(p => (
            <PackCard key={p.id} product={p} owned={t.owned} loggedIn={loggedIn} sale={sale} ready={ready} onBuy={buy} />
          ))}
        {list.map(i => {
          // Visiteur : la panoplie Arcane n'est « équipée » sur aucun compte ; ses objets sont offerts à tous
          const raw = itemState(i.id, t.pano, t.owned);
          const state = !loggedIn && raw === 'equipped' ? 'free' : raw;
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
            onUnboxDone={onUnboxDone}
            live={live}
            onCasting={onCasting}
            onSurprise={surprise}
          >
            <PanoplieBar trial={t.trial} pano={t.pano} owned={t.owned} loggedIn={loggedIn} onOpen={openSlot} onRevert={t.revert} />
            {!phone && trialAction}
          </Cabin>
        </div>

        <section className="bz-rayons" id="rayons" aria-label="Rayons">
          <RayonTabs rayon={rayon} counts={counts} onRayon={setRayon} mine={loggedIn ? mine : null} onMine={setMine} onSurprise={surprise} />
          {rack()}
        </section>
        {phone && <div className="bz-act">{trialAction}</div>}
      </div>

      {/* Vitrine des collections (ordinateur) : inutile quand le rayon Collections est ouvert juste au-dessus */}
      {rayon !== 'collections' && (
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
                trying={isTrying(t.trial, c)}
                onTry={c2 => {
                  tryCollection(c2);
                  backToCabin();
                }}
                onBuy={buy}
              />
            ))}
          </div>
        </section>
      )}
      {BANNERS.map(p => (
        <TresorBanner key={p.id} product={p} owned={t.owned} loggedIn={loggedIn} sale={sale} ready={ready} onBuy={buy} />
      ))}

      <ShopPromise />

      <ShopDock anchor={anchor} trial={t.trial} quote={quote} action={action} busy={!!busy} waiting={!ready} onMain={onMain} onBack={backToCabin} />

      {order && (
        <CheckoutModal
          order={order.order}
          owned={t.owned}
          demo={payments === 'demo'}
          equipOwned={order.equipOwned}
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
function equipped(id: string): string {
  const it = itemById(id);
  return it ? equippedMessage(it) : 'Équipé.';
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

/** Livraison attendue au retour du paiement (gardée avant de partir payer). */
function readDelivery(): Delivery {
  try {
    const d = JSON.parse(sessionStorage.getItem(DELIVERY_KEY) ?? '{}') as Partial<Delivery>;
    return { items: d.items ?? [], equip: !!d.equip, equipOwned: d.equip ? (d.equipOwned ?? []) : [] };
  } catch {
    return { items: [], equip: false, equipOwned: [] };
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
  const first = it ? `${itemLabel(it)} en essai${!it.free ? `, ${formatPrice(unitPrice(it.id))}` : ''}. ` : '';
  const total = q.cart ? `, ${formatPrice(q.cart.totalCents)}` : '';
  return `${first}${a.kind === 'none' ? 'Votre panoplie actuelle.' : `Essai : ${t.line}${total}.`}`;
}
