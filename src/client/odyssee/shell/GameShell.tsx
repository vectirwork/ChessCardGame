// Coque de partie immersive (style Odyssée), réutilisable par l'accueil et par la page de partie en ligne.
//
// Elle dessine tout ce qui entoure l'échiquier : barre du haut (retour, badge), panneau de statut à gauche
// (surtitre, titre, consigne, résultat, actions), adversaire en haut à droite (nom, sous-titre, emplacement libre
// pour une pendule, et ses cartes en éventail retourné) et la main du joueur en éventail en bas à gauche.
//
// Cartes (décisions D2 et D3 du plan V2) :
// - toucher une carte la soulève et ouvre sa bulle, à côté de la carte : règle, famille, durée, moment où elle agit,
//   puis « Lancer ce sort » et « Annuler ». Sans cible, le bouton la lance ; avec cible, la bulle se réduit à la
//   consigne et les cases possibles brillent (l'appelant passe la consigne par `prompt`). Survol et focus clavier :
//   la même bulle, en lecture seule. Une carte pas jouable s'ouvre aussi : la bulle dit pourquoi (`notes`) ;
// - tant que le joueur n'a ouvert aucune carte, une invite au-dessus de la main (mémorisée dans localStorage) ;
// - après un lancement (`cast`), un message au-dessus de la main (Présage : « Annoncé : arrive au début de votre
//   prochain tour. Jouez maintenant votre coup. »), selon les règles de la partie (`rules`, `castsLeft`) ;
// - les cartes de l'adversaire en éventail retourné (180°), plus petites, avec leur intitulé ; bulle à l'endroit.
//
// Nombre de cartes : N se déduit des mains reçues (la plus longue des deux). Poses et arrivée de l'éventail : fanPose et
// fanArrival (layout.ts). Jusqu'à la main de référence (REF_HAND), rien de nouveau dans le DOM ; au-delà, les éventails
// portent data-crowd et des variables en ligne (--hw, --ho), que lisent des règles propres de shell.css.
//
// L'échiquier :
// - soit l'appelant le fournit (`board`) : la coque le place elle-même à la géométrie de `gameLayout()` ;
// - soit l'appelant le place lui-même au même endroit (accueil : l'échiquier-astre est animé par le moteur).
//
// Styles : ./shell.css (classes gs-*), bulle et faces de carte dans styles/cards.css.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { CARDS, isCardId } from '../../../shared/cards';
import type { CardId } from '../../../shared/cards';
import { GAME_RULES } from '../../../shared/config/rules';
import type { Rules } from '../../../shared/config/rules';
import type { HandCard } from '../../../shared/game';
import { mainLabel } from '../../../shared/text/regles';
import { CardBubble, SpellCard } from '../../components/SpellCard';
import { castMessage } from './cards';
import { REF_HAND, fanArrival, fanPose, handCardWidth, oppCardWidth } from './layout';
import { useGameLayout } from './useGameLayout';
import './shell.css';

/** Règles de la partie que lit la coque : intitulé de la main, message après un lancement, pastilles des cartes. */
export type ShellRules = Pick<Rules, 'cardsPerTurn' | 'cardEndsTurn' | 'presageDelay'>;

export interface ShellPlayer {
  name: string;
  /** Sous-titre : « IA · niveau Sorcier », « 1 480 Elo », « Invité »… */
  sub?: ReactNode;
  /** Main du joueur, visible des deux côtés (décision du 30 octobre) ; cartes jouées : `used`. */
  hand: HandCard[];
  /** Intitulé de sa main : « Cartes de votre adversaire » par défaut (accueil : « Cartes de l'Oracle »). */
  handLabel?: string;
  /** Pastille : l'œil de l'Oracle (IA) par défaut, ou un nœud libre (initiale, avatar). */
  avatar?: ReactNode;
  /** Emplacement libre sous le nom (pendule, statut en ligne…). */
  extra?: ReactNode;
}

export interface ShellPrompt {
  /** Nom du sort choisi. */
  name: string;
  /** Teinte HSL de la carte. */
  hue: number;
  /** Consigne de ciblage (carte à cible) ou règle de la carte. */
  text: ReactNode;
  /** Lance la carte choisie (cartes sans cible). */
  onCast?: () => void;
  onCancel: () => void;
}

export type ShellIcon = 'draw' | 'resign' | 'abort' | 'new' | 'moves' | 'flip' | 'sound' | 'mute' | 'search' | 'hand';

