// Coque de partie immersive (style Odyssée), réutilisable par l'accueil et par la page de partie en ligne.
//
// Elle dessine tout ce qui entoure l'échiquier : barre du haut (retour, badge), panneau de statut à gauche
// (surtitre, titre, consigne, sort en cours de ciblage, résultat, actions), adversaire en haut à droite (nom,
// sous-titre, main visible en petit, cartes jouées grisées, emplacement libre pour une pendule) et la main du joueur en éventail en bas à gauche.
//
// L'échiquier :
// - soit l'appelant le fournit (`board`) : la coque le place elle-même à la géométrie de `gameLayout()` ;
// - soit l'appelant le place lui-même au même endroit (accueil : l'échiquier-astre est animé par le moteur).
//
// Styles : ./shell.css (classes gs-*), jetons de couleur et polices de styles/global.css.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import gsap from 'gsap';
import { CARDS, isCardId } from '../../../shared/cards';
import type { HandCard } from '../../../shared/game';
import { CardEmblem } from '../../components/CardArt';
import { SpellCard } from '../../components/SpellCard';
import { gameLayout } from './layout';
import './shell.css';

export interface ShellPlayer {
  name: string;
  /** Sous-titre : « IA · niveau Sorcier », « 1 480 Elo », « Invité »… */
  sub?: ReactNode;
  /** Main du joueur, visible des deux côtés (décision du 30 octobre) ; cartes jouées : `used`. */
  hand: HandCard[];
  /** Pastille : l'œil de l'Oracle (IA) par défaut, ou un nœud libre (initiale, avatar). */
  avatar?: ReactNode;
  /** Emplacement libre sous le nom (pendule, statut en ligne…). */
  extra?: ReactNode;
}

export interface ShellPrompt {
  /** Nom du sort en cours de ciblage. */
  name: string;
  /** Teinte HSL de la carte. */
  hue: number;
  /** Consigne de ciblage ou règle de la carte. */
  text: ReactNode;
  /** Bouton « Lancer le sort » (cartes sans cible). */
  onCast?: () => void;
  onCancel: () => void;
}

export interface ShellAction {
  label: string;
  onClick: () => void;
  /** Action irréversible : un second clic confirme (« Abandonner ? »). */
  confirm?: string;
  hidden?: boolean;
}

export interface GameShellProps {
  /** Faux : le HUD est retiré (l'accueil revient à la page, la partie reste en vie). */
  active: boolean;
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
  /** Résultat de partie : remplace consigne et sort. */
  result?: { text: ReactNode; actions?: ReactNode } | null;
  /** Sort en cours de ciblage. */
  prompt?: ShellPrompt | null;
  /** Actions discrètes sous le statut (Nouvelle partie, Abandonner…). Masquées pendant un ciblage ; repliées
   *  sous « Options » sur mobile. */
  actions?: ShellAction[];
  /** Informations toujours visibles sous la consigne (effets en cours : <EffectChips />…). */
  info?: ReactNode;
  /** Contenu libre sous le statut (niveau de l'IA, file d'attente…). Masqué pendant un ciblage ; replié sous
   *  « Options » sur mobile. */
  statusExtra?: ReactNode;
  opponent: ShellPlayer;
  /** Main du joueur. */
  hand: HandCard[];
  playable: boolean[];
  selected: number | null;
  onPickCard: (index: number) => void;
  handLabel?: string;
  /** Emplacement libre au-dessus de l'éventail (pendule du joueur…). */
  selfExtra?: ReactNode;
  /** Annonce brève (« L'Oracle lance Foudre ») ; changer `key` la rejoue. */
  toast?: { text: string; key: number } | null;
  /** Échap : par défaut annule le ciblage, sinon appelle onBack. */
  onEscape?: () => void;
  className?: string;
}

const FAN = [
  { r: -7, y: 14 },
  { r: 0, y: 0 },
  { r: 7, y: 14 },
];

export function OracleEye() {
  return <span className="gs-eye" aria-hidden="true" />;
}

