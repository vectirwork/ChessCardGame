// Boutique : le Bazar céleste. Skins d'animation (lanternes), plateaux (carreaux posés sur l'étal), packs (grimoires).
// L'échiquier de la vitrine lance de vrais sorts avec le skin choisi, sur le plateau choisi. Paiement par Stripe
// Checkout ; en mode démo, une page simulée (/boutique/demo/:id) le remplace. Rien ne donne d'avantage en partie.
// Liens utiles : /boutique?objet=skin:inferno présélectionne un objet, /boutique#grimoires mène aux packs.
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fromFen } from '../../shared/chess';
import { ITEMS, Item, PRODUCTS, Product, boardStyle, formatPrice, itemById } from '../../shared/catalog';
import type { MeUser } from '../../shared/protocol';
import { api, errMsg } from '../api';
import { Board } from '../components/Board';
import { Modal, Spinner } from '../components/Layout';
import { useApp } from '../store';
import { PageHead, PlacePage, StarMark, useTitle } from './PageScene';

const DemoBoard = lazy(() => import('../components/DemoBoard').then(m => ({ default: m.DemoBoard })));

const SKINS = ITEMS.filter(i => i.kind === 'skin');
const BOARDS = ITEMS.filter(i => i.kind === 'board');
const PACKS = PRODUCTS.filter(p => p.id.startsWith('pack:'));
/** Même position que l'aperçu de DemoBoard : le passage de l'échiquier immobile au vrai sort ne se voit pas. */
const PREVIEW_FEN = 'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP2BPPP/2BQK2R w K - 0 9';
const KIND_LABEL: Record<Item['kind'], string> = { skin: 'Skin d’animation', board: 'Plateau' };

const productOf = (itemId: string) => PRODUCTS.find(p => p.id === itemId) ?? PRODUCTS.find(p => p.items.length === 1 && p.items[0] === itemId);
const packsWith = (itemId: string) => PACKS.filter(p => p.items.includes(itemId));

