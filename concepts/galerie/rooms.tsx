// Spellmate · La Galerie : les cinq salles de la visite.
import { useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { Board } from '../../src/client/components/Board';
import { CardEmblem } from '../../src/client/components/CardArt';
import { DemoBoard } from '../../src/client/components/DemoBoard';
import { SpellCard } from '../../src/client/components/SpellCard';
import { CARDS, RARITY_LABEL } from '../../src/shared/cards';
import type { CardId } from '../../src/shared/cards';
import { initialPosition } from '../../src/shared/chess';
import { formatPrice, itemById } from '../../src/shared/catalog';
import type { Effect } from '../../src/shared/game';
import type { Position } from '../../src/shared/chess';
import { Cabinet, Prochaine } from './cabinet';
import { BOARDS, COLLECTION, ELO_CURVE, LEGAL, LEVELS, MASTERPIECE, PACK, RULES, SKINS, WINGS } from './data';
import { HOUSE_BOARD, HOUSE_SKIN } from './maison';
import { Arrow, Eyebrow, Lines, Star, useInView } from './ui';

const STATIC_POS = initialPosition().pos;
const pad = (n: number) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------------------------
// 01 · Le Hall

/** Partie en pause : le Hall l'expose, figée, à la place de la démonstration. */
export interface Paused {
  pos: Position;
  lastMove: { from: number; to: number } | null;
  effects: Effect[];
  ply: number;
}

interface HallProps {
  hand: CardId[];
  boardRef: RefObject<HTMLDivElement | null>;
  live: boolean;
  paused: Paused | null;
  onPlay: () => void;
  onVisit: () => void;
}

export const FAN = [-13, -3, 8];

export function Hall({ hand, boardRef, live, paused, onPlay, onVisit }: HallProps) {
  const [caption, setCaption] = useState('');
  const inView = useInView(boardRef);
  const resume = !!paused;
  const move = paused ? Math.floor(paused.ply / 2) + 1 : 0;
  return (
    <section className="room hall" data-room="hall" aria-label="Le Hall">
      <div className="hall-copy">
        <p className="eyebrow hall-eb">
          <span className="eb-num">01</span>
          <span className="eb-rule" />
          <span>Le Hall · Maison de jeu, saison I</span>
        </p>
        <h1 className="hall-title lines" data-intro="lines">
          <span className="ln"><span className="ln-in">Les échecs</span></span>
          <span className="ln"><span className="ln-in">ont des</span></span>
          <span className="ln"><span className="ln-in"><em>pouvoirs</em><span className="verm">.</span></span></span>
        </h1>
        <div className="hall-under" data-intro="up">
          <p className="hall-lede">
            Une vraie partie d’échecs, et trois cartes de pouvoir en main. À votre tour, avant de jouer, lancez-en une : la foudre,
            la glace, le temps qui recule. <b>Gratuit, sans compte, sans pay-to-win.</b>
          </p>
          <div className="hall-cta">
            <button className="btn-play" onClick={onPlay}>
              <span className="bp-fill" />
              <span className="bp-text">
                <span className="bp-main">{resume ? 'Reprendre la partie' : 'Jouer maintenant'}</span>
                <span className="bp-sub">En anonyme, contre l’Automate</span>
              </span>
              <span className="bp-arrow"><Arrow size={22} /></span>
            </button>
            <button className="btn-link" onClick={onVisit}>
              Visiter la galerie <Arrow size={16} />
            </button>
          </div>
        </div>
      </div>

      <figure className="hall-piece">
        <button className="sceau" onClick={onPlay} aria-label="Jouer maintenant, en anonyme" data-intro="up">
          <svg viewBox="0 0 120 120" className="sceau-txt" aria-hidden="true">
            <defs>
              <path id="sceau-c" d="M60 60 m-45 0 a45 45 0 1 1 90 0 a45 45 0 1 1 -90 0" />
            </defs>
            <text>
              <textPath href="#sceau-c" textLength="280" lengthAdjust="spacing">
                Entrée libre · Sans compte · Jouer ·
              </textPath>
            </text>
          </svg>
          <Star size={22} className="verm sceau-star" />
        </button>
        <div className="plinth" data-intro="curtain">
          <div className="hall-board maison" ref={boardRef}>
            {paused ? (
              <Board pos={paused.pos} orientation="w" theme={HOUSE_BOARD} lastMove={paused.lastMove} effects={paused.effects} locked coords={false} />
            ) : live && inView ? (
              <DemoBoard theme={HOUSE_BOARD} skin={HOUSE_SKIN} onCaption={setCaption} />
            ) : (
              <Board pos={STATIC_POS} orientation="w" theme={HOUSE_BOARD} locked coords={false} />
            )}
          </div>
          <span className="socle" aria-hidden="true">Spellmate · Maison de jeu · MMXXVI</span>
          <div className="curtain" />
        </div>
        <div className="hall-hand" aria-label="Votre main pour la prochaine partie">
          {hand.map((id, i) => (
            <div
              key={`${id}-${i}`}
              className="hh-slot"
              data-intro="deal"
              style={{ '--r': `${FAN[i]}deg`, '--i': i } as CSSProperties}
            >
              <SpellCard id={id} size="hand" tilt={false} />
            </div>
          ))}
          <span className="hh-label" data-intro="up">Votre main est déjà distribuée</span>
        </div>
        <figcaption className="cartel hall-cartel" data-intro="up">
          {paused ? (
            <>
              <span className="ct-num">N° 001 · En pause</span>
              <span className="ct-title"><em>Votre partie</em>, coup {move}</span>
              <span className="ct-line">Échiquier ivoire et taupe. Vous jouez les Blancs, l’Automate attend votre coup.</span>
              <span className="ct-live"><i className="live-dot" />En attente de votre retour</span>
            </>
          ) : (
            <>
              <span className="ct-num">N° 001</span>
              <span className="ct-title"><em>La partie en cours</em>, 2026</span>
              <span className="ct-line">Échiquier ivoire et taupe, onze sortilèges. Jouée en direct par deux automates.</span>
              <span className="ct-live"><i className="live-dot" />{caption ? `Dernier sort : ${caption.replace(' · skin Encre & vermillon', '')}` : 'Démonstration en direct'}</span>
            </>
          )}
        </figcaption>
      </figure>

    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// 02 · La Salle des pouvoirs

function Vitrine({ id, n, place, note, onExamine }: { id: CardId; n: number; place: string; note?: string; onExamine: (id: CardId) => void }) {
  const def = CARDS[id];
  return (
    <article className={`vitrine v-${place}`}>
      {place === 'phare' && <div className="v-light" data-par="0.05" />}
      <div
        className="v-case"
        data-rv="curtain"
        data-cursor="Examiner"
        role="button"
        tabIndex={0}
        aria-label={`Examiner ${def.name}`}
        onClick={() => onExamine(id)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onExamine(id);
          }
        }}
      >
        <div className="v-glass" data-par="0.07" />
        <div className="v-card">
          <SpellCard id={id} size="hand" tilt={false} />
        </div>
        <span className="v-pin v-pin-l" />
        <span className="v-pin v-pin-r" />
        <span className="v-loupe" aria-hidden="true">Examiner</span>
        <div className="curtain" />
      </div>
      {place === 'phare' && <span className="v-socle" aria-hidden="true" />}
      <div className="v-cartel" data-rv="up">
        <div className="v-head">
          <span className="v-num">N° {pad(n)}{place === 'phare' ? ' · pièce phare' : ''}</span>
          <CardEmblem id={id} className="v-emb" />
        </div>
        <h3 className="v-name">{def.name}</h3>
        <p className="v-meta">{RARITY_LABEL[def.rarity]} · {def.duration}</p>
        <p className="v-tag">« {def.tagline} »</p>
        <p className="v-desc">{def.description}</p>
        {note && <p className="v-note">{note}</p>}
      </div>
    </article>
  );
}

export function Pouvoirs({ onExamine }: { onExamine: (id: CardId) => void }) {
  const chef = CARDS[MASTERPIECE];
  const num = (id: CardId) => COLLECTION.indexOf(id) + 1;
  return (
    <section className="room pouvoirs" data-room="pouvoirs" aria-label="La Salle des pouvoirs">
      <span className="room-sign" aria-hidden="true">Salle 02 · Salle des pouvoirs</span>
      <div className="entree">
        <div className="arche" data-par="-0.12" />
        <Eyebrow num="02">Salle des pouvoirs · Collection permanente</Eyebrow>
        <Lines lines={['La Salle', <>des <em>pouvoirs</em></>]} className="room-title" />
        <p className="entree-lede" data-rv="up">
          Onze cartes, onze façons de renverser une partie, accrochées en trois ailes. Le règlement tient sur un cartel.
        </p>
        <ol className="rules">
          {RULES.map(r => (
            <li key={r.n} data-rv="up">
              <span className="r-n">{r.n}</span>
              <span className="r-title">{r.title}</span>
              <span className="r-text">{r.text}</span>
            </li>
          ))}
        </ol>
      </div>

      {WINGS.map(w => (
        <div className={`aile aile-${w.id}`} key={w.id}>
          <div className="aile-light" data-par="0.05" />
          <header className="aile-head">
            <span className="aile-n" data-par="0.04">{w.n}</span>
            <Eyebrow>Aile {w.n} · {w.cards.length + 1} {w.cards.length ? 'pièces' : 'pièce'}</Eyebrow>
            <Lines lines={[w.title[0], <em key="t">{w.title[1]}</em>]} className="aile-title" as="h3" />
            <p className="aile-text" data-rv="up">{w.text}</p>
          </header>
          <Vitrine id={w.flagship} n={num(w.flagship)} place="phare" onExamine={onExamine} />
          {w.cards.map(c => (
            <Vitrine key={c.id} id={c.id} n={num(c.id)} place={c.place} note={c.note} onExamine={onExamine} />
          ))}
        </div>
      ))}

      <div className="chef">
        <div className="chef-light" data-par="0.08" />
        <div
          className="chef-case"
          data-rv="curtain"
          data-cursor="Examiner"
          role="button"
          tabIndex={0}
          aria-label={`Examiner ${chef.name}`}
          onClick={() => onExamine(MASTERPIECE)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onExamine(MASTERPIECE);
            }
          }}
        >
          <div className="v-glass" data-par="0.07" />
          <div className="v-card">
            <SpellCard id={MASTERPIECE} size="hand" tilt={false} />
          </div>
          <div className="curtain" />
        </div>
        <div className="chef-text">
          <Eyebrow num="N° 11">Pièce maîtresse · seule légendaire</Eyebrow>
          <Lines lines={[<em key="a">Retour</em>, 'arrière']} className="chef-title" as="h3" />
          <p className="v-meta" data-rv="up">{RARITY_LABEL[chef.rarity]} · {chef.duration}</p>
          <p className="chef-tag" data-rv="up">« {chef.tagline} »</p>
          <p className="chef-desc" data-rv="up">{chef.description}</p>
        </div>
      </div>

      <Cabinet />
      <Prochaine />
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// 03 · L'Atelier des skins

function Swatch({ style }: { style: (typeof BOARDS)[number]['style'] }) {
  const vars = { '--light': style.light, '--dark': style.dark, '--frame': style.frame } as CSSProperties;
  return (
    <div className={`swatch tex-${style.texture}`} style={vars}>
      {Array.from({ length: 16 }, (_, k) => (
        <span key={k} className={`sq ${((k >> 2) + k) % 2 ? 'd' : 'l'}`} />
      ))}
    </div>
  );
}

/** Six silhouettes de flacon, une par essence : colonne, facettes, tube, sphère, galet, goutte. */
const FLASKS = [
  {
    body: 'M30 60 Q30 46 44 44 L56 44 Q70 46 70 60 L70 140 Q70 148 62 148 L38 148 Q30 148 30 140 Z',
    neck: 'M44 30 H56 V45 H44 Z',
    cap: <><circle cx="50" cy="19" r="11" className="fl-stopper-glass" /><rect x="41" y="28" width="18" height="5" rx="1" className="fl-cap" /></>,
    liquid: 78,
    label: [36, 98, 28, 26],
    facets: '',
  },
  {
    body: 'M24 66 L36 52 L64 52 L76 66 L76 132 L64 148 L36 148 L24 132 Z',
    neck: 'M43 40 H57 V53 H43 Z',
    cap: <><path d="M37 14 L63 14 L67 30 L33 30 Z" className="fl-cap" /><path d="M41 30 H59 V40 H41 Z" className="fl-cap" /></>,
    liquid: 80,
    label: [34, 94, 32, 28],
    facets: 'M36 52 V148 M64 52 V148',
  },
  {
    body: 'M37 38 Q37 34 41 34 L59 34 Q63 34 63 38 L63 144 Q63 148 59 148 L41 148 Q37 148 37 144 Z',
    neck: '',
    cap: <><rect x="35" y="16" width="30" height="18" rx="2" className="fl-cap" /><path d="M39 20 V30 M44 20 V30 M49 20 V30 M54 20 V30 M59 20 V30" className="fl-ridge" /></>,
    liquid: 70,
    label: [39, 86, 22, 40],
    facets: '',
  },
  {
    body: 'M14 112 A36 36 0 1 0 86 112 A36 36 0 1 0 14 112 Z',
    neck: 'M45 52 H55 V78 H45 Z',
    cap: <path d="M50 22 L53.5 34.5 L66 38 L53.5 41.5 L50 54 L46.5 41.5 L34 38 L46.5 34.5 Z" className="fl-cap" />,
    liquid: 104,
    label: [32, 106, 36, 20],
    facets: '',
  },
  {
    body: 'M12 122 Q12 88 50 88 Q88 88 88 122 Q88 148 50 148 Q12 148 12 122 Z',
    neck: 'M44 72 H56 V90 H44 Z',
    cap: <><rect x="39" y="52" width="22" height="20" rx="1" className="fl-cap" /><path d="M39 58 H61" className="fl-ridge" /></>,
    liquid: 110,
    label: [30, 110, 40, 20],
    facets: '',
  },
  {
    body: 'M50 54 C66 78 80 96 80 118 C80 136 66 148 50 148 C34 148 20 136 20 118 C20 96 34 78 50 54 Z',
    neck: 'M46 40 H54 V58 H46 Z',
    cap: <><ellipse cx="50" cy="27" rx="8" ry="13" className="fl-cap" /><rect x="43" y="37" width="14" height="4" rx="1" className="fl-cap" /></>,
    liquid: 100,
    label: [34, 106, 32, 22],
    facets: '',
  },
];

function Bottle({ id, k, name, refNo, p, s2, a }: { id: string; k: number; name: string; refNo: string; p: string; s2: string; a: string }) {
  const f = FLASKS[k % FLASKS.length];
  const gid = `fl-${id.replace(':', '-')}`;
  const [lx, ly, lw, lh] = f.label;
  const fs = Math.min(7.6, (lw - 5) / (name.length * 0.42));
  const y = f.liquid;
  return (
    <svg viewBox="0 0 100 160" className="fl-svg" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor={a} stopOpacity="0.95" />
          <stop offset="0.4" stopColor={p} />
          <stop offset="1" stopColor={s2} />
        </linearGradient>
        <linearGradient id={`${gid}-g`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.18" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0.05" />
          <stop offset="0.92" stopColor="#16130f" stopOpacity="0.12" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.4" />
        </linearGradient>
        <radialGradient id={`${gid}-r`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={p} stopOpacity="0.38" />
          <stop offset="1" stopColor={p} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${gid}-c`}>
          <path d={f.body} />
        </clipPath>
      </defs>
      <ellipse cx="50" cy="152" rx="40" ry="5" className="fl-shadow" />
      <ellipse cx="58" cy="152" rx="30" ry="6" fill={`url(#${gid}-r)`} />
      {f.neck && <path d={f.neck} className="fl-neck" />}
      <g clipPath={`url(#${gid}-c)`}>
        <rect x="0" y="0" width="100" height="160" className="fl-glass" />
        <g className="fl-liquid">
          <path d={`M-100 ${y} Q-87.5 ${y - 5} -75 ${y} T-50 ${y} T-25 ${y} T0 ${y} T25 ${y} T50 ${y} T75 ${y} T100 ${y} T125 ${y} T150 ${y} T175 ${y} T200 ${y} V160 H-100 Z`} fill={`url(#${gid})`} />
        </g>
        <path d={f.body} fill={`url(#${gid}-g)`} />
        {f.facets && <path d={f.facets} className="fl-facet" />}
        <path d={`M0 ${y + 3} H100`} className="fl-meniscus" />
      </g>
      <path d={f.body} className="fl-outline" />
      {f.cap}
      <rect x={lx} y={ly} width={lw} height={lh} className="fl-label" />
      <text x={50} y={ly + lh / 2 + fs * 0.1} className="fl-lbl-name" textAnchor="middle" style={{ fontSize: fs }}>{name}</text>
      <text x={50} y={ly + lh - 3.2} className="fl-lbl-ref" textAnchor="middle">{refNo}</text>
    </svg>
  );
}

export function Atelier() {
  const [skin, setSkin] = useState('skin:inferno');
  const [board, setBoard] = useState('board:marble');
  const caseRef = useRef<HTMLDivElement>(null);
  const inView = useInView(caseRef);
  const skinName = itemById(skin)?.name ?? '';
  const boardName = itemById(board)?.name ?? '';
  return (
    <section className="room atelier" data-room="atelier" aria-label="L’Atelier des skins">
      <span className="room-sign" aria-hidden="true">Salle 03 · Atelier des skins</span>
      <div className="entree">
        <div className="arche" data-par="-0.12" />
        <Eyebrow num="03">Atelier · Objets cosmétiques</Eyebrow>
        <Lines lines={['L’Atelier', <>des <em>skins</em></>]} className="room-title" />
        <div className="zero" data-rv="up">
          <span className="zero-big"><em>Zéro</em></span>
          <span className="zero-txt">pay-to-win.<br />C’est écrit au mur.</span>
        </div>
        <p className="entree-lede" data-rv="up">
          Ici, on ne vend que de l’éclat : la manière dont vos sorts explosent, la matière de votre échiquier. Jamais leur effet. Les onze
          cartes sont les mêmes pour tous.
        </p>
        <dl className="contrat" data-rv="up">
          <div><dt>Cartes</dt><dd>Identiques pour tous</dd></div>
          <div><dt>Règles</dt><dd>Inchangées</dd></div>
          <div><dt>Ce qui change</dt><dd><em>L’allure</em></dd></div>
        </dl>
      </div>

      <div className="noire-wrap">
        <div className="noire" ref={caseRef} data-rv="curtain">
          <div className="noire-board">
            {inView ? (
              <DemoBoard key={skin} mode="preview" skin={skin} theme={board} />
            ) : (
              <Board pos={STATIC_POS} orientation="w" theme={board} locked coords={false} />
            )}
          </div>
          <div className="noire-cap">
            <span className="ct-num">Vitrine</span>
            <span>Skin <em>{skinName}</em> sur plateau <em>{boardName}</em></span>
          </div>
          <div className="curtain curtain-ink" />
        </div>
        <p className="noire-note" data-rv="up">Votre adversaire voit vos sorts avec votre skin. Faites-lui de l’effet.</p>
      </div>

      <div className="flacons">
        <Eyebrow>Skins d’animation</Eyebrow>
        <div className="sec-head">
          <Lines lines={[<>Six <em>essences</em></>]} className="sec-title" as="h3" />
          <p className="sec-lede" data-rv="up">Chaque skin change la manière dont vos sorts éclatent. Touchez un flacon : la vitrine le joue aussitôt.</p>
        </div>
        <div className="flacons-row">
          {SKINS.map((s, i) => (
            <button
              key={s.id}
              className={`flacon ${skin === s.id ? 'on' : ''}`}
              onClick={() => setSkin(s.id)}
              style={{ '--p': s.primary, '--s': s.secondary, '--a': s.accent, '--i': i } as CSSProperties}
              data-cursor="Essayer"
              data-rv="up"
              aria-pressed={skin === s.id}
            >
              <span className="fl-ref">{s.ref}</span>
              <span className="fl-bottle"><Bottle id={s.id} k={i} name={s.name} refNo={s.ref} p={s.primary} s2={s.secondary} a={s.accent} /></span>
              <span className="fl-name">{s.name}</span>
              <span className="fl-matter">{s.matter}</span>
              <span className="fl-price">{s.price}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="plateaux">
        <Eyebrow>Plateaux</Eyebrow>
        <div className="sec-head">
          <Lines lines={[<>Sept <em>matières</em></>]} className="sec-title" as="h3" />
          <p className="sec-lede" data-rv="up">Du chêne de club au rubis taillé pour l’attaque. Posez-en un dans la vitrine.</p>
        </div>
        <div className="plateaux-grid">
          {BOARDS.map(b => (
            <button
              key={b.id}
              className={`plateau ${board === b.id ? 'on' : ''}`}
              onClick={() => setBoard(b.id)}
              data-cursor="Poser"
              data-rv="up"
              aria-pressed={board === b.id}
            >
              <Swatch style={b.style} />
              <span className="pl-ref">{b.ref}</span>
              <span className="pl-name">{b.name}</span>
              <span className="pl-price">{b.price}</span>
            </button>
          ))}
        </div>
        <p className="pack" data-rv="up">
          <span className="pack-name"><em>{PACK.name}</em></span>
          <span>tous les skins et plateaux premium</span>
          <span className="pack-price">{formatPrice(PACK.priceCents)} <s>{formatPrice(PACK.compareAtCents ?? 0)}</s></span>
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// 04 · Le Salon de jeu

function EloChart() {
  const w = 360, h = 150;
  const min = 1150, max = 1450;
  const pts = ELO_CURVE.map((v, i) => [(i / (ELO_CURVE.length - 1)) * w, h - ((v - min) / (max - min)) * h] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <div className="elo" data-rv="wipe">
      <svg viewBox={`-8 -14 ${w + 64} ${h + 34}`} aria-label="Exemple de progression Elo sur une saison">
        {[1200, 1300, 1400].map(v => {
          const y = h - ((v - min) / (max - min)) * h;
          return (
            <g key={v}>
              <line x1="0" x2={w} y1={y} y2={y} className="elo-grid" />
              <text x={w + 10} y={y + 4} className="elo-lbl">{v}</text>
            </g>
          );
        })}
        <path d={`${d} L${w} ${h} L0 ${h} Z`} className="elo-area" />
        <path d={d} className="elo-line" />
        <circle cx={last[0]} cy={last[1]} r="4.5" className="elo-dot" />
      </svg>
      <div className="wipe" />
    </div>
  );
}

function Invite() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const url = 'https://spellmate.fr/i/K7Q-2RX';
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, done);
    else done();
  };
  return (
    <div className="invite" data-rv="up">
      <span className="inv-lbl">Lien d’invitation · exemple</span>
      <span className="inv-url">spellmate.fr/i/<b>K7Q-2RX</b></span>
      <button className={`inv-copy ${copied ? 'is-done' : ''}`} onClick={copy} aria-live="polite">
        {copied ? 'Copié' : 'Copier'}
      </button>
    </div>
  );
}

export function Salon({ onPlay }: { onPlay: () => void }) {
  return (
    <section className="room salon" data-room="salon" aria-label="Le Salon de jeu">
      <span className="room-sign" aria-hidden="true">Salle 04 · Salon de jeu</span>
      <div className="entree">
        <div className="arche" data-par="-0.12" />
        <Eyebrow num="04">Salon de jeu · Trois tables</Eyebrow>
        <Lines lines={['Le Salon', <>de <em>jeu</em></>]} className="room-title" />
        <p className="entree-lede" data-rv="up">
          Trois tables, une même règle. Un ami au bout d’un lien, un automate qui joue aussi ses cartes, ou le classement : choisissez
          votre adversaire.
        </p>
      </div>

      <article className="table">
        <span className="t-num" data-par="0.05">I</span>
        <Eyebrow>Entre amis · sans compte</Eyebrow>
        <Lines lines={['Un lien,', <em key="b">une partie.</em>]} className="t-title" as="h3" />
        <p className="t-text" data-rv="up">
          Créez la partie, envoyez le lien. Votre ami joue en un clic, sur ordinateur ou mobile. Personne n’a besoin de compte.
        </p>
        <Invite />
        <ol className="t-steps" data-rv="up">
          <li><span>01</span>Créer</li>
          <li><span>02</span>Envoyer</li>
          <li><span>03</span>Jouer</li>
        </ol>
      </article>

      <article className="table">
        <span className="t-num" data-par="0.05">II</span>
        <Eyebrow>L’Automate · trois niveaux</Eyebrow>
        <Lines lines={['Une IA qui', <><em>joue ses cartes</em>.</>]} className="t-title" as="h3" />
        <p className="t-text" data-rv="up">Elle calcule, elle bluffe, elle garde ses sorts pour le bon moment. Trois niveaux pour s’entraîner.</p>
        <div className="levels">
          {LEVELS.map((l, i) => (
            <div className="lvl" key={l.name} data-rv="up">
              <span className="lvl-n">{pad(i + 1)}</span>
              <span className="lvl-name">{l.name}</span>
              <span className="lvl-bar"><span data-rv="bar" style={{ '--v': l.rating / 2000 } as CSSProperties} /></span>
              <span className="lvl-elo">≈ {l.rating}</span>
              <span className="lvl-text">{l.text}</span>
            </div>
          ))}
        </div>
        <button className="t-cta" onClick={onPlay}>Affronter l’Automate <Arrow size={16} /></button>
      </article>

      <article className="table">
        <span className="t-num" data-par="0.05">III</span>
        <Eyebrow>Parties classées · Elo</Eyebrow>
        <Lines lines={['Grimpez', <><em>au classement</em>.</>]} className="t-title" as="h3" />
        <p className="t-text" data-rv="up">
          Avec un compte, la file d’attente vous trouve un adversaire de votre niveau. Chaque victoire se lit sur la courbe.
        </p>
        <EloChart />
        <p className="elo-cap" data-rv="up">Progression d’exemple, dix-huit parties classées.</p>
      </article>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// 05 · La Sortie

export function Sortie({ onPlay, resume }: { onPlay: () => void; resume: boolean }) {
  return (
    <section className="room sortie" data-room="sortie" aria-label="La Sortie">
      <div className="sortie-main">
        <div className="sortie-copy">
          <Eyebrow num="05">La Sortie · Fin de la visite</Eyebrow>
          <Lines lines={['La partie', <>vous <em>attend</em>.</>]} className="sortie-title" />
        </div>
        <div className="billet-wrap" data-rv="up">
          <div className="billet">
            <div className="b-stub">
              <span className="b-vert">Spellmate · Maison de jeu</span>
            </div>
            <div className="b-body">
              <div className="b-top">
                <span>Billet d’entrée</span>
                <span>N° 000 001</span>
              </div>
              <div className="b-title"><em>Entrée libre</em></div>
              <div className="b-rows">
                <span><b>Valable</b> pour une infinité de parties</span>
                <span><b>Compte</b> non requis</span>
                <span><b>Placement</b> face à l’Automate</span>
              </div>
            </div>
          </div>
          <div className="sortie-ctas">
            <button className="btn-play btn-play-verm" onClick={onPlay}>
              <span className="bp-fill" />
              <span className="bp-text">
                <span className="bp-main">{resume ? 'Reprendre la partie' : 'Jouer maintenant'}</span>
                <span className="bp-sub">Une partie en dix secondes</span>
              </span>
              <span className="bp-arrow"><Arrow size={22} /></span>
            </button>
            <a className="btn-link btn-link-inv" href="#salon">Défier un ami <Arrow size={16} /></a>
          </div>
        </div>
      </div>
      <footer className="pied" data-rv="up">
        <div className="pied-brand">
          <span className="pied-logo"><Star size={16} className="verm" /> Spellmate</span>
          <span>Les échecs ont des pouvoirs.</span>
        </div>
        <nav className="pied-col" aria-label="Jouer">
          <span className="pied-h">Jouer</span>
          <a href="#hall">Partie rapide</a>
          <a href="#salon">Défier un ami</a>
          <a href="#salon">Classement</a>
        </nav>
        <nav className="pied-col" aria-label="Maison">
          <span className="pied-h">Maison</span>
          <a href="#pouvoirs">Les cartes</a>
          <a href="#atelier">L’Atelier</a>
          <a href="#sortie">Contact</a>
        </nav>
        <nav className="pied-col" aria-label="Informations légales">
          <span className="pied-h">Légal</span>
          {LEGAL.map(l => (
            <a key={l} href="#sortie">{l}</a>
          ))}
        </nav>
        <div className="pied-base">
          <span>© 2026 Spellmate</span>
          <span>Cookies strictement nécessaires, aucun traceur publicitaire.</span>
          <span>Saison I</span>
        </div>
      </footer>
    </section>
  );
}
