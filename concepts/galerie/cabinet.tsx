// Spellmate · La Galerie : le Cabinet des affinités (matrice 11 × 11 et « le bon moment ») et la
// Prochaine exposition (esquisses de pouvoirs globaux). Données de conception, signalées comme telles.
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { CardEmblem } from '../../src/client/components/CardArt';
import { CARDS } from '../../src/shared/cards';
import type { CardId } from '../../src/shared/cards';
import { COLLECTION, TIMING, UPCOMING, affinity } from './data';
import { Eyebrow, Lines } from './ui';

const SHORT: Partial<Record<CardId, string>> = {
  time_warp: 'Distorsion',
  knight_leap: 'Saut du cavalier',
  rewind: 'Retour arrière',
};
const short = (id: CardId) => SHORT[id] ?? CARDS[id].name;

// Rampe séquentielle à une seule teinte : du papier au vermillon profond
const STOPS: [number, [number, number, number]][] = [
  [0, [236, 227, 212]],
  [0.35, [234, 178, 154]],
  [0.7, [221, 104, 74]],
  [1, [176, 38, 14]],
];
function ramp(v: number): string {
  const x = Math.max(0, Math.min(1, v));
  for (let k = 1; k < STOPS.length; k++) {
    const [b, cb] = STOPS[k];
    const [a, ca] = STOPS[k - 1];
    if (x <= b) {
      const t = (x - a) / (b - a);
      const c = ca.map((u, i) => Math.round(u + (cb[i] - u) * t));
      return `rgb(${c.join(' ')})`;
    }
  }
  return 'rgb(176 38 14)';
}
const pct = (v: number) => `${Math.round(v * 100)} %`;

// Les trois paires les plus fortes reçoivent une étiquette directe
const TOP = (() => {
  const all: [number, number, number][] = [];
  COLLECTION.forEach((a, i) => COLLECTION.forEach((b, j) => j < i && all.push([i, j, affinity(a, b)])));
  return new Set(all.sort((x, y) => y[2] - x[2]).slice(0, 3).map(([i, j]) => `${i}-${j}`));
})();

