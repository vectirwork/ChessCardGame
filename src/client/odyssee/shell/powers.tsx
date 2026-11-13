// Pouvoirs en cours, pendant une partie (accueil et partie en ligne) : qu'on sache toujours ce qui agit sur
// l'échiquier, pour combien de temps, et ce que ça change.
//
// Ordinateur : une liste dans la colonne de gauche. Pour chaque pouvoir : sa scène explicative en image fixe (elle
// s'anime seulement au survol : rien ne bouge pendant la partie sans qu'on le demande), son nom, qui l'a lancé, le
// temps restant (points qui s'éteignent, ou « toute la partie »), et sa règle en une phrase.
// Mobile : une rangée de pastilles ; toucher une pastille ouvre une fiche avec la scène et la règle.
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Color } from '../../../shared/chess';
import { CARDS } from '../../../shared/cards';
import type { Effect } from '../../../shared/game';
import { compte, ordinalLettres } from '../../../shared/text/fr';
import { coupsAvantArrivee, prochainTour } from '../../../shared/text/regles';
import { CardEmblem } from '../../components/CardArt';
import { CardScene, scenePaired } from '../../components/CardScene';
import { cardTexts } from '../../components/SpellCard';
import type { CardRules } from '../../components/SpellCard';
import { deNom } from '../../game/names';

const COLOR_NAME: Record<Color, string> = { w: 'Blancs', b: 'Noirs' };

export interface PowersProps {
  effects: Effect[];
  /** Couleur du visiteur ; null pour un spectateur. */
  you: Color | null;
  /** Nom de chaque camp (« L'Oracle », « Bruno »…), pour dire qui a lancé le pouvoir. */
  names?: Partial<Record<Color, string>>;
  mobile: boolean;
  /** Règles de la partie (rulesOf(state)) : règle de chaque pouvoir selon l'équilibrage de la partie (cardTexts). */
  rules?: CardRules;
}

/** Qui a lancé le pouvoir et, s'il est seulement annoncé, quand il arrive. */
export function powerTiming(e: Effect, you: Color | null, names?: PowersProps['names']): string {
  const mine = you !== null && e.caster === you;
  const caster = mine ? 'Vous' : names?.[e.caster] ?? `Les ${COLOR_NAME[e.caster]}`;
  if (e.pending) {
    // Annoncé : il arrive au début d'un tour de son lanceur (le prochain, au délai des Présages par défaut), après le
    // coup de l'autre camp. `delay` : demi-coups restants avant l'arrivée.
    let when: string;
    const tour = prochainTour(e.delay ?? 2);
    if (mine) when = `arrive au début de ${tour}`;
    else if (!you) when = `arrive au début de ${tour.replace(/^votre /, 'leur ')}`;
    else {
      // Vu par l'adversaire du lanceur : après combien de ses coups (le coup en cours compris s'il a le trait)
      const delay = e.delay ?? 1;
      const k = coupsAvantArrivee(delay);
      when = k > 1 ? `arrive après votre ${ordinalLettres(k)} coup à venir` : delay > 1 ? 'arrive après votre prochain coup' : 'arrive après votre coup';
    }
    return `${caster} · annoncé, ${when}`;
  }
  return mine ? 'Votre sort' : `Sort ${deNom(caster)}`;
}

/** Temps restant : à venir, toute la partie, ou encore n coups (des deux camps). */
export function powerLeft(e: Effect): string {
  if (e.pending) return 'à venir';
  if (e.permanent) return 'toute la partie';
  return `encore ${compte(e.remaining, 'coup')}`;
}

function Pips({ e }: { e: Effect }) {
  if (e.pending || e.permanent || !e.total || e.total > 8) return null;
  return (
    <span className="gs-pw-pips" aria-hidden="true">
      {Array.from({ length: e.total }, (_, i) => (
        <i key={i} className={i < e.remaining ? 'on' : ''} />
      ))}
    </span>
  );
}

/** Ordre : ce qui agit déjà, puis ce qui arrive ; les effets d'une même carte restent groupés. */
function sorted(effects: Effect[]) {
  return [...effects].filter(e => CARDS[e.card]).sort((a, b) => Number(!!a.pending) - Number(!!b.pending));
}