export interface ShellAction {
  label: string;
  onClick: () => void;
  /** Action irréversible : un second clic confirme (« Abandonner ? »). */
  confirm?: string;
  hidden?: boolean;
  icon?: ShellIcon;
}

export interface GameShellProps {
  /** Faux : le HUD est retiré (l'accueil revient à la page, la partie reste en vie). */
  active: boolean;
  /** Vrai avant `active` (accueil, pendant le glissement du rideau) : la coque est rendue d'avance, cachée (ni peinte
   *  ni touchable, ses animations CSS en attente à leur début) ; à `active`, il ne reste qu'à la montrer, et tout se
   *  passe comme si elle venait d'être montée (arrivée des cartes, animations CSS). */
  prepare?: boolean;
  /** Échiquier à placer par la coque, à la géométrie de gameLayout(). */
  board?: ReactNode;
  /** Fond d'arène (nuit, étoiles) derrière la partie : utile hors de l'accueil, qui a son propre rideau. */
  backdrop?: boolean;
  backLabel?: string;
  onBack: () => void;
  /** Petit texte en capitales à côté du bouton de retour. */
  badge?: ReactNode;
  /** Surtitre du panneau de statut (« Coup 12 · L'Oracle, Sorcier »). */
  kicker?: ReactNode;
  /** Titre du statut (« À vous de jouer. »). */
  title: ReactNode;
  /** Consigne sous le titre. */
  hint?: ReactNode;
  /** Résultat de partie : remplace la consigne. */
  result?: { text: ReactNode; actions?: ReactNode } | null;
  /** Carte choisie par l'appelant (`selected`) : consigne de ciblage, lancement, annulation. */
  prompt?: ShellPrompt | null;
  /** Actions de la partie (Nouvelle partie, Nulle, Abandonner…) : une barre toujours visible sous le bouton de retour
   *  (ordinateur), ou un bouton « ⋯ » à portée du pouce qui ouvre une fiche (mobile). */
  actions?: ShellAction[];
  /** Informations toujours visibles sous la consigne. */
  info?: ReactNode;
  /** Pouvoirs en cours (<PowersPanel />), sous la consigne. */
  powers?: ReactNode;
  /** Bandeau posé sur le haut de l'échiquier, toujours visible : proposition de nulle, revanche, adversaire parti… */
  banner?: ReactNode;
  /** Contenu libre sous le statut (niveau de l'IA, file d'attente…). Masqué pendant un ciblage ; dans la fiche
   *  « ⋯ » sur mobile. */
  statusExtra?: ReactNode;
  opponent: ShellPlayer;
  /** Main du joueur. */
  hand: HandCard[];
  playable: boolean[];
  /** Pourquoi chaque carte n'est pas jouable maintenant (handNotes, ./cards.ts), dit par sa bulle. */
  notes?: (string | null)[];
  selected: number | null;
  /** Choisit la carte `index` (l'appelant la sélectionne : ciblage, ou `prompt.onCast` pour une carte sans cible). */
  onPickCard: (index: number) => void;
  /** Première intention de jouer une carte (survol, focus ou toucher d'une de vos cartes) : l'appelant peut préparer
   *  la scène des sorts (WebGL) à ce moment-là plutôt qu'à l'arrivée sur la page. */
  onCardIntent?: () => void;
  /** Carte lancée ce tour par le joueur (la dernière de castsThisTurn), en attendant son coup : message au-dessus de
   *  la main. */
  cast?: CardId | null;
  /** Cartes que le joueur peut encore lancer ce tour (castsLeft) : « Un autre sort, ou jouez votre coup. ». 0 par défaut. */
  castsLeft?: number;
  /** Règles de la partie (rulesOf(state)). Par défaut, celles des nouvelles parties (GAME_RULES). */
  rules?: ShellRules;
  /** Sous une main vide : « Partie sans cartes » par défaut ; null : rien (salle d'attente ou choix d'une partie avec
   *  cartes, dont les mains ne sont pas encore distribuées). */
  emptyHand?: ReactNode;
  /** La main du bas n'est pas celle du visiteur (spectateur) : lecture seule, sans invite. */
  readOnlyHand?: boolean;
  handLabel?: string;
  /** Emplacement libre au-dessus de l'éventail (pendule du joueur…). */
  selfExtra?: ReactNode;
  /** Annonce brève (« L'Oracle lance Foudre ») ; changer `key` la rejoue. */
  toast?: { text: string; key: number } | null;
  /** Échap : par défaut annule le ciblage, sinon appelle onBack. */
  onEscape?: () => void;
  className?: string;
}