function Matrice() {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const N = COLLECTION.length;
  return (
    <figure className="matrice" data-rv="up" onPointerLeave={() => setHover(null)}>
      <figcaption className="ch-cap">
        <span className="ch-title">La matrice des affinités</span>
        <span className="ch-sub">Probabilité que deux cartes servent la même victoire</span>
      </figcaption>
      <div className="mx" style={{ '--n': N } as CSSProperties} role="img" aria-label="Matrice des affinités entre les onze cartes ; tableau détaillé ci-dessous pour les lecteurs d’écran.">
        {COLLECTION.map((a, i) => (
          <div className="mx-row" key={a}>
            <span className={`mx-lbl ${hover && (hover[0] === i || hover[1] === i) ? 'on' : ''}`}>{short(a)}</span>
            {COLLECTION.map((b, j) => {
              if (j > i) return <span key={b} className="mx-void" />;
              if (j === i)
                return (
                  <span key={b} className="mx-diag" title={CARDS[a].name}>
                    <CardEmblem id={a} className="mx-emb" />
                  </span>
                );
              const v = affinity(a, b);
              const on = hover && hover[0] === i && hover[1] === j;
              return (
                <span
                  key={b}
                  className={`mx-cell ${on ? 'on' : ''} ${v > 0.55 ? 'dark' : ''}`}
                  style={{ background: ramp(v) }}
                  onPointerEnter={() => setHover([i, j])}
                >
                  {TOP.has(`${i}-${j}`) && <b>{Math.round(v * 100)}</b>}
                </span>
              );
            })}
          </div>
        ))}
        <div className="mx-row mx-foot">
          <span className="mx-lbl" />
          {COLLECTION.map((b, j) => (
            <span key={b} className={`mx-col ${hover && (hover[0] === j || hover[1] === j) ? 'on' : ''}`}>
              <span>{short(b)}</span>
            </span>
          ))}
        </div>
        {hover && (
          <div className="ch-tip" style={{ '--x': hover[1], '--y': hover[0] } as CSSProperties}>
            <span className="tip-k">{CARDS[COLLECTION[hover[0]]].name} × {CARDS[COLLECTION[hover[1]]].name}</span>
            <span className="tip-v">Affinité {pct(affinity(COLLECTION[hover[0]], COLLECTION[hover[1]]))}</span>
          </div>
        )}
      </div>
      <div className="mx-legend" aria-hidden="true">
        <span>faible</span>
        <i style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(ramp).join(', ')})` }} />
        <span>forte</span>
        <span className="mx-diag-key"><span className="mx-diag" /> la carte elle-même</span>
      </div>
      <table className="sr-only">
        <caption>Affinités entre cartes, en pourcentage</caption>
        <tbody>
          {COLLECTION.map((a, i) =>
            COLLECTION.slice(0, i).map(b => (
              <tr key={a + b}>
                <th scope="row">{CARDS[a].name} et {CARDS[b].name}</th>
                <td>{pct(affinity(a, b))}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </figure>
  );
}

function Moment() {
  const [hover, setHover] = useState<CardId | null>(null);
  const rows = [...COLLECTION].sort((a, b) => TIMING[a][1] - TIMING[b][1]);
  const L = 150, R = 520, top = 34, rh = 31, max = 50;
  const x = (v: number) => L + (v / max) * (R - L);
  const H = top + rows.length * rh + 34;
  const phases: [number, number, string][] = [
    [0, 12, 'Ouverture'],
    [12, 35, 'Milieu de partie'],
    [35, 50, 'Finale'],
  ];
  const h = hover ? TIMING[hover] : null;
  return (
    <figure className="moment" data-rv="up" onPointerLeave={() => setHover(null)}>
      <figcaption className="ch-cap">
        <span className="ch-title">Le bon moment</span>
        <span className="ch-sub">À quel coup chaque carte est lancée : médiane et moitié centrale des parties</span>
      </figcaption>
      <div className="mo-wrap">
        <svg viewBox={`0 0 ${R + 24} ${H}`} role="img" aria-label="Coup de lancement de chaque carte ; tableau détaillé ci-dessous pour les lecteurs d’écran.">
          {phases.map(([a, b, name], k) => (
            <g key={name}>
              {k % 2 === 1 && <rect x={x(a)} y={top - 8} width={x(b) - x(a)} height={rows.length * rh + 8} className="mo-band" />}
              <text x={(x(a) + x(b)) / 2} y={top - 16} className="mo-phase">{name}</text>
            </g>
          ))}
          {[10, 20, 30, 40, 50].map(v => (
            <g key={v}>
              <line x1={x(v)} x2={x(v)} y1={top - 8} y2={top + rows.length * rh} className="mo-grid" />
              <text x={x(v)} y={top + rows.length * rh + 18} className="mo-tick">{v}</text>
            </g>
          ))}
          <text x={L} y={top + rows.length * rh + 18} className="mo-tick" textAnchor="start">coup 1</text>
          {rows.map((id, k) => {
            const [q1, m, q3] = TIMING[id];
            const y = top + k * rh + rh / 2;
            const on = hover === id;
            return (
              <g key={id} className={`mo-row ${on ? 'on' : ''}`} onPointerEnter={() => setHover(id)}>
                <rect x={0} y={y - rh / 2} width={R + 24} height={rh} className="mo-hit" />
                <text x={L - 16} y={y + 5} className="mo-lbl" textAnchor="end">{short(id)}</text>
                <rect x={x(q1)} y={y - 4} width={x(q3) - x(q1)} height={8} rx={4} className="mo-iqr" />
                <circle cx={x(m)} cy={y} r={6} className="mo-med" />
              </g>
            );
          })}
        </svg>
        {hover && h && (
          <div className="ch-tip mo-tip" style={{ left: `${(x(h[1]) / (R + 24)) * 100}%`, top: `${((top + rows.indexOf(hover) * rh) / H) * 100}%` }}>
            <span className="tip-k">{CARDS[hover].name}</span>
            <span className="tip-v">Coups {h[0]} à {h[2]} · médiane {h[1]}</span>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Coup de lancement par carte</caption>
        <thead>
          <tr><th>Carte</th><th>Premier quartile</th><th>Médiane</th><th>Troisième quartile</th></tr>
        </thead>
        <tbody>
          {rows.map(id => (
            <tr key={id}><th scope="row">{CARDS[id].name}</th><td>{TIMING[id][0]}</td><td>{TIMING[id][1]}</td><td>{TIMING[id][2]}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function Cabinet() {
  return (
    <div className="cabinet">
      <div className="cab-light" data-par="0.06" />
      <div className="cab-head">
        <Eyebrow num="Étude">Cabinet des affinités</Eyebrow>
        <Lines lines={['Ce qui se', <>joue <em>ensemble</em></>]} className="cab-title" as="h3" />
        <p className="cab-lede" data-rv="up">
          Deux planches pour lire la collection autrement : quelles cartes s’appellent l’une l’autre, et à quel moment de la partie chacune
          fait la différence.
        </p>
        <p className="cab-note" data-rv="up">
          Données de conception, estimées par la maison. Elles seront remplacées par les statistiques réelles des parties.
        </p>
      </div>
      <Matrice />
      <Moment />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Prochaine exposition

function SketchSablier() {
  return (
    <svg viewBox="0 0 200 280" className="sk-svg" aria-hidden="true">
      <rect x="6" y="6" width="188" height="268" rx="14" className="sk-edge" />
      <rect x="17" y="17" width="166" height="246" rx="9" className="sk-guide" />
      <line x1="100" y1="22" x2="100" y2="258" className="sk-guide" />
      <line x1="22" y1="120" x2="178" y2="120" className="sk-guide" />
      <path d="M62 62 H138 M62 178 H138" className="sk-ink sk-thick" />
      <path d="M70 66 L130 66 L102 118 L130 174 L70 174 L98 118 Z" className="sk-ink" />
      <path d="M71 64 L131 68 L101 120 L129 176 L69 172 L99 117 Z" className="sk-ink sk-faint" />
      <path d="M84 98 L116 98 L101 117 Z" className="sk-sand" />
      <path d="M78 172 Q100 140 122 172 Z" className="sk-sand" />
      <path d="M101 119 L100 160" className="sk-verm sk-dash" />
      <path d="M40 92 A64 64 0 0 1 64 46" className="sk-ink sk-faint" />
      <path d="M34 108 A72 72 0 0 1 58 40" className="sk-ink sk-faint" />
      <path d="M160 148 A64 64 0 0 1 136 194" className="sk-ink sk-faint" />
      <circle cx="52" cy="214" r="17" className="sk-ink" />
      <path d="M52 214 V202 M52 214 L61 219" className="sk-ink" />
      <circle cx="148" cy="214" r="17" className="sk-ink" />
      <path d="M148 214 V202 M148 214 L139 220" className="sk-ink" />
      <text x="52" y="248" className="sk-note" textAnchor="middle">× 2</text>
      <text x="148" y="248" className="sk-note" textAnchor="middle">× 2</text>
      <path d="M150 64 Q172 70 168 96" className="sk-ink sk-faint" />
      <text x="148" y="56" className="sk-note" textAnchor="middle">pour tous</text>
    </svg>
  );
}

function SketchFaille() {
  const cells = [];
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      if ((r + f) % 2 === 1) cells.push(<rect key={`${r}-${f}`} x={40 + f * 15} y={60 + r * 15} width="15" height="15" className={r === 4 ? 'sk-gap' : 'sk-cell'} />);
    }
  return (
    <svg viewBox="0 0 200 280" className="sk-svg" aria-hidden="true">
      <rect x="6" y="6" width="188" height="268" rx="14" className="sk-edge" />
      <rect x="17" y="17" width="166" height="246" rx="9" className="sk-guide" />
      <g transform="translate(100 120) skewX(-8) translate(-100 -120)">
        {cells}
        <rect x="40" y="60" width="120" height="120" className="sk-ink" />
        <rect x="40" y="120" width="120" height="15" className="sk-hatch" />
        <path d="M38 128 L54 122 L66 132 L82 121 L96 131 L112 120 L126 131 L142 121 L162 128" className="sk-verm" />
      </g>
      <path d="M62 152 Q74 100 92 108" className="sk-ink sk-dash" />
      <path d="M86 104 L93 108 L86 113" className="sk-ink" />
      <text x="56" y="168" className="sk-note" textAnchor="middle">C</text>
      <path d="M166 128 Q182 150 170 196" className="sk-ink sk-faint" />
      <text x="128" y="212" className="sk-note">infranchissable,</text>
      <text x="128" y="226" className="sk-note">des deux côtés</text>
      <text x="100" y="250" className="sk-note" textAnchor="middle">rangées 3 à 6</text>
    </svg>
  );
}

export function Prochaine() {
  return (
    <div className="prochaine">
      <div className="pr-head">
        <Eyebrow num="S. II">Prochaine exposition</Eyebrow>
        <Lines lines={['Des pouvoirs', <>pour <em>tout</em></>, <><em>le monde</em>.</>]} className="pr-title" as="h3" />
        <p className="pr-lede" data-rv="up">
          La saison II étudie des cartes qui changent la partie pour les deux camps. Le lanceur ne reçoit pas un pouvoir : il choisit le moment
          où le monde change, celui qui l’arrange plus que l’adversaire.
        </p>
        <p className="pr-aside" data-rv="up">
          <span className="ct-num">Déjà exposée</span> Mur de glace (N° 01) condamne une case pour les deux camps : elle restera dans la
          collection.
        </p>
      </div>
      {UPCOMING.map((u, i) => (
        <article className="esquisse" key={u.name} data-rv="up">
          <div className="sk-paper">{i === 0 ? <SketchSablier /> : <SketchFaille />}</div>
          <div className="sk-cartel">
            <span className="ct-num">{u.ref}</span>
            <h4 className="sk-name">{u.name}</h4>
            <span className="v-meta">{u.family}</span>
            <p className="v-tag">« {u.motto} »</p>
            <p className="v-desc">{u.rule}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