/** Plusieurs Murs de glace : une seule ligne « Mur de glace ×3 ». */
function grouped(effects: Effect[]) {
  const out: { e: Effect; n: number }[] = [];
  for (const e of sorted(effects)) {
    const same = out.find(o => o.e.card === e.card && !!o.e.pending === !!e.pending && o.e.permanent && e.permanent);
    if (same) same.n++;
    else out.push({ e, n: 1 });
  }
  return out;
}

function Detail({ e, n, you, names, active = false, sheet = false }: { e: Effect; n: number; you: Color | null; names: PowersProps['names']; active?: boolean; sheet?: boolean }) {
  const def = CARDS[e.card];
  return (
    <>
      <div className={`gs-pw-scene ${scenePaired(e.card) ? 'is-pair' : ''}`}>
        <CardScene id={e.card} play="hover" active={active} labels={sheet} />
      </div>
      <div className="gs-pw-txt">
        <div className="gs-pw-head">
          <b>
            {def.name}
            {n > 1 && <span className="gs-pw-count"> ×{n}</span>}
          </b>
          <span className="gs-pw-left">
            <Pips e={e} />
            {powerLeft(e)}
          </span>
        </div>
        <small>{powerTiming(e, you, names)}</small>
        <p className="gs-pw-rule">{def.tagline}</p>
      </div>
    </>
  );
}

export function PowersPanel({ effects, you, names, mobile, rules }: PowersProps) {
  const [open, setOpen] = useState<number | null>(null);
  const chipsRef = useRef<HTMLUListElement>(null);
  /** Ordinateur : la scène d'un pouvoir s'anime tant que la souris est sur sa ligne. */
  const [hovered, setHovered] = useState<number | null>(null);
  const list = grouped(effects);
  const openFx = open !== null ? list.find(o => o.e.id === open) : undefined;
  useEffect(() => {
    if (open === null) return;
    const onKey = (k: KeyboardEvent) => k.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => {
    if (open !== null && !openFx) setOpen(null);
  }, [open, openFx]);
  if (!list.length) return null;

  if (mobile) {
    return (
      <>
        <ul className="gs-pw-chips" aria-label="Pouvoirs en cours" ref={chipsRef}>
          {list.map(({ e, n }) => {
            const def = CARDS[e.card];
            return (
              <li key={e.id}>
                <button type="button" className={`gs-pw-chip ${e.pending ? 'is-pending' : ''}`} style={{ '--h': def.hue } as CSSProperties} onClick={() => setOpen(e.id)} aria-label={`${def.name}, ${powerLeft(e)} : voir la règle`}>
                  <span className="gs-pw-em" aria-hidden="true">
                    <CardEmblem id={e.card} />
                  </span>
                  <b>
                    {def.name}
                    {n > 1 ? ` ×${n}` : ''}
                  </b>
                  <span>{e.pending ? 'à venir' : e.permanent ? '∞' : e.remaining}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {openFx &&
          createPortal(
            <div className="gs-sheet-veil" onClick={() => setOpen(null)}>
              <div className="gs-sheet gs-pw-sheet" role="dialog" aria-label={CARDS[openFx.e.card].name} style={{ '--h': CARDS[openFx.e.card].hue } as CSSProperties} onClick={ev => ev.stopPropagation()}>
                <div className="gs-pw-row is-sheet">
                  {/* La fiche a été ouverte pour voir ce pouvoir : sa scène se joue */}
                  <Detail e={openFx.e} n={openFx.n} you={you} names={names} active sheet />
                </div>
                <p className="gs-pw-desc">{cardTexts(CARDS[openFx.e.card], rules).description}</p>
                <button type="button" className="btn-line gs-sheet-close" onClick={() => setOpen(null)}>
                  Fermer
                </button>
              </div>
            </div>,
            // Dans la coque, hors du panneau de statut (qui défile et peut s'estomper)
            chipsRef.current?.closest('.gs') ?? document.body,
          )}
      </>
    );
  }

  return (
    <section className="gs-pw" aria-label="Pouvoirs en cours">
      <p className="gs-pw-title">Pouvoirs en cours</p>
      <ul>
        {list.map(({ e, n }) => (
          <li
            key={e.id}
            className={`gs-pw-row ${e.pending ? 'is-pending' : ''}`}
            style={{ '--h': CARDS[e.card].hue } as CSSProperties}
            title={cardTexts(CARDS[e.card], rules).description}
            onMouseEnter={() => setHovered(e.id)}
            onMouseLeave={() => setHovered(h => (h === e.id ? null : h))}
          >
            <Detail e={e} n={n} you={you} names={names} active={hovered === e.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}