/** Invite « Touchez une carte… » : vue une fois qu'une carte a été ouverte. */
const SEEN_KEY = 'sm:cartes:lues';
const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
};

/** Soulèvement d'une carte ouverte (shell.css, .gs-fan-card.is-sel) et marge de la bulle. */
const LIFT = 26;

export function OracleEye() {
  return <span className="gs-eye" aria-hidden="true" />;
}

const ICONS: Record<ShellIcon, ReactNode> = {
  draw: <path d="M5 12h14M12 5v14" transform="rotate(45 12 12)" />,
  resign: <path d="M6 21V4m0 0h11l-2.5 4L17 12H6" />,
  abort: <path d="M6 6l12 12M18 6 6 18" />,
  new: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />,
  moves: <path d="M5 6h14M5 12h14M5 18h9" />,
  flip: <path d="M8 4v15M8 4 4.5 7.5M8 4l3.5 3.5M16 20V5m0 15-3.5-3.5M16 20l3.5-3.5" />,
  sound: <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6" />,
  mute: <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9.5l5 5m0-5-5 5" />,
  search: <path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20" />,
  hand: <path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5V5a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4.6 15a1.5 1.5 0 0 1 2.4-1.8L8 14.5" />,
};

function ActionButton({ a, variant }: { a: ShellAction; variant: 'tool' | 'sheet' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3200);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`${variant === 'tool' ? 'gs-tool-btn' : 'gs-sheet-btn'} ${armed ? 'is-armed' : ''} ${a.icon === 'resign' || a.icon === 'abort' ? 'is-danger' : ''}`}
      onClick={() => {
        if (a.confirm && !armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        a.onClick();
      }}
    >
      {a.icon && (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            {ICONS[a.icon]}
          </g>
        </svg>
      )}
      <span>{armed ? a.confirm : a.label}</span>
    </button>
  );
}

type Peek = { who: 'self' | 'opp'; i: number } | null;

