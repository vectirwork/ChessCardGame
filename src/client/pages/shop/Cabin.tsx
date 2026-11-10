// Cabine d'essayage : cadre, sélecteur de vue (Portrait du roi / En partie), la vue, la barre de panoplie et la ligne
// d'action (passées par la page), la zone aria-live. La vue « En partie » se met en pause hors de l'écran.
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { CARDS } from '../../../shared/cards';
import type { CardId } from '../../../shared/cards';
import type { Color } from '../../../shared/chess';
import { itemById } from '../../../shared/catalog';
import { Spinner } from '../../components/Layout';
import { CabinBoard } from './CabinBoard';
import type { PlayRequest } from './CabinBoard';
import { SpellSeal } from './ItemThumb';
import { KingPortrait } from './KingPortrait';
import { Unboxing } from './Unboxing';
import { gemOf } from './trial';
import type { Trial } from './trial';

export type CabinView = 'roi' | 'partie';

interface Props {
  view: CabinView;
  onView: (v: CabinView) => void;
  trial: Trial;
  /** Change quand des sorts sont essayés : une courte série de sorts part (sauf mouvement réduit). */
  spellKick: number;
  reduced: boolean;
  /** Paiements fermés : bandeau doré en tête de cabine. */
  soon: boolean;
  confirming: boolean;
  unbox: string[] | null;
  onUnboxDone: () => void;
  /** Annonce lue par les lecteurs d'écran (essai, prix). */
  live: string;
  onCasting: (on: boolean) => void;
  /** « Surprenez-moi » en tête de cabine (téléphone ; ailleurs, il est dans les onglets des rayons). */
  onSurprise: () => void;
  /** Barre de panoplie et ligne d'action. */
  children: ReactNode;
}

export function Cabin({ view, onView, trial, spellKick, reduced, soon, confirming, unbox, onUnboxDone, live, onCasting, onSurprise, children }: Props) {
  const viewRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<Color>('w');
  const [play, setPlay] = useState<PlayRequest>({ key: 0, count: 0 });
  const [casting, setCasting] = useState<CardId | null>(null);
  const [ran, setRan] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [noScene, setNoScene] = useState(false);
  const [fallback, setFallback] = useState(0);
  const kickRef = useRef(spellKick);

  // Hors de l'écran : la vue En partie ne lance rien
  useEffect(() => {
    const el = viewRef.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Changement de vue ou de côté : la série en cours s'arrête. Déclaré avant l'effet suivant : quand l'essai de sorts
  // ouvre la vue En partie, la série demandée passe après cet arrêt.
  useEffect(() => {
    setCasting(null);
    setPlay(p => ({ key: p.key + 1, count: 0 }));
  }, [view, side]);

  // Sorts essayés : au plus 3 sorts à la suite (aucun avec le mouvement réduit)
  useEffect(() => {
    if (kickRef.current === spellKick) return;
    kickRef.current = spellKick;
    if (reduced) return;
    setRan(false);
    setPlay(p => ({ key: p.key + 1, count: 3 }));
  }, [spellKick, reduced]);

  useEffect(() => onCasting(!!casting), [casting, onCasting]);

  const castOne = () => {
    if (noScene) {
      setFallback(n => n + 1);
      return;
    }
    setRan(false);
    setPlay(p => ({ key: p.key + 1, count: 1 }));
  };

  const skin = itemById(trial.skin);
  const gem = gemOf(trial.king);
  return (
    <section
      className={`cab cab-${view} ${soon ? 'is-soon' : ''}`}
      aria-label="Cabine d’essayage"
      style={{ '--gem': gem, '--sp': skin?.skin?.primary } as CSSProperties}
    >
      <div className="cab-top">
        <span className="cab-k">
          Cabine <span className="cab-k-long">d’essayage</span>
        </span>
        <button type="button" className="cab-surprise" onClick={onSurprise}>
          ✦ Surprenez-moi
        </button>
        <div className="seg" role="group" aria-label="Vue de la cabine">
          <button type="button" className={view === 'roi' ? 'on' : ''} aria-pressed={view === 'roi'} onClick={() => onView('roi')}>
            <span className="seg-long">Portrait du roi</span>
            <span className="seg-short">Le roi</span>
          </button>
          <button type="button" className={view === 'partie' ? 'on' : ''} aria-pressed={view === 'partie'} onClick={() => onView('partie')}>
            En partie
          </button>
        </div>
      </div>
      {soon && <p className="cab-soon">Le Bazar ouvre bientôt. Essayez tout dès maintenant : les achats arrivent.</p>}
      <div className="cab-view" ref={viewRef}>
        {view === 'roi' ? (
          <KingPortrait king={trial.king} board={trial.board} />
        ) : (
          <div className="cab-game">
            <CabinBoard
              key={side}
              theme={trial.board}
              king={trial.king}
              skin={trial.skin}
              side={side}
              play={play}
              paused={!onScreen}
              onCast={setCasting}
              onIdle={() => setRan(true)}
              onNoScene={() => setNoScene(true)}
            />
            {fallback > 0 && <SpellSeal key={fallback} id={trial.skin} className="cab-fallback" />}
            <div className="cab-under">
              <div className="cab-side seg" role="group" aria-label="Côté joué">
                <button type="button" className={side === 'w' ? 'on' : ''} aria-pressed={side === 'w'} onClick={() => setSide('w')}>
                  <span className="side-long">Je joue les </span>Blancs
                </button>
                <button type="button" className={side === 'b' ? 'on' : ''} aria-pressed={side === 'b'} onClick={() => setSide('b')}>
                  <span className="side-long">les </span>Noirs
                </button>
              </div>
              <div className="cab-cap">
                {casting ? (
                  <>
                    <span className="cab-dot" />
                    <span className="cab-cap-k">Sort en cours</span>
                    <b>{CARDS[casting]?.name}</b>
                    <span className="cab-cap-skin">sorts {skin?.name}</span>
                  </>
                ) : (
                  <button type="button" className="cab-cast" onClick={castOne}>
                    <span className="cab-dot" />✦ {ran ? 'Encore un sort' : 'Lancer un sort'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {unbox && <Unboxing key={unbox.join()} items={unbox} onDone={onUnboxDone} />}
        {confirming && (
          <div className="cab-wait" role="status">
            <Spinner /> Validation de votre paiement…
          </div>
        )}
      </div>
      {children}
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
    </section>
  );
}
