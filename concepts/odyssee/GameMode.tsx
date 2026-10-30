// Partie en plein écran : l'échiquier (rendu dans le calque « astre » par portail), le HUD et l'éventail de cartes.
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { Board } from '../../src/client/components/Board';
import { CardBack, SpellCard } from '../../src/client/components/SpellCard';
import { CARDS } from '../../src/shared/cards';
import { useLocalGame } from '../_shared/localGame';

const REASONS: Record<string, string> = {
  checkmate: 'par échec et mat',
  stalemate: 'par pat',
  repetition: 'par triple répétition',
  fifty: 'par la règle des 50 coups',
  insufficient: 'faute de matériel',
  resign: 'par abandon',
  timeout: 'au temps',
  agreement: 'par accord mutuel',
  abandon: 'par abandon',
  aborted: 'partie annulée',
};

const FAN = [
  { r: -7, x: 0, y: 14 },
  { r: 0, x: 0, y: 0 },
  { r: 7, x: 0, y: 14 },
];

interface Props {
  slot: HTMLElement | null;
  theme: string;
  skin: string;
  skinName: string;
  level: string;
  /** Faux quand on est revenu à la page : la partie reste en vie, en pause, prête à reprendre. */
  active: boolean;
  onExit: () => void;
  onProgress: (ply: number, over: boolean) => void;
}

/** Repère le calque WebGL créé pour l'échiquier de la partie, pour le masquer quand la partie est en pause. */
function useTagGameCanvas() {
  useEffect(() => {
    const tag = (n: Node) => {
      if (n instanceof HTMLCanvasElement && n.classList.contains('vfx-canvas') && !n.classList.contains('stage-canvas')) {
        n.classList.add('game-canvas');
        return true;
      }
      return false;
    };
    const mo = new MutationObserver(list => {
      for (const m of list) for (const n of Array.from(m.addedNodes)) if (tag(n)) mo.disconnect();
    });
    mo.observe(document.body, { childList: true });
    const t = window.setTimeout(() => mo.disconnect(), 4000);
    return () => {
      mo.disconnect();
      window.clearTimeout(t);
    };
  }, []);
}

export function GameMode({ slot, theme, skin, skinName, level, active, onExit, onProgress }: Props) {
  const g = useLocalGame({ skin, theme });
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  useTagGameCanvas();

  useEffect(() => {
    if (!active) {
      setToast(null);
      return;
    }
    const ctx = gsap.context(() => {
      gsap.from('.fan-slot', { y: 340, rotation: (i: number) => [-28, 0, 28][i], opacity: 0, duration: 1.15, ease: 'expo.out', stagger: 0.09 });
      gsap.from('.hud-in', { y: 22, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06, delay: 0.05 });
    });
    return () => ctx.revert();
  }, [active]);

  useEffect(() => {
    onProgress(g.state.ply, !!g.result);
  }, [g.state.ply, g.result, onProgress]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (g.selectedDef) g.cancel();
      else onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [g, onExit, active]);

  useEffect(() => {
    if (!g.lastCast) return;
    const name = CARDS[g.lastCast.card as keyof typeof CARDS]?.name ?? '';
    setToast({ text: g.lastCast.by === 'bot' ? `L'Oracle lance ${name}` : `Tu lances ${name}`, key: g.lastCast.key });
  }, [g.lastCast]);

  const turn = g.state.pos.turn;
  const inCheck = g.boardProps.check !== null && turn === 'w' && !g.result;
  let status: string;
  if (g.result) status = g.result.winner === 'w' ? 'Victoire.' : g.result.winner === 'b' ? 'Défaite.' : 'Partie nulle.';
  else if (turn === 'b') status = "L'Oracle réfléchit…";
  else if (g.busy) status = 'Le sort se déploie…';
  else if (inCheck) status = 'Échec au roi.';
  else status = 'À toi de jouer.';

  const botHand = g.state.hands.b;
  const moveNo = Math.floor(g.state.ply / 2) + 1;

  const backs = (
    <div className="oracle-hand" aria-label="Cartes de l'adversaire">
      {botHand.map((h, i) => (
        <CardBack key={i} size="mini" used={h.used} />
      ))}
    </div>
  );

  return (
    <>
      {slot && createPortal(<Board ref={g.boardRef} {...g.boardProps} />, slot)}

      {active && (
      <div className="hud" role="region" aria-label="Partie en cours">
        <div className="hud-top hud-in">
          <button className="back" onClick={onExit}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Retour à l'Odyssée
          </button>
          <span className="hud-badge">Partie anonyme · aucun compte</span>
        </div>

        <div className="hud-status">
          <p className="hud-kicker hud-in">Coup {moveNo} · L'Oracle, {level.toLowerCase()}</p>
          <h2 className="hud-title hud-in" aria-live="polite">
            {status}
          </h2>
          {g.result ? (
            <div className="hud-in hud-result">
              <p>{REASONS[g.result.reason] ? `Partie terminée ${REASONS[g.result.reason]}.` : 'Partie terminée.'}</p>
              <div className="hud-actions">
                <button className="btn-gold sm" onClick={g.reset}>Rejouer</button>
                <button className="btn-line" onClick={onExit}>Retour à la page</button>
              </div>
            </div>
          ) : g.selectedDef ? (
            <div className="hud-prompt hud-in" style={{ '--h': g.selectedDef.hue } as CSSProperties}>
              <p className="hud-spell">{g.selectedDef.name}</p>
              <p>{g.prompt}</p>
              <div className="hud-actions">
                {g.selectedDef.targets === 0 && (
                  <button className="btn-gold sm" onClick={g.castSelected}>
                    Lancer le sort
                  </button>
                )}
                <button className="btn-line" onClick={g.cancel}>Annuler</button>
              </div>
            </div>
          ) : (
            <div className="hud-in">
              <p className="hud-hint">
                Lance une carte avant ton coup, ou joue directement.
                <br />
                <span>Une seule carte par tour · skin {skinName}</span>
                <br />
                <span>Retourne à l'Odyssée quand tu veux : la partie t'attend.</span>
              </p>
              {g.state.ply > 0 && (
                <button className="hud-restart" onClick={g.reset}>
                  Nouvelle partie
                </button>
              )}
            </div>
          )}
          {!g.selectedDef && (
            <div className="oracle-hand-m">
              <span>Main de L'Oracle</span>
              {backs}
            </div>
          )}
          {toast && (
            <p key={toast.key} className="hud-toast">
              {toast.text}
            </p>
          )}
        </div>

        <div className="hud-opponent hud-in">
          <div className="oracle">
            <span className="oracle-eye" aria-hidden="true" />
            <div>
              <b>L'Oracle</b>
              <span>IA · niveau {level}</span>
            </div>
          </div>
          {backs}
        </div>

        <div className="fan" aria-label="Tes cartes">
          <span className="fan-label hud-in">Ta main · un sort par tour</span>
          {g.hand.map((h, i) =>
            h.card ? (
              <div key={i} className="fan-slot">
                <div
                  className={`fan-card ${g.selected === i ? 'is-sel' : ''}`}
                  style={{ '--fr': `${FAN[i].r}deg`, '--fx': `${FAN[i].x}px`, '--fy': `${FAN[i].y}px` } as CSSProperties}
                >
                  <SpellCard
                    id={h.card}
                    size="hand"
                    used={h.used}
                    selected={g.selected === i}
                    disabled={!h.used && !g.playable[i]}
                    onClick={() => g.pickCard(i)}
                  />
                </div>
              </div>
            ) : null,
          )}
        </div>
      </div>
      )}
    </>
  );
}