export function GameShell(p: GameShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const layout = useGameLayout();
  const { active } = p;
  // Nombre de cartes de la partie : la plus longue des deux mains (aucune prop de plus)
  const n = Math.max(p.hand.length, p.opponent.hand.length);
  const crowd = n > REF_HAND;
  // Au-delà de la main de référence, vos cartes rapetissent ; sous 96 px, moment en icône et pastille courte
  const handWidth = crowd ? handCardWidth(n, layout, layout.vw, layout.vh) : null;
  const narrow = !!handWidth && handWidth.w < 96;
  const rules = p.rules ?? GAME_RULES;
  // Intitulé de la main par défaut, calculé une fois par objet de règles (pas à chaque rendu)
  const defaultLabel = useMemo(() => mainLabel(rules), [rules]);

  // Arrivée : les cartes montent en éventail, le statut glisse
  useLayoutEffect(() => {
    if (!active || !rootRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.from('.gs-fan-slot', { y: 340, rotation: (i: number) => fanArrival(i, n), opacity: 0, duration: 1.15, ease: 'expo.out', stagger: 0.09 });
      gsap.from('.gs-in', { y: 22, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06, delay: 0.05 });
    }, rootRef);
    return () => ctx.revert();
  }, [active]);

  const [moreOpen, setMoreOpen] = useState(false);

  // ----- Cartes : bulle ouverte au toucher (openIdx, oppOpen), aperçu au survol ou au focus (peek) -----
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [oppOpen, setOppOpen] = useState<number | null>(null);
  const [peek, setPeek] = useState<Peek>(null);
  const [pendingCast, setPendingCast] = useState<number | null>(null);
  const [seen, setSeen] = useState(readSeen);
  const focusPrimary = useRef(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const oppRefs = useRef<(HTMLDivElement | null)[]>([]);
  const fanRef = useRef<HTMLDivElement>(null);
  const oppFanRef = useRef<HTMLDivElement>(null);

  // Ordinateur : le statut défile quand il déborde ; son bas s'estompe alors au lieu de couper net une ligne
  const statusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = statusRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const check = () => el.classList.toggle('is-clipped', el.scrollHeight - el.clientHeight - el.scrollTop > 4);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    const mo = new MutationObserver(() => {
      for (const c of Array.from(el.children)) ro.observe(c);
      check();
    });
    mo.observe(el, { childList: true });
    for (const c of Array.from(el.children)) ro.observe(c);
    el.addEventListener('scroll', check, { passive: true });
    check();
    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener('scroll', check);
    };
  }, []);
  const [selfPos, setSelfPos] = useState<CSSProperties | null>(null);
  const [oppPos, setOppPos] = useState<CSSProperties | null>(null);

  const { prompt, onBack, onEscape, hand, playable, selected, onPickCard, readOnlyHand } = p;
  const oppHand = p.opponent.hand;

  // Intention de jouer une carte : bulle ouverte ou aperçu d'une de vos cartes
  const intent = !readOnlyHand && (openIdx !== null || peek?.who === 'self');
  const onCardIntent = p.onCardIntent;
  useEffect(() => {
    if (intent) onCardIntent?.();
  }, [intent, onCardIntent]);
  const cardOf = (h: HandCard | undefined): CardId | null => (h?.card && isCardId(h.card) ? h.card : null);

  const markSeen = useCallback(() => {
    setSeen(true);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // stockage indisponible : l'invite reviendra à la prochaine visite
    }
  }, []);

  // Carte choisie par l'appelant (ciblage, ou carte sans cible prête à partir)
  const sel = !readOnlyHand && selected !== null && prompt && cardOf(hand[selected]) ? selected : null;
  const selCard = sel !== null ? cardOf(hand[sel]) : null;
  let selfBubble: { i: number; mode: 'read' | 'open' | 'aim' } | null = null;
  if (sel !== null && selCard) selfBubble = { i: sel, mode: CARDS[selCard].targets ? 'aim' : 'open' };
  else if (openIdx !== null && cardOf(hand[openIdx])) selfBubble = { i: openIdx, mode: 'open' };
  else if (peek?.who === 'self' && cardOf(hand[peek.i])) selfBubble = { i: peek.i, mode: 'read' };
  let oppBubble: { i: number; mode: 'read' | 'open' } | null = null;
  if (oppOpen !== null && cardOf(oppHand[oppOpen])) oppBubble = { i: oppOpen, mode: 'open' };
  else if (peek?.who === 'opp' && cardOf(oppHand[peek.i])) oppBubble = { i: peek.i, mode: 'read' };

  // Une carte ouverte qui vient d'être jouée, ou une main qui change (nouvelle partie), referme la bulle
  const handKey = hand.map(h => `${h.card}:${h.used ? 1 : 0}`).join(',');
  const oppKey = oppHand.map(h => `${h.card}:${h.used ? 1 : 0}`).join(',');
  useEffect(() => {
    setOpenIdx(null);
    setPeek(cur => (cur?.who === 'self' ? null : cur));
  }, [handKey]);
  useEffect(() => {
    setOppOpen(null);
    setPeek(cur => (cur?.who === 'opp' ? null : cur));
  }, [oppKey]);
  useEffect(() => {
    if (!active) {
      setOpenIdx(null);
      setOppOpen(null);
      setPeek(null);
    }
  }, [active]);

  // « Lancer ce sort » sur une carte sans cible : l'appelant la choisit, puis on la lance aussitôt
  useEffect(() => {
    if (pendingCast === null) return;
    if (selected === pendingCast && prompt?.onCast) prompt.onCast();
    setPendingCast(null);
  }, [pendingCast, selected, prompt]);

  const focusCard = (i: number, opp = false) => {
    requestAnimationFrame(() => (opp ? oppRefs : cardRefs).current[i]?.focus({ preventScroll: true }));
  };
  /** Focus dans la bulle (clavier) : on le rend à la carte quand la bulle se ferme. */
  const focusInBubble = () => !!document.activeElement?.closest('.card-bubble');

  const closeSelf = (i: number) => {
    const back = focusInBubble();
    setOpenIdx(null);
    if (back) focusCard(i);
  };
  const cancelSelection = () => {
    const back = focusInBubble();
    const i = sel;
    prompt?.onCancel();
    if (back && i !== null) focusCard(i);
  };

  const onSelfCard = (i: number, how: 'pointer' | 'key') => {
    markSeen();
    setPeek(null);
    if (sel !== null) {
      prompt?.onCancel();
      if (sel === i) {
        setOpenIdx(null);
        return;
      }
    }
    if (openIdx === i) {
      setOpenIdx(null);
      return;
    }
    setOppOpen(null);
    setOpenIdx(i);
    focusPrimary.current = how === 'key';
  };

  const launch = (i: number) => {
    const card = cardOf(hand[i]);
    if (!card) return;
    const key = focusInBubble();
    markSeen();
    setOpenIdx(null);
    if (CARDS[card].targets === 0) setPendingCast(i);
    else focusPrimary.current = key;
    onPickCard(i);
    if (key && CARDS[card].targets === 0) focusCard(i);
  };

  const onOppCard = (i: number, how: 'pointer' | 'key') => {
    setPeek(null);
    if (oppOpen === i) {
      setOppOpen(null);
      return;
    }
    setOpenIdx(null);
    setOppOpen(i);
    focusPrimary.current = how === 'key';
  };

  // Focus clavier : la bulle ouverte au clavier reçoit le focus (son premier bouton), dès qu'elle est posée
  const bubbleSig = `${selfBubble?.i}:${selfBubble?.mode}:${oppBubble?.i}:${oppBubble?.mode}:${!!selfPos}:${!!oppPos}`;
  useEffect(() => {
    if (!focusPrimary.current || !primaryRef.current) return;
    focusPrimary.current = false;
    primaryRef.current.focus({ preventScroll: true });
  }, [bubbleSig]);

  // Toucher ailleurs referme les bulles ouvertes (pas le ciblage : l'échiquier attend sa case)
  useEffect(() => {
    if (openIdx === null && oppOpen === null) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest('.card-bubble, .gs-fan-card, .gs-opp-card')) return;
      setOpenIdx(null);
      setOppOpen(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [openIdx, oppOpen]);

  // Échap : bulle ouverte d'abord, puis le comportement de l'appelant (ciblage, retour). Un seul écouteur, posé tant
  // que la coque est active ; il lit l'état du dernier rendu.
  const onEscapeKey = useRef<(e: KeyboardEvent) => void>(() => undefined);
  onEscapeKey.current = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (oppOpen !== null) {
      const back = focusInBubble();
      setOppOpen(null);
      if (back) focusCard(oppOpen, true);
      return;
    }
    if (openIdx !== null) {
      closeSelf(openIdx);
      return;
    }
    if (peek) {
      setPeek(null);
      return;
    }
    if (sel !== null && focusInBubble()) {
      cancelSelection();
      return;
    }
    if (onEscape) onEscape();
    else if (prompt) prompt.onCancel();
    else onBack();
  };
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => onEscapeKey.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  // Place des bulles : au-dessus de la carte (votre main), sous la main adverse ; jamais sur l'échiquier mobile
  useLayoutEffect(() => {
    if (!selfBubble) {
      setSelfPos(null);
      return;
    }
    const fan = fanRef.current;
    const card = cardRefs.current[selfBubble.i];
    if (!fan || !card) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fr = fan.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    const cx = cr.left + cr.width / 2;
    const bottom = vh - fr.top + LIFT + 12;
    if (layout.mobile) {
      // Ciblage : la bulle (réduite à la consigne) ne couvre jamais l'échiquier ; en lecture, elle peut le couvrir
      const boardBottom = layout.y + layout.G / 2;
      const max = selfBubble.mode === 'aim' ? Math.max(110, vh - bottom - boardBottom - 10) : Math.max(160, vh - bottom - 56);
      setSelfPos({ left: 12, width: vw - 24, bottom, '--cbub-max': `${max}px`, '--cbub-ax': `${cx - 12}px` } as CSSProperties);
    } else {
      const w = Math.min(340, vw - 24);
      const left = Math.max(12, Math.min(fr.left - 8, vw - w - 12));
      const max = Math.max(160, vh - bottom - 76);
      setSelfPos({ left, width: w, bottom, '--cbub-max': `${max}px`, '--cbub-ax': `${cx - left}px` } as CSSProperties);
    }
  }, [selfBubble?.i, selfBubble?.mode, layout]);

  useLayoutEffect(() => {
    if (!oppBubble) {
      setOppPos(null);
      return;
    }
    const fan = oppFanRef.current;
    const card = oppRefs.current[oppBubble.i];
    if (!fan || !card) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fr = fan.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    const cx = cr.left + cr.width / 2;
    const top = fr.bottom + (layout.mobile ? 10 : 22);
    const max = Math.max(120, vh - top - 16);
    if (layout.mobile) {
      setOppPos({ left: 12, width: vw - 24, top, '--cbub-max': `${max}px`, '--cbub-ax': `${cx - 12}px` } as CSSProperties);
    } else {
      const w = Math.min(300, vw - 24);
      const left = Math.max(12, Math.min(fr.right - w, vw - w - 12));
      setOppPos({ left, width: w, top, '--cbub-max': `${max}px`, '--cbub-ax': `${cx - left}px` } as CSSProperties);
    }
  }, [oppBubble?.i, oppBubble?.mode, layout]);

  if (!active && !p.prepare) return null;

  const shownActions = !p.result && p.actions ? p.actions.filter(a => !a.hidden) : [];
  const hasMore = !!p.statusExtra || shownActions.length > 0;

  const stageStyle = {
    left: layout.x - layout.G / 2,
    top: layout.y - layout.G / 2,
    width: layout.G,
    height: layout.G,
  } as CSSProperties;

  // ----- Bulles -----
  const selfBubbleId = 'gs-bubble-self';
  const oppBubbleId = 'gs-bubble-opp';
  let selfBubbleEl: ReactNode = null;
  if (selfBubble && selfPos) {
    const { i, mode } = selfBubble;
    const card = cardOf(hand[i])!;
    const owner = readOnlyHand ? 'opponent' : 'self';
    const note = readOnlyHand ? null : (p.notes?.[i] ?? (playable[i] ? null : 'Pas jouable pour le moment.'));
    selfBubbleEl = (
      <CardBubble
        id={card}
        domId={selfBubbleId}
        mode={mode}
        owner={owner}
        used={hand[i].used}
        rules={rules}
        note={note}
        aim={mode === 'aim' ? prompt?.text : undefined}
        onCast={
          mode === 'open'
            ? sel === i
              ? prompt?.onCast
              : !readOnlyHand && playable[i] && !hand[i].used
                ? () => launch(i)
                : undefined
            : undefined
        }
        onCancel={mode === 'read' ? undefined : sel === i ? cancelSelection : () => closeSelf(i)}
        primaryRef={primaryRef}
        className="is-floating"
        style={selfPos}
      />
    );
  }
  let oppBubbleEl: ReactNode = null;
  if (oppBubble && oppPos) {
    const { i, mode } = oppBubble;
    oppBubbleEl = (
      <CardBubble
        id={cardOf(oppHand[i])!}
        domId={oppBubbleId}
        mode={mode}
        owner="opponent"
        used={oppHand[i].used}
        rules={rules}
        onCancel={
          mode === 'open'
            ? () => {
                const back = focusInBubble();
                setOppOpen(null);
                if (back) focusCard(i, true);
              }
            : undefined
        }
        primaryRef={primaryRef}
        className="is-floating is-below"
        style={oppPos}
      />
    );
  }

  // ----- Au-dessus de votre main : message après un lancement, invite, ou intitulé -----
  const castDef = p.cast && CARDS[p.cast] ? CARDS[p.cast] : null;
  const hasUnused = hand.some(h => cardOf(h) && !h.used);
  // Pas d'invite une fois la partie finie : il n'y a plus de carte à lancer
  const showInvite = !readOnlyHand && !seen && hasUnused && !selfBubble && !castDef && !p.result;
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  let fanNote: ReactNode;
  if (castDef) {
    fanNote = (
      <p className="gs-fan-note is-cast" role="status" style={{ '--h': castDef.hue } as CSSProperties}>
        <b>{castDef.name}</b>
        <span>{castMessage(castDef.id, rules, p.castsLeft ?? 0)}</span>
      </p>
    );
  } else if (showInvite) {
    fanNote = (
      <p className="gs-fan-note is-invite">
        <span className="gs-invite-dot" aria-hidden="true" />
        {coarse ? 'Touchez une carte pour la lire et la lancer' : 'Cliquez sur une carte pour la lire et la lancer'}
      </p>
    );
  } else {
    fanNote = <span className="gs-fan-label gs-in">{p.handLabel ?? defaultLabel}</span>;
  }

  // ----- Main adverse : éventail retourné (180°), faces visibles, cartes jouées grisées -----
  const oppLabel = p.opponent.handLabel ?? 'Cartes de votre adversaire';
  const oppFan = oppHand.length > 0 && (
    <div className="gs-opp-fan" ref={oppFanRef} data-crowd={crowd ? n : undefined} style={{ '--ow': `${oppCardWidth(layout, layout.vw, n)}px` } as CSSProperties}>
      <span className="gs-opp-fan-label" id="gs-opp-fan-label">
        {oppLabel}
      </span>
      <div className="gs-opp-cards" role="group" aria-labelledby="gs-opp-fan-label">
        {oppHand.map((h, i) => {
          const card = cardOf(h);
          if (!card) return <span key={i} className="gs-opp-slot is-retired" title="Carte retirée du jeu" />;
          const on = oppBubble?.i === i;
          return (
            <div key={i} className="gs-opp-slot">
              <div className={`gs-opp-card ${on ? 'is-on' : ''}`} style={poseStyle(i, n)}>
                <SpellCard
                  ref={el => {
                    oppRefs.current[i] = el;
                  }}
                  id={card}
                  size="hand"
                  owner="opponent"
                  used={h.used}
                  rules={rules}
                  tilt={false}
                  onClick={how => onOppCard(i, how)}
                  onHover={hov => setPeek(cur => (hov ? { who: 'opp', i } : cur?.who === 'opp' && cur.i === i ? null : cur))}
                  onFocusChange={f => setPeek(cur => (f ? { who: 'opp', i } : cur?.who === 'opp' && cur.i === i ? null : cur))}
                  describedBy={on ? oppBubbleId : undefined}
                  expanded={oppOpen === i}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={`gs ${active ? '' : 'is-prep'} ${layout.mobile ? 'is-mobile' : ''} ${sel !== null ? 'has-prompt' : ''} ${moreOpen ? 'more-open' : ''} ${castDef || showInvite ? 'has-fan-note' : ''} ${castDef ? 'has-cast' : ''} ${p.className ?? ''}`}
      style={{ '--gs-g': `${layout.G}px`, '--gs-top': `${layout.y - layout.G / 2}px`, '--gs-left': `${layout.x - layout.G / 2}px` } as CSSProperties}
    >
      {p.backdrop && (
        <div className="gs-backdrop" aria-hidden="true">
          <div className="gs-backdrop-glow" />
          <div className="gs-backdrop-stars" />
        </div>
      )}
      {p.board && (
        <div className="gs-stage" style={stageStyle}>
          {p.board}
        </div>
      )}
      <div className="gs-hud" role="region" aria-label="Partie en cours">
        <div className="gs-top gs-in">
          <button type="button" className="gs-back" onClick={p.onBack}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {p.backLabel ?? 'Retour'}
          </button>
          {p.badge && <span className="gs-badge">{p.badge}</span>}
        </div>
        {!layout.mobile && shownActions.length > 0 && (
          <div className="gs-toolbar gs-in" role="toolbar" aria-label="Actions de la partie">
            {shownActions.map(a => (
              <ActionButton key={a.label} a={a} variant="tool" />
            ))}
          </div>
        )}
        {layout.mobile && hasMore && (
          <button type="button" className="gs-menu-btn" aria-label="Options de la partie" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
            <span aria-hidden="true">⋯</span>
          </button>
        )}

        <div className="gs-status" ref={statusRef}>
          {p.kicker && <p className="gs-kicker gs-in">{p.kicker}</p>}
          <h2 className="gs-title gs-in" aria-live="polite">
            {p.title}
          </h2>
          {p.result ? (
            <div className="gs-in gs-result">
              <div className="gs-result-text">{p.result.text}</div>
              {p.result.actions && <div className="gs-actions">{p.result.actions}</div>}
            </div>
          ) : (
            p.hint && <div className="gs-hint gs-in">{p.hint}</div>
          )}
          {p.info && <div className="gs-info gs-in">{p.info}</div>}
          {p.powers && <div className="gs-powers gs-in">{p.powers}</div>}
          {/* Pendant le ciblage d'un sort, seul le sort compte : les options s'effacent */}
          {sel === null && !layout.mobile && p.statusExtra && <div className="gs-extra gs-in">{p.statusExtra}</div>}
          {p.toast && (
            <p key={p.toast.key} className="gs-toast" role="status">
              {p.toast.text}
            </p>
          )}
        </div>

        <div className="gs-opponent gs-in">
          <div className="gs-opp-id">
            {p.opponent.avatar ?? <OracleEye />}
            <div>
              <b>{p.opponent.name}</b>
              {p.opponent.sub && <span>{p.opponent.sub}</span>}
            </div>
          </div>
          {p.opponent.extra}
          {!layout.mobile && oppFan}
        </div>
        {layout.mobile && oppFan && <div className="gs-opp-strip gs-in">{oppFan}</div>}

        <div
          className={`gs-fan ${readOnlyHand ? 'is-readonly' : ''}`}
          ref={fanRef}
          aria-label={readOnlyHand ? p.handLabel : 'Vos cartes'}
          role="group"
          data-crowd={crowd ? n : undefined}
          style={handWidth ? crowdStyle(handWidth) : undefined}
        >
          {fanNote}
          {p.selfExtra && <div className="gs-self-extra gs-in">{p.selfExtra}</div>}
          {hand.map((h, i) => {
            const card = cardOf(h);
            if (!card) return null;
            const lifted = sel === i || openIdx === i;
            return (
              <div key={i} className="gs-fan-slot">
                <div className={`gs-fan-card ${lifted ? 'is-sel' : ''}`} style={poseStyle(i, n)}>
                  <SpellCard
                    ref={el => {
                      cardRefs.current[i] = el;
                    }}
                    id={card}
                    size="hand"
                    used={h.used}
                    rules={rules}
                    narrow={narrow}
                    selected={sel === i}
                    dim={!h.used && !readOnlyHand && !playable[i]}
                    onClick={how => onSelfCard(i, how)}
                    onHover={hov => setPeek(cur => (hov ? (openIdx === null && sel === null ? { who: 'self', i } : cur) : cur?.who === 'self' && cur.i === i ? null : cur))}
                    onFocusChange={f => setPeek(cur => (f ? { who: 'self', i } : cur?.who === 'self' && cur.i === i ? null : cur))}
                    describedBy={selfBubble?.i === i ? selfBubbleId : undefined}
                    expanded={lifted}
                  />
                </div>
              </div>
            );
          })}
          {hand.length === 0 && p.emptyHand !== null && <span className="gs-no-cards gs-in">{p.emptyHand ?? 'Partie sans cartes'}</span>}
        </div>
      </div>
      {p.banner && (
        <div className="gs-banner" style={{ left: layout.x, top: layout.y - layout.G / 2 + (layout.mobile ? 8 : 14) }}>
          {p.banner}
        </div>
      )}
      {/* Dans la coque (pas dans document.body) : les réglages qu'elle montre gardent les styles de leur page
          (niveau de l'Oracle de l'accueil, sous .ody) */}
      {layout.mobile && moreOpen && (
        <div className="gs-sheet-veil" onClick={() => setMoreOpen(false)}>
          <div className="gs-sheet" role="dialog" aria-label="Options de la partie" onClick={e => e.stopPropagation()}>
            <p className="gs-sheet-title">Options de la partie</p>
            {p.statusExtra && <div className="gs-sheet-extra">{p.statusExtra}</div>}
            {shownActions.map(a => (
              <ActionButton
                key={a.label}
                a={{ ...a, onClick: () => { a.onClick(); setMoreOpen(false); } }}
                variant="sheet"
              />
            ))}
            <button type="button" className="btn-line gs-sheet-close" onClick={() => setMoreOpen(false)}>
              Fermer
            </button>
          </div>
        </div>
      )}
      {typeof document !== 'undefined' && (selfBubbleEl || oppBubbleEl) && createPortal(
        <>
          {selfBubbleEl}
          {oppBubbleEl}
        </>,
        document.body,
      )}
    </div>
  );
}

/** Pose d'une carte de l'éventail (variables --fr, --fy de shell.css). */
function poseStyle(i: number, n: number): CSSProperties {
  const f = fanPose(i, n);
  return { '--fr': `${f.r}deg`, '--fy': `${f.y}px` } as CSSProperties;
}

/** Main au-delà de la main de référence : largeur des cartes et chevauchement (shell.css, .gs-fan[data-crowd]). */
function crowdStyle(h: { w: number; overlap: number }): CSSProperties {
  return { '--hw': `${round(h.w)}px`, '--ho': `${round(-h.overlap)}px` } as CSSProperties;
}
const round = (x: number) => Math.round(x * 100) / 100;

/** Nom lisible d'une carte (pour les annonces). */
export const cardName = (id: string) => (id in CARDS ? CARDS[id as keyof typeof CARDS].name : '');
