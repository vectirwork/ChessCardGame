// Banc de la coque de partie (identité visuelle, lot 0a) : les vrais composants, rendus avec des vues figées.
//
// Écrans (window.__COQUE.ecran, ou ?ecran= avec le serveur de développement : /test/coque.html?ecran=partie&n=3) :
// - partie : GameShell avec l'échiquier, votre main (N cartes, éventail) et la main adverse (N cartes, éventail
//   retourné), une carte adverse jouée ;
// - carte : la même, votre première carte ouverte (bulle, consigne de ciblage) ;
// - attente : GameShell de la salle d'attente (aucune main, adversaire « En attente… ») ;
// - choix : CardDraft, réserve des 8 Pouvoirs, emplacements vides ; choix-partiel : deux cartes choisies ;
//   choix-valide : choix validé, en attente de l'adversaire ;
// - revelation : les deux mains révélées (CardDraft, après la fin du choix) ;
// - mini : la mini-main de l'accueil (copie du balisage de OdysseeHome, classes et CSS réels) : sert à regarder N ≠ 3 ;
//   l'identité de la vraie (OdysseeHome, sur la page d'accueil) est relevée par test/identite.mjs, partie « main ».
// N (window.__COQUE.n, ou ?n=) : nombre de cartes de chaque main, de 1 à 6 (3 aujourd'hui). La réserve du choix garde
// ses 8 cartes ; seul le nombre à choisir suit N.
//
// L'heure est figée par identite.mjs (Date.now constant) : le compte à rebours du choix affiche toujours 0:45.
// Les composants sont pris à travers des types lâches (`any`) : ce banc (lot 0a) ne doit pas casser la vérification de
// types quand un lot ajoute ou renomme une prop ; il suit alors le comportement par défaut des composants.
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/800.css';
import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/300-italic.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource-variable/inter';
import '../src/client/styles/global.css';
import '../src/client/styles/cards.css';
import '../src/client/styles/board.css';
import '../src/client/styles/game.css';
import '../src/client/odyssee/odyssee.css';
import { useEffect, useState } from 'react';
import type { ComponentType, CSSProperties, ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import * as shellNs from '../src/client/odyssee/shell/GameShell';
import * as draftNs from '../src/client/game/CardDraft';
import * as boardNs from '../src/client/components/Board';
import * as spellNs from '../src/client/components/SpellCard';
import * as gameNs from '../src/shared/game';
import * as cardsNs from '../src/shared/cards';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const GameShell = (shellNs as Any).GameShell as ComponentType<Any>;
const CardDraft = (draftNs as Any).CardDraft as ComponentType<Any>;
const Board = (boardNs as Any).Board as ComponentType<Any>;
const SpellCard = (spellNs as Any).SpellCard as ComponentType<Any>;
const G: Any = gameNs;
const CARDS: Any = (cardsNs as Any).CARDS;

const params = new URLSearchParams(location.search);
const conf: { ecran: string; n: number } = (window as Any).__COQUE ?? {
  ecran: params.get('ecran') ?? 'partie',
  n: Number(params.get('n') ?? 3),
};
const N = Math.max(1, Math.min(6, Math.floor(conf.n) || 3));
const MAINTENANT = Date.now();

/** Les 8 Pouvoirs, dans l'ordre de la réserve. */
const POUVOIRS = ['hourglass', 'truce', 'blood_moon', 'ice_age', 'blast', 'ice_wall', 'rift', 'tide'];
/** Mains de N cartes (différentes, de 1 à 6) : la vôtre et celle de l'adversaire. */
const MIENNE = ['ice_wall', 'blast', 'tide', 'rift', 'truce', 'blood_moon'].slice(0, N);
const SIENNE = ['truce', 'rift', 'blood_moon', 'ice_age', 'ice_wall', 'blast'].slice(0, N);

const siege = (name: string, king = 'king:arcane'): Any => ({
  kind: 'guest', name, username: null, rating: null, skin: 'skin:arcane', king, seal: null, online: true,
});

function vue(opts: { draft: Any; mains: boolean; chosen?: Record<'w' | 'b', boolean>; mine?: string[] }): Any {
  const hands = opts.mains ? { w: MIENNE, b: SIENNE } : { w: [], b: [] };
  return {
    id: 'BANC0001', mode: 'invite', rated: false, status: 'active',
    seats: { w: siege('Aurore'), b: siege('Basile', 'king:eclipse') }, you: 'w',
    state: G.createGame(hands, true, 'climats'),
    clock: { initial: 300, increment: 0, w: 300_000, b: 300_000, running: null, serverNow: MAINTENANT, rate: { w: 1, b: 1 }, noIncrement: false },
    drawOffer: null, rematch: { w: false, b: false, next: null }, ratingDiff: null, firstMoveDeadline: null,
    away: { w: null, b: null }, claimAfterMs: 60_000, createdAt: MAINTENANT, mirror: false, started: false, standIn: null,
    draft: opts.draft
      ? {
          pool: POUVOIRS.slice(), count: N, deadline: MAINTENANT + 45_000, msLeft: 45_000,
          chosen: opts.chosen ?? { w: false, b: false }, mine: opts.mine ?? [],
        }
      : null,
  };
}

const rien = () => undefined;

function Partie({ attente = false, carte = false }: { attente?: boolean; carte?: boolean }) {
  const s = G.createGame(attente ? { w: [], b: [] } : { w: MIENNE, b: SIENNE }, true, 'climats');
  const hand = attente ? [] : s.hands.w;
  const opp = attente ? [] : s.hands.b.map((h: Any, i: number) => (i === 0 ? { ...h, used: true } : h));
  const selected = carte ? 0 : null;
  const def = CARDS[MIENNE[0]];
  return (
    <GameShell
      active
      backdrop
      className="gp"
      board={<Board pos={s.pos} orientation="w" theme="board:arcane" locked={attente} kingW="king:arcane" kingB="king:eclipse" />}
      onBack={rien}
      backLabel="Retour"
      badge="Invitation"
      kicker={<span>{attente ? 'Partie en ligne' : 'Coup 1'} · Pouvoirs</span>}
      title={attente ? 'En attente de votre adversaire.' : 'À vous de jouer.'}
      hint={attente ? 'Envoyez le lien de la partie.' : 'Jouez un coup, ou lancez d’abord un sort.'}
      prompt={carte ? { name: def.name, hue: def.hue, text: def.prompts[0] ?? def.description, onCancel: rien, onCast: def.targets ? undefined : rien } : null}
      actions={[{ label: 'Abandonner', onClick: rien, confirm: 'Abandonner ?', icon: 'resign' }, { label: 'Son', onClick: rien, icon: 'sound' }]}
      opponent={{ name: attente ? 'En attente…' : 'Basile', sub: attente ? null : 'Invité', hand: opp, handLabel: 'Cartes de votre adversaire' }}
      hand={hand}
      playable={hand.map(() => true)}
      notes={hand.map(() => null)}
      selected={selected}
      onPickCard={rien}
      handLabel="Votre main · un sort par tour"
    />
  );
}

function Choix({ partiel = false, valide = false }: { partiel?: boolean; valide?: boolean }) {
  const mine = valide ? MIENNE : partiel ? MIENNE.slice(0, Math.min(2, N - 1)) : [];
  const v = vue({ draft: true, mains: false, chosen: { w: valide, b: false }, mine });
  return <CardDraft view={v} receivedAt={MAINTENANT} onAbort={rien} />;
}

function Revelation() {
  // Le choix, puis la vue suivante sans `draft` et avec les deux mains : CardDraft montre les mains révélées.
  const [v, setV] = useState(() => vue({ draft: true, mains: false, chosen: { w: true, b: false }, mine: MIENNE }));
  useEffect(() => {
    const t = setTimeout(() => setV(vue({ draft: false, mains: true })), 50);
    return () => clearTimeout(t);
  }, []);
  return <CardDraft view={v} receivedAt={MAINTENANT} onAbort={rien} />;
}

/** Mini-main de l'accueil : copie du balisage d'OdysseeHome (.o-hand-row), avec les vraies classes et le vrai CSS. */
function Mini() {
  const hand = MIENNE.map((card, i) => ({ card, used: i === 1 }));
  return (
    <div className="ody" style={{ minHeight: '100vh', padding: '48px 32px', boxSizing: 'border-box' }}>
      <div className="o-hero-copy">
        <div className="o-hand-row o-rv in" style={{ '--i': 4 } as CSSProperties}>
          <div className="o-hand-mini" aria-label="Vos trois sorts">
            {hand.map((h, i) => (
              <SpellCard key={i} id={h.card} size="mini" used={h.used} disabled={false} onClick={rien} />
            ))}
          </div>
          <div className="o-hand-copy">
            <span className="o-hand-k">Vos trois sorts</span>
            <span className="o-hand-names">
              {hand.map((h, i) => (
                <button key={i} type="button" className={h.used ? 'is-used' : ''} title={CARDS[h.card].tagline}>
                  <span className="o-hand-n">{CARDS[h.card].name}</span>
                  {CARDS[h.card].ritual && (
                    <>
                      <wbr />
                      <small className="o-hand-turn">remplace votre coup</small>
                    </>
                  )}
                </button>
              ))}
            </span>
            <span className="o-hand-t">
              {hand.some(h => CARDS[h.card].ritual)
                ? 'Touchez-en un pour le lire et le lancer ; les autres sorts s’ajoutent à votre coup.'
                : 'Touchez-en un pour le lire et le lancer, puis jouez votre coup.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const ECRANS: Record<string, () => ReactElement> = {
  partie: () => <Partie />,
  carte: () => <Partie carte />,
  attente: () => <Partie attente />,
  choix: () => <Choix />,
  'choix-partiel': () => <Choix partiel />,
  'choix-valide': () => <Choix valide />,
  revelation: () => <Revelation />,
  mini: () => <Mini />,
};

const Ecran = ECRANS[conf.ecran];
if (!Ecran) throw new Error(`Écran du banc inconnu : ${conf.ecran} (${Object.keys(ECRANS).join(', ')})`);
document.body.style.margin = '0';
createRoot(document.getElementById('root')!).render(<Ecran />);
(window as Any).__ECRANS_COQUE = Object.keys(ECRANS);