function useLayout() {
  const [l, setL] = useState(() => gameLayout(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const on = () => setL(gameLayout(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return l;
}

function ActionButton({ a }: { a: ShellAction }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3200);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`gs-quiet ${armed ? 'is-armed' : ''}`}
      onClick={() => {
        if (a.confirm && !armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        a.onClick();
      }}
    >
      {armed ? a.confirm : a.label}
    </button>
  );
}

export function GameShell(p: GameShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const layout = useLayout();
  const { active } = p;

  // Arrivée : les cartes montent en éventail, le statut glisse
  useLayoutEffect(() => {
    if (!active || !rootRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.from('.gs-fan-slot', { y: 340, rotation: (i: number) => [-28, 0, 28][i] ?? 0, opacity: 0, duration: 1.15, ease: 'expo.out', stagger: 0.09 });
      gsap.from('.gs-in', { y: 22, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06, delay: 0.05 });
    }, rootRef);
    return () => ctx.revert();
  }, [active]);

  const [moreOpen, setMoreOpen] = useState(false);
  const { prompt, onBack, onEscape } = p;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (onEscape) onEscape();
      else if (prompt) prompt.onCancel();
      else onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, prompt, onBack, onEscape]);

  if (!active) return null;

  const shownActions = !p.result && p.actions ? p.actions.filter(a => !a.hidden) : [];
  const hasMore = !!p.statusExtra || shownActions.length > 0;

  // Main adverse face visible, en petit : emblème et nom de chaque carte, cartes jouées grisées. Une carte retirée
  // du jeu (ancienne partie) garde son identifiant.
  const backs = (
    <ul className="gs-backs" aria-label={`Cartes de ${p.opponent.name}`}>
      {p.opponent.hand.map((h, i) => {
        const def = h.card && isCardId(h.card) ? CARDS[h.card] : null;
        return (
          <li
            key={i}
            className={`gs-opp-card ${h.used ? 'used' : ''}`}
            style={def ? ({ '--h': def.hue } as CSSProperties) : undefined}
            title={def ? `${def.name}${h.used ? ' (jouée)' : ''} : ${def.description}` : 'Carte retirée du jeu'}
          >
            {def && <span className="gs-opp-em"><CardEmblem id={def.id} /></span>}
            <span className="gs-opp-name">{def?.name ?? String(h.card ?? '')}</span>
            {h.used && <span className="gs-opp-used">jouée</span>}
          </li>
        );
      })}
    </ul>
  );

  const stageStyle = {
    left: layout.x - layout.G / 2,
    top: layout.y - layout.G / 2,
    width: layout.G,
    height: layout.G,
  } as CSSProperties;

  return (
    <div ref={rootRef} className={`gs ${layout.mobile ? 'is-mobile' : ''} ${prompt ? 'has-prompt' : ''} ${moreOpen ? 'more-open' : ''} ${p.className ?? ''}`} style={{ '--gs-g': `${layout.G}px`, '--gs-top': `${layout.y - layout.G / 2}px` } as CSSProperties}>
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

        <div className="gs-status">
          {p.kicker && <p className="gs-kicker gs-in">{p.kicker}</p>}
          <h2 className="gs-title gs-in" aria-live="polite">
            {p.title}
          </h2>
          {p.result ? (
            <div className="gs-in gs-result">
              <div className="gs-result-text">{p.result.text}</div>
              {p.result.actions && <div className="gs-actions">{p.result.actions}</div>}
            </div>
          ) : prompt ? (
            <div className="gs-prompt gs-in" style={{ '--h': prompt.hue } as CSSProperties}>
              <p className="gs-spell">{prompt.name}</p>
              <p className="gs-prompt-text">{prompt.text}</p>
              <div className="gs-actions">
                {prompt.onCast && (
                  <button type="button" className="btn-gold sm" onClick={prompt.onCast}>
                    Lancer le sort
                  </button>
                )}
                <button type="button" className="btn-line" onClick={prompt.onCancel}>
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            p.hint && <div className="gs-hint gs-in">{p.hint}</div>
          )}
          {p.info && !prompt && <div className="gs-info gs-in">{p.info}</div>}
          {/* Pendant le ciblage d'un sort, seul le sort compte : le reste du panneau s'efface */}
          {!prompt && hasMore && layout.mobile && (
            <button type="button" className="gs-more-btn gs-in" aria-expanded={moreOpen} onClick={() => setMoreOpen(o => !o)}>
              {moreOpen ? 'Masquer les options' : 'Options de la partie'}
            </button>
          )}
          {!prompt && (!layout.mobile || moreOpen) && (
            <>
              {p.statusExtra && <div className="gs-extra gs-in">{p.statusExtra}</div>}
              {shownActions.length > 0 && (
                <div className="gs-quiet-row gs-in">
                  {shownActions.map(a => (
                    <ActionButton key={a.label} a={a} />
                  ))}
                </div>
              )}
            </>
          )}
          {!prompt && (
            <div className="gs-opp-hand-m">
              <span>Main de {p.opponent.name}</span>
              {backs}
            </div>
          )}
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
          {backs}
        </div>

        <div className="gs-fan" aria-label="Vos cartes">
          <span className="gs-fan-label gs-in">{p.handLabel ?? 'Votre main · un sort par tour'}</span>
          {p.selfExtra && <div className="gs-self-extra gs-in">{p.selfExtra}</div>}
          {p.hand.map((h, i) =>
            h.card ? (
              <div key={i} className="gs-fan-slot">
                <div className={`gs-fan-card ${p.selected === i ? 'is-sel' : ''}`} style={{ '--fr': `${FAN[i % 3].r}deg`, '--fy': `${FAN[i % 3].y}px` } as CSSProperties}>
                  <SpellCard
                    id={h.card}
                    size="hand"
                    used={h.used}
                    selected={p.selected === i}
                    disabled={!h.used && !p.playable[i]}
                    onClick={() => p.onPickCard(i)}
                  />
                </div>
              </div>
            ) : null,
          )}
          {p.hand.length === 0 && <span className="gs-no-cards gs-in">Partie sans cartes</span>}
        </div>
      </div>
    </div>
  );
}

/** Nom lisible d'une carte (pour les annonces). */
export const cardName = (id: string) => (id in CARDS ? CARDS[id as keyof typeof CARDS].name : '');