export default function Shop() {
  useTitle('Boutique');
  const { me, setMe, toast, payments, ready } = useApp();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const initial = itemById(params.get('objet') ?? '');
  const [skinPick, setSkinPick] = useState(initial?.kind === 'skin' ? initial.id : 'skin:inferno');
  const [boardPick, setBoardPick] = useState(initial?.kind === 'board' ? initial.id : 'board:obsidian');
  const [focus, setFocus] = useState<string>(initial?.id ?? 'skin:inferno');
  const [buying, setBuying] = useState<Product | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Le vrai sort (scène 3D) n'est créé qu'au repos après l'ouverture, ou au premier choix d'un skin
  const [live, setLive] = useState(false);
  const [caption, setCaption] = useState('');
  const [equipping, setEquipping] = useState<string | null>(null);

  useEffect(() => {
    if (reduced) return;
    type IdleWin = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const w = window as IdleWin;
    let idle = 0;
    const t = window.setTimeout(() => {
      if (w.requestIdleCallback) idle = w.requestIdleCallback(() => setLive(true), { timeout: 2500 });
      else setLive(true);
    }, 1600);
    return () => {
      window.clearTimeout(t);
      if (idle) w.cancelIdleCallback?.(idle);
    };
  }, [reduced]);

  // Retour de Stripe Checkout (?achat=<session>) ou paiement annulé (?annule=1)
  useEffect(() => {
    const sid = params.get('achat');
    if (params.get('annule')) {
      toast('Paiement annulé : aucun montant n’a été débité.');
      setParams({}, { replace: true });
    }
    if (!sid || !me) return;
    setConfirming(true);
    api<{ status: string; user: MeUser }>(`/shop/confirm/${encodeURIComponent(sid)}`)
      .then(r => {
        setMe(r.user);
        if (r.status === 'paid') toast('Merci ! Votre achat est disponible dans votre collection.', 'success');
        else toast('Paiement en cours de validation : il apparaîtra d’ici quelques instants.');
      })
      .catch(e => toast(errMsg(e), 'error'))
      .finally(() => {
        setConfirming(false);
        setParams({}, { replace: true });
      });
  }, [params, me, setMe, toast, setParams]);

  // Ancre #grimoires (lien depuis l'accueil)
  useEffect(() => {
    if (window.location.hash === '#grimoires') document.getElementById('grimoires')?.scrollIntoView();
  }, []);

  const owned = (id: string) => !!itemById(id)?.free || !!me?.items.includes(id);
  const equipped = (id: string) => (me ? me.equippedSkin === id || me.equippedBoard === id : id === 'skin:arcane' || id === 'board:arcane');

  const equip = async (id: string) => {
    setEquipping(id);
    try {
      const r = await api<{ user: MeUser }>('/account/equip', { body: { itemId: id } });
      setMe(r.user);
      toast(`${itemById(id)?.name} équipé : vos adversaires le verront.`, 'success');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setEquipping(null);
    }
  };

  const buy = (product: Product) => {
    if (!me) {
      const back = product.id.startsWith('pack:') ? '/boutique#grimoires' : `/boutique?objet=${product.id}`;
      navigate(`/inscription?retour=${encodeURIComponent(back)}`);
      return;
    }
    setBuying(product);
  };

  const pickSkin = (id: string) => {
    setSkinPick(id);
    setFocus(id);
    setLive(true);
  };
  const pickBoard = (id: string) => {
    setBoardPick(id);
    setFocus(id);
  };

  const item = itemById(focus)!;
  const skin = itemById(skinPick)!.skin!;
  const sale = payments !== 'off' && ready;
  const ownedCount = me ? ITEMS.filter(i => !i.free && me.items.includes(i.id)).length : 0;
  const premiumCount = ITEMS.filter(i => !i.free).length;

  return (
    <PlacePage place="bazar" className="bz">
      {confirming && (
        <div className="notice bz-notice" role="status">
          <Spinner /> Validation de votre paiement…
        </div>
      )}

      <section className="bz-vitrine" aria-label="Vitrine">
        <div className="bz-col">
          <div className="bz-head">
            <PageHead
              num="V"
              place="Le Bazar céleste"
              aside="Boutique"
              title={
                <>
                  Faites briller <em>vos sorts.</em>
                </>
              }
              lede="Des skins d’animation pour vos cartes et des plateaux, que vos adversaires voient aussi. De l’apparence, rien d’autre : toutes les cartes, tous les modes et le classement restent gratuits."
            />
            <Seal />
          </div>

          <div className="bz-shelf">
            <div className="bz-shelf-head">
              <span>Skins d’animation</span>
              <small>Allumez une lanterne : l’échiquier lance un sort avec ce skin</small>
            </div>
            <div className="bz-lanterns" role="group" aria-label="Skins d’animation">
              {SKINS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className={`bz-lantern ${skinPick === s.id ? 'on' : ''}`}
                  style={{ '--p': s.skin!.primary, '--s': s.skin!.secondary, '--a': s.skin!.accent, '--i': i } as CSSProperties}
                  onClick={() => pickSkin(s.id)}
                  aria-pressed={skinPick === s.id}
                  aria-label={`${s.name}, ${stateLabel(s.id)}`}
                >
                  <span className="bz-lantern-cord" />
                  <span className="bz-lantern-body">
                    <span className="bz-lantern-orb" />
                  </span>
                  <span className="bz-lantern-name">{s.name}</span>
                  <span className="bz-lantern-price">{stateLabel(s.id)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bz-shelf">
            <div className="bz-shelf-head">
              <span>Plateaux</span>
              <small>
                {itemById(boardPick)?.name} · {stateLabel(boardPick)}
              </small>
            </div>
            <div className="bz-stall">
              <div className="bz-swatches" role="group" aria-label="Plateaux">
                {BOARDS.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    className={`bz-swatch ${boardPick === b.id ? 'on' : ''}`}
                    style={{ '--l': b.board!.light, '--d': b.board!.dark, '--f': b.board!.frame } as CSSProperties}
                    onClick={() => pickBoard(b.id)}
                    aria-pressed={boardPick === b.id}
                    aria-label={`${b.name}, ${stateLabel(b.id)}`}
                    title={b.name}
                  >
                    <span className="bz-swatch-tile">
                      <span className="bz-swatch-grid" />
                    </span>
                  </button>
                ))}
              </div>
              <span className="bz-stall-shelf" />
            </div>
          </div>

          {fiche()}
        </div>

        <div className="bz-stage">
          <div className="bz-stage-glow" style={{ '--p': skin.primary, '--s': skin.secondary } as CSSProperties} />
          <div className="bz-board">
            {live ? (
              <Suspense fallback={<StillBoard theme={boardPick} />}>
                <DemoBoard key={skinPick} mode="preview" skin={skinPick} theme={boardPick} onCaption={setCaption} />
              </Suspense>
            ) : (
              <StillBoard theme={boardPick} />
            )}
            {!caption && <Sigil key={skinPick} skinId={skinPick} />}
          </div>
          <div className="bz-caption" aria-live="polite">
            {live ? (
              caption ? (
                <>
                  <span className="bz-dot" style={{ '--p': skin.primary } as CSSProperties} />
                  <span className="bz-cap-k">Sort en cours</span>
                  <b>{caption.split(' · ')[0]}</b>
                  <span className="bz-cap-skin">skin {itemById(skinPick)?.name}</span>
                </>
              ) : (
                <>
                  <span className="bz-dot idle" />
                  <span>Préparation du sort…</span>
                </>
              )
            ) : (
              <button type="button" className="bz-cap-play" onClick={() => setLive(true)}>
                <span className="bz-dot" style={{ '--p': skin.primary } as CSSProperties} />
                Voir un sort avec <b>{itemById(skinPick)?.name}</b>
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="bz-packs" id="grimoires" aria-labelledby="grimoires-t">
        <div className="bz-packs-head">
          <PageHead
            as="h2"
            place="Les grimoires"
            aside={`${PACKS.length} collections`}
            title={
              <span id="grimoires-t">
                Tout le Bazar, <em>en une fois.</em>
              </span>
            }
            lede="Les packs réunissent les skins et les plateaux premium à prix doux. Les skins à venir sont offerts aux détenteurs de la Collection légendaire."
          />
        </div>
        <div className="bz-pack-grid">
          {PACKS.map(p => {
            const all = p.items.every(owned);
            const some = !all && p.items.some(owned);
            const save = p.compareAtCents ? p.compareAtCents - p.priceCents : 0;
            return (
              <article key={p.id} className={`bz-pack panel ${p.id === 'pack:all' ? 'is-best' : ''}`}>
                <div className="bz-pack-top">
                  <span className="bz-pack-k">{p.items.length} objets</span>
                  {p.badge && <span className="badge gold">{p.badge}</span>}
                </div>
                <h3 className="bz-pack-name">{p.name}</h3>
                <p className="bz-pack-desc">{p.description}</p>
                <div className="bz-pack-items">
                  {p.items.map(id => {
                    const it = itemById(id)!;
                    return (
                      <span key={id} className={`bz-pack-chip ${owned(id) && me ? 'owned' : ''}`} title={it.name}>
                        <Swatch item={it} small />
                        <span>{it.name}</span>
                      </span>
                    );
                  })}
                </div>
                <div className="bz-pack-foot">
                  <div className="bz-price">
                    <b>{formatPrice(p.priceCents)}</b>
                    {p.compareAtCents && <s>{formatPrice(p.compareAtCents)}</s>}
                    {save > 0 && <small>soit {formatPrice(save)} d’économie</small>}
                  </div>
                  {all && me ? (
                    <span className="bz-state">Déjà dans votre collection</span>
                  ) : (
                    <button type="button" className="btn-gold sm" disabled={!sale} onClick={() => buy(p)}>
                      {sale ? 'Acheter le pack' : 'Bientôt disponible'}
                    </button>
                  )}
                </div>
                {some && me && <small className="bz-pack-note">Vous possédez déjà une partie de ce pack.</small>}
              </article>
            );
          })}
        </div>
      </section>

      <section className="bz-promise" aria-label="Nos engagements">
        <div>
          <span className="bz-promise-k">Aucun avantage</span>
          <p>Un skin change la façon dont vos sorts s’animent, jamais ce qu’ils font. Les parties classées restent équitables.</p>
        </div>
        <div>
          <span className="bz-promise-k">Visible de tous</span>
          <p>Votre skin et votre plateau sont montrés à vos adversaires, en ligne comme dans les parties en direct.</p>
        </div>
        <div>
          <span className="bz-promise-k">Livré à l’instant</span>
          <p>
            Paiement sécurisé par Stripe, contenu ajouté à votre compte dès la confirmation. Prix TTC. <Link to="/cgv">Conditions de vente</Link>
          </p>
        </div>
      </section>

      {me && (
        <p className="bz-collection-line">
          <StarMark size={12} /> Votre collection : {ownedCount} sur {premiumCount} objets premium · <Link to="/compte?onglet=collection">Gérer ma collection</Link>
        </p>
      )}

      {buying && <CheckoutModal product={buying} demo={payments === 'demo'} onClose={() => setBuying(null)} />}
    </PlacePage>
  );

  function stateLabel(id: string) {
    if (me && equipped(id)) return 'Équipé';
    if (me && owned(id)) return 'Possédé';
    const it = itemById(id);
    if (it?.free) return 'Offert';
    const p = productOf(id);
    return p ? formatPrice(p.priceCents) : '';
  }

  function fiche() {
    const product = productOf(item.id);
    const has = owned(item.id);
    const on = equipped(item.id);
    const packs = packsWith(item.id);
    const style = item.kind === 'skin' ? { '--p': item.skin!.primary, '--s': item.skin!.secondary, '--a': item.skin!.accent } : { '--p': boardStyle(item.id).light, '--s': boardStyle(item.id).dark, '--a': '#fff' };
    let action;
    if (me && has && on) action = <span className="bz-state on">Équipé</span>;
    else if (me && has)
      action = (
        <button type="button" className="btn-gold sm" onClick={() => void equip(item.id)} disabled={equipping === item.id}>
          {equipping === item.id ? <Spinner /> : 'Équiper'}
        </button>
      );
    else if (!me && item.free)
      action = on ? (
        <span className="bz-state">Par défaut</span>
      ) : (
        <Link to={`/inscription?retour=${encodeURIComponent(`/boutique?objet=${item.id}`)}`} className="btn btn-sm">
          Créer un compte pour l’équiper
        </Link>
      );
    else if (product)
      action = (
        <button type="button" className="btn-gold sm" disabled={!sale} onClick={() => buy(product)}>
          {sale ? `Acheter · ${formatPrice(product.priceCents)}` : 'Bientôt disponible'}
        </button>
      );
    return (
      <div className="bz-fiche panel" style={style as CSSProperties} aria-live="polite">
        <div className="bz-fiche-main">
          <span className="bz-fiche-k">
            {KIND_LABEL[item.kind]}
            {product?.badge && <span className="badge gold">{product.badge}</span>}
          </span>
          <b className="bz-fiche-name">{item.name}</b>
          <span className="bz-fiche-desc">{item.description}</span>
          {packs.length > 0 && !has && (
            <a className="bz-fiche-packs" href="#grimoires">
              Aussi dans {packs.map(p => p.name).join(' et ')}
            </a>
          )}
        </div>
        <div className="bz-fiche-side">
          <span className="bz-fiche-price">{has ? (item.free ? 'Offert' : 'Possédé') : product ? formatPrice(product.priceCents) : ''}</span>
          {action}
        </div>
        {payments === 'demo' && !has && (
          <p className="bz-demo">
            <span className="badge cyan">Démo</span> Paiements simulés : rien n’est débité.
          </p>
        )}
      </div>
    );
  }
}

/** Échiquier immobile (avant que la scène des sorts soit prête), même position que l'aperçu. */
function StillBoard({ theme }: { theme: string }) {
  const pos = useMemo(() => fromFen(PREVIEW_FEN).pos, []);
  return <Board pos={pos} orientation="w" theme={theme} locked coords={false} />;
}

/** Sceau du skin, en CSS : l'aperçu s'anime tout de suite, avant le vrai sort. */
function Sigil({ skinId }: { skinId: string }) {
  const s = itemById(skinId)!.skin!;
  return (
    <span className={`bz-sigil p-${s.particle} f-${s.flourish}`} style={{ '--p': s.primary, '--s': s.secondary, '--a': s.accent } as CSSProperties} aria-hidden="true">
      <span className="bz-sigil-ring" />
      <span className="bz-sigil-ring r2" />
      <span className="bz-sigil-core" />
      {Array.from({ length: 12 }, (_, i) => (
        <i key={i} style={{ '--i': i } as CSSProperties} />
      ))}
    </span>
  );
}

/** Sceau tournant « ZÉRO PAY-TO-WIN · STYLE UNIQUEMENT ». */
function Seal() {
  return (
    <div className="bz-seal" aria-label="Zéro pay-to-win : style uniquement" role="img">
      <svg viewBox="0 0 200 200" className="bz-seal-text" aria-hidden="true">
        <defs>
          <path id="bz-seal-c" d="M100 100 m-78 0 a78 78 0 1 1 156 0 a78 78 0 1 1 -156 0" />
        </defs>
        <text fontFamily="Cinzel" fontSize="13.2" letterSpacing="5.2" fill="#f3c969">
          <textPath href="#bz-seal-c">ZÉRO PAY-TO-WIN · STYLE UNIQUEMENT · </textPath>
        </text>
      </svg>
      <span className="bz-seal-core">
        <StarMark size={22} />
      </span>
    </div>
  );
}

/** Pastille d'un objet (aussi utilisée par la collection du compte). */
export function Swatch({ item, small }: { item: Item; small?: boolean }) {
  if (item.kind === 'board') {
    const b = boardStyle(item.id);
    return (
      <span className={`swatch-board tex-${b.texture} ${small ? 'small' : ''}`} style={{ '--light': b.light, '--dark': b.dark, '--frame': b.frame } as CSSProperties}>
        {Array.from({ length: 16 }, (_, i) => (
          <i key={i} className={(Math.floor(i / 4) + i) % 2 ? 'd' : 'l'} />
        ))}
      </span>
    );
  }
  const s = item.skin!;
  return (
    <span className={`swatch-skin p-${s.particle} ${small ? 'small' : ''}`} style={{ '--p': s.primary, '--s': s.secondary, '--a': s.accent } as CSSProperties}>
      <span className="orb" />
      {!small && <span className="ring" />}
      {!small && Array.from({ length: 10 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}
    </span>
  );
}

function CheckoutModal({ product, demo, onClose }: { product: Product; demo: boolean; onClose: () => void }) {
  const [waiver, setWaiver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => firstRef.current?.focus(), []);
  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ url: string }>('/shop/checkout', { body: { productId: product.id, waiver } });
      window.location.assign(r.url);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };
  const items = product.items.map(id => itemById(id)!).filter(Boolean);
  return (
    <Modal onClose={busy ? undefined : onClose}>
      <div className="bz-co">
        <p className="pg-kicker">
          <span className="pg-num">
            <StarMark size={12} />
          </span>
          <span>Récapitulatif</span>
        </p>
        <h2>{product.name}</h2>
        <div className="bz-co-items">
          {items.map(it => (
            <span key={it.id} className="bz-pack-chip">
              <Swatch item={it} small />
              <span>{it.name}</span>
            </span>
          ))}
        </div>
        <div className="checkout-line">
          <span>
            <b>{product.name}</b>
            <small className="muted">{product.description}</small>
          </span>
          <b>{formatPrice(product.priceCents)}</b>
        </div>
        {product.compareAtCents && (
          <div className="checkout-line saving">
            <span>Économie sur le prix des objets à l’unité</span>
            <span>− {formatPrice(product.compareAtCents - product.priceCents)}</span>
          </div>
        )}
        <div className="checkout-line total">
          <span>Total TTC</span>
          <b>{formatPrice(product.priceCents)}</b>
        </div>
        <label className="check bz-co-waiver">
          <input ref={firstRef} type="checkbox" checked={waiver} onChange={e => setWaiver(e.target.checked)} />
          <span>
            Je demande l’accès immédiat à ce contenu numérique et je reconnais perdre mon droit de rétractation une fois l’achat livré (article L221-28 du Code de
            la consommation). J’accepte les{' '}
            <Link to="/cgv" target="_blank">
              conditions générales de vente
            </Link>
            .
          </span>
        </label>
        {error && <div className="form-error">{error}</div>}
        <button type="button" className="btn-gold bz-co-pay" disabled={!waiver || busy} onClick={pay}>
          <span className="btn-shine" />
          <span className="btn-main">{busy ? 'Redirection…' : `Payer ${formatPrice(product.priceCents)}`}</span>
          <span className="btn-sub">{demo ? 'Paiement simulé, rien n’est débité' : 'Carte bancaire, Apple Pay, Google Pay'}</span>
          <svg className="btn-arrow" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <p className="bz-co-secure">
          <LockIcon /> {demo ? 'Mode démonstration : une page de paiement simulée remplace Stripe.' : 'Vous allez être redirigé vers la page de paiement sécurisée de Stripe.'}
        </p>
        <button type="button" className="btn btn-ghost btn-block" onClick={onClose} disabled={busy}>
          Continuer mes achats
        </button>
      </div>
    </Modal>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" className="pg-lock">
      <rect x="3" y="7" width="10" height="7" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
