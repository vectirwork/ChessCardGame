// Le monde en CSS 3D : un sol-échiquier immense, des monuments posés sur ses régions, un ciel.
// Tout est statique : seule la transformation de la caméra (le « rig ») change au défilement.
import { memo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { CARDS } from '../../src/shared/cards';
import { itemById } from '../../src/shared/catalog';
import { SpellCard } from '../../src/client/components/SpellCard';
import { pieceUrl } from '../../src/client/components/pieces';
import type { Color, PieceType } from '../../src/shared/chess';
import { AVENUE, HAND, LEVELS, MODES, SKIN_PORTALS } from './data';
import { faceToward, sqX, sqZ } from './engine';

/** Transformation d'un monument dressé : son pied (centre du bord bas) est posé en (x, -y, z).
 *  `--sink` (posé sur le rig) l'enfonce dans le sol pendant la plongée vers le jeu. */
export function monTransform(x: number, y: number, z: number, w: number, h: number, ry = 0, scale = 1) {
  return `translate3d(${x - w / 2}px, ${-y - h}px, ${z}px) rotateY(${ry}deg) scale(${scale}) scaleY(var(--sink, 1))`;
}

interface MonProps {
  x: number;
  z: number;
  /** Hauteur du pied au-dessus du sol. */
  y?: number;
  w: number;
  h: number;
  ry?: number;
  scale?: number;
  /** Plage de présence (coordonnée de section) ; absent = repère toujours visible. */
  sec?: [number, number];
  far?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  id?: string;
  /** Distance en deçà de laquelle le monument s'estompe (repères géants). */
  soft?: number;
  /** Hauteur réelle du monument : il s'efface s'il devait remplir l'écran. */
  tall?: number;
  /** Carte de l'Allée : sens d'ouverture du battant (+1 à gauche, -1 à droite). */
  swing?: number;
  k?: number;
  /** Distance en deçà de laquelle le monument s'efface (proximité de la caméra). */
  near?: number;
}

export function Mon({ x, z, y = 0, w, h, ry = 0, scale = 1, sec, far = 5200, soft = 0, tall, swing, k, near, className = '', style, children, id }: MonProps) {
  return (
    <div
      id={id}
      className={`mon ${className}`}
      data-x={x}
      data-z={z}
      data-y={y}
      data-w={w}
      data-h={h}
      data-ry={ry}
      data-a={sec?.[0] ?? -99}
      data-b={sec?.[1] ?? 99}
      data-far={far}
      data-soft={soft}
      data-tall={tall ?? Math.round(h * scale)}
      data-swing={swing}
      data-k={k}
      data-near={near}
      style={{ width: w, height: h, transform: monTransform(x, y, z, w, h, ry, scale), ...style }}
    >
      {children}
    </div>
  );
}

/** Pièce géante : silhouette sculptée (dégradé de matière, liseré néon, épaisseur), pas le sprite agrandi. */
function Piece({ c, t }: { c: Color; t: PieceType }) {
  return (
    <div className={`bb-piece bb-${c} bb-${t}`} style={{ '--src': pieceUrl(c, t) } as CSSProperties}>
      <div className="bb-body">
        <i className="bb-sil" />
        <i className="bb-sheen" />
        <i className="bb-ink" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Sol : 14 × 14 cases de 100 px, agrandies 5 fois ; l'échiquier occupe les unités 3 à 11.

const U = 100;
const ORIGIN = 3 * U;

/** Position (en px du sol) d'un point du monde. */
const fu = (x: number) => (x + 3500) / 5;
const fv = (z: number) => (z + 5500) / 5;

function FloorRing() {
  const ticks = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const r1 = i % 8 === 0 ? 600 : 612;
    ticks.push(`M${700 + Math.cos(a) * r1} ${700 + Math.sin(a) * r1} L${700 + Math.cos(a) * 628} ${700 + Math.sin(a) * 628}`);
  }
  return (
    <svg className="floor-ring" viewBox="0 0 1400 1400" aria-hidden="true">
      <circle cx="700" cy="700" r="590" />
      <circle cx="700" cy="700" r="640" className="thin" />
      <circle cx="700" cy="700" r="668" className="dash" />
      <path d={ticks.join(' ')} />
      <path className="star" d="M700 40 L760 640 L1360 700 L760 760 L700 1360 L640 760 L40 700 L640 640 Z" />
    </svg>
  );
}

function Floor() {
  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let f = 0; f < 8; f++) {
      const rank = 8 - row;
      const dark = (f + rank - 1) % 2 === 0;
      squares.push(<div key={`${row}-${f}`} className={dark ? 'fsq d' : 'fsq l'} />);
    }
  }
  const glows: { x: number; z: number; r: number; c: string; o?: number }[] = [
    { x: sqX(4), z: sqZ(2.6), r: 900, c: '56 232 255', o: 0.5 },
    { x: -800, z: sqZ(3), r: 1300, c: '200 255 61', o: 0.32 },
    { x: 0, z: -2100, r: 1500, c: '255 62 165', o: 0.34 },
    { x: 2700, z: -2400, r: 1700, c: '255 122 26', o: 0.42 },
    { x: 0, z: -3350, r: 1500, c: '56 232 255', o: 0.3 },
    { x: sqX(3), z: sqZ(8), r: 900, c: '255 205 90', o: 0.62 },
  ];
  return (
    <div className="floor">
      <div className="floor-dim">
        <div className="floor-grid" />
        {glows.map((g, i) => (
          <div
            key={i}
            className="floor-glow"
            style={{
              left: fu(g.x) - g.r / 5,
              top: fv(g.z) - g.r / 5,
              width: (2 * g.r) / 5,
              height: (2 * g.r) / 5,
              background: `radial-gradient(closest-side, rgb(${g.c} / ${g.o ?? 0.4}), rgb(${g.c} / 0.08) 60%, transparent)`,
            }}
          />
        ))}
        <FloorRing />
      </div>
      <div className="floor-board" style={{ left: ORIGIN, top: ORIGIN, width: 8 * U, height: 8 * U }}>
        <div className="fsquares">{squares}</div>
        <div className="ftheme" />
        <div className="flit" />
        <div className="fframe" />
      </div>
      <div className="floor-labels">
        <div className="f-ranks-l" data-fa={0.55} data-fb={99}>
          {Array.from({ length: 8 }, (_, i) => (
            <span key={`r${i}`} className="f-rank" style={{ left: ORIGIN - 92, top: ORIGIN + (7 - i) * U + 14 }}>{i + 1}</span>
          ))}
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <span key={`rr${i}`} className="f-rank f-rank-r" style={{ left: ORIGIN + 8 * U + 26, top: ORIGIN + (7 - i) * U + 14 }}>{i + 1}</span>
        ))}
        {'abcdefgh'.split('').map((l, i) => (
          <span key={l} className="f-file" style={{ left: ORIGIN + i * U + 34, top: ORIGIN + 8 * U + 18 }}>{l}</span>
        ))}
        <span className="f-word" data-fa={0.6} data-fb={1.72} style={{ left: ORIGIN + 0.2 * U, top: ORIGIN + 8 * U - 1.3 * U, width: 2.6 * U }}>LA RÈGLE</span>
        <span className="f-word f-word-m" data-fa={1.75} data-fb={2.9} style={{ left: ORIGIN + 3 * U - 40, top: ORIGIN + 3.2 * U, width: 2 * U + 80 }}>POUVOIRS</span>
        <span className="f-word f-word-o" data-fa={2.95} data-fb={3.75} style={{ left: ORIGIN + 8 * U + 140, top: ORIGIN + 4.6 * U, width: 3 * U }}>LA FORGE</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Monuments

const BLACK_RANK: { f: number; t: PieceType; box: number }[] = [
  { f: 0, t: 'r', box: 1100 },
  { f: 1, t: 'n', box: 1150 },
  { f: 2, t: 'b', box: 1250 },
  { f: 4, t: 'k', box: 1380 },
  { f: 5, t: 'b', box: 1250 },
  { f: 6, t: 'n', box: 1150 },
  { f: 7, t: 'r', box: 1100 },
];

function BlackRank() {
  return (
    <>
      {BLACK_RANK.map(p => {
        const css = 500;
        const sc = p.box / css;
        return (
          <Mon key={p.f} x={sqX(p.f)} z={sqZ(8) - 60} y={-p.box * 0.1} w={css} h={css} scale={sc} far={9000} soft={2250} tall={p.box * 0.9} className="mon-black">
            <div className="bow">
              <Piece c="b" t={p.t} />
            </div>
          </Mon>
        );
      })}
    </>
  );
}

/** Le pion du joueur : avance de c2 à c3 pendant la Règle (position mise à jour par la scène). */
export const PAWN = { x: sqX(2), box: 450, scale: 1.7 };
/** Le pion de la Promotion : arrive de d7 sur d8, puis devient reine. */
export const PROMO_PAWN = { x: sqX(3), box: 500, scale: 2.3 };

function Pawn() {
  return (
    <Mon id="pawn" x={PAWN.x} z={sqZ(2)} y={-PAWN.box * PAWN.scale * 0.1} w={PAWN.box} h={PAWN.box} scale={PAWN.scale} sec={[-1, 1.66]} far={9000} className="mon-pawn">
      <div className="pawn-pool" />
      <Piece c="w" t="p" />
    </Mon>
  );
}

function Queen() {
  return (
    <>
      <Mon x={sqX(3)} z={sqZ(8)} y={0} w={420} h={1000} scale={4.2} far={12000} tall={1} className="mon-beam">
        <div className="beam" />
      </Mon>
      <Mon id="ppawn" x={PROMO_PAWN.x} z={sqZ(7)} y={-PROMO_PAWN.box * PROMO_PAWN.scale * 0.1} w={PROMO_PAWN.box} h={PROMO_PAWN.box} scale={PROMO_PAWN.scale} sec={[4.55, 99]} far={12000} className="mon-ppawn">
        <div className="pp">
          <Piece c="w" t="p" />
        </div>
      </Mon>
      <Mon id="queen" x={sqX(3)} z={sqZ(8)} y={-170} w={500} h={500} scale={3.4} sec={[4.55, 99]} far={12000} className="mon-queen">
        <div className="rise">
          <div className="queen-halo" />
          <Piece c="w" t="q" />
        </div>
      </Mon>
    </>
  );
}

/** La Règle : la main du joueur, trois cartes en éventail au-dessus de son pion (rangée 3). */
const HAND_X = [-1250, -750, -250];
const HAND_Z = -1400;
const HAND_FAN = [-9, 0, 9];

function HandCards() {
  return (
    <>
      {HAND.map((id, i) => {
        const x = HAND_X[i];
        const y = i === 1 ? 680 : 600;
        const ry = faceToward(x, HAND_Z, 0, 800) * 0.6;
        return (
          <Mon key={id} x={x} z={HAND_Z} y={y} w={420} h={605} ry={ry} sec={[-1, 1.62]} far={9000} className="mon-card">
            <div className="fan" style={{ transform: `rotate(${HAND_FAN[i]}deg)` }}>
              <div className="float" style={{ animationDelay: `${-i * 1.3}s` }}>
                <div className="hand-card" data-card={id}>
                  <SpellCard id={id} size="full" tilt={false} />
                </div>
              </div>
            </div>
          </Mon>
        );
      })}
      {HAND_X.map((x, i) => (
        <Mon key={`b${i}`} x={x} z={HAND_Z - 4} y={0} w={170} h={i === 1 ? 700 : 620} ry={faceToward(x, HAND_Z, 0, 800) * 0.6} sec={[-1, 1.62]} far={9000} className="mon-shaft">
          <div className="shaft" />
        </Mon>
      ))}
    </>
  );
}

/** L'Allée : les onze cartes dressées de part et d'autre du chemin, qui s'ouvrent comme des battants. */
export const AVENUE_Z = (k: number) => -1800 - k * 125;

function Avenue({ mobile }: { mobile: boolean }) {
  const X = mobile ? 300 : 700;
  const RY = mobile ? 20 : 30;
  return (
    <>
      {AVENUE.map((id, k) => {
        const left = k % 2 === 0;
        return (
          <Mon
            key={id}
            k={k}
            x={left ? -X : X}
            z={AVENUE_Z(k)}
            y={0}
            w={360}
            h={650}
            ry={left ? RY : -RY}
            swing={left ? 1 : -1}
            sec={[1.8, 2.82]}
            far={4200}
            className="mon-avenue"
            style={{ '--h': CARDS[id].hue } as CSSProperties}
          >
            <div className="av-card" data-k={k}>
              <SpellCard id={id} size="full" tilt={false} />
            </div>
            <div className="plinth">
              <span>{String(k + 1).padStart(2, '0')}</span>
            </div>
          </Mon>
        );
      })}
    </>
  );
}

/** La Forge : six piliers de lumière (les skins), au bord est du plateau. On choisit un skin en touchant son pilier. */
const FORGE_CAM = { x: 900, z: -2150 };
const PILLAR_ANGLES = [72, 77.6, 83.2, 88.8, 94.4, 100];
export const PILLAR_POS = PILLAR_ANGLES.map((deg, i) => {
  const a = (deg * Math.PI) / 180;
  const R = i % 2 === 0 ? 1850 : 2150;
  return { x: FORGE_CAM.x + R * Math.sin(a), z: FORGE_CAM.z - R * Math.cos(a) };
});

function Forge({ skin, onSkin }: { skin: string; onSkin: (id: string) => void }) {
  return (
    <>
      {SKIN_PORTALS.map((p, i) => {
        const item = itemById(p.id)!;
        const sk = item.skin!;
        const { x, z } = PILLAR_POS[i];
        return (
          <Mon
            key={p.id}
            x={x}
            z={z}
            w={210}
            h={900}
            ry={faceToward(x, z, FORGE_CAM.x, FORGE_CAM.z)}
            sec={[2.95, 3.85]}
            far={6000}
            className={`mon-pillar fl-${sk.flourish}`}
            style={{ '--p': sk.primary, '--q': sk.secondary, '--a': sk.accent } as CSSProperties}
          >
            <button
              className={`pillar ${skin === p.id ? 'on' : ''}`}
              data-skin={p.id}
              aria-pressed={skin === p.id}
              aria-label={`Skin ${item.name}, ${p.price}`}
              onClick={() => onSkin(p.id)}
            >
              <span className="pillar-core" />
              <span className="pillar-pattern" />
              <span className="pillar-name">{item.name}</span>
              <span className="pillar-price">{p.price}</span>
            </button>
          </Mon>
        );
      })}
    </>
  );
}

function ModeIcon({ id }: { id: string }) {
  if (id === 'ami') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M20 28 L28 20" />
        <path d="M22 14 l4 -4 a8 8 0 0 1 12 12 l-4 4" />
        <path d="M26 34 l-4 4 a8 8 0 0 1 -12 -12 l4 -4" />
      </svg>
    );
  }
  if (id === 'ia') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="11" y="14" width="26" height="22" rx="6" />
        <path d="M24 14 V8 M18 24 h0.1 M30 24 h0.1 M18 31 h12 M7 22 v6 M41 22 v6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M14 8 H34 V18 a10 10 0 0 1 -20 0 Z" />
      <path d="M14 12 H8 a6 6 0 0 0 6 8 M34 12 H40 a6 6 0 0 1 -6 8 M24 28 V35 M16 40 H32 M19 35 H29" />
    </svg>
  );
}

/** Les Trois Portes : les modes de jeu, en arches de lumière sur la rangée 7. */
function Portes({ onMode, level, onLevel }: { onMode: (id: string) => void; level: string; onLevel: (id: string) => void }) {
  const xs = [-820, 0, 820];
  return (
    <>
      {MODES.map((m, i) => (
        <Mon key={m.id} x={xs[i]} z={sqZ(7) + 60} w={600} h={860} ry={i === 0 ? 12 : i === 2 ? -12 : 0} sec={[3.85, 4.88]} far={6000} near={240} className="mon-arch" style={{ '--c': m.color } as CSSProperties}>
          <div className="arch">
            <div className="arch-light" />
            <div className="arch-body">
              <div className="arch-icon"><ModeIcon id={m.id} /></div>
              <span className="arch-tag">{m.tag}</span>
              <h3>{m.title}</h3>
              <p>{m.text}</p>
              {m.id === 'ia' && (
                <div className="arch-levels" role="radiogroup" aria-label="Niveau de l’IA">
                  {LEVELS.map(l => (
                    <button key={l.id} role="radio" aria-checked={level === l.id} className={level === l.id ? 'on' : ''} onClick={() => onLevel(l.id)}>
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
              <button className="arch-cta" onClick={() => onMode(m.id)}>{m.cta}</button>
            </div>
          </div>
        </Mon>
      ))}
    </>
  );
}

/** Lucioles : points lumineux en suspension, pour sentir la profondeur. */
function Motes() {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const hues = ['#5ee7ff', '#ff5ec4', '#c8ff3d', '#ffb347', '#a77bff'];
  const out = [];
  for (let i = 0; i < 40; i++) {
    const x = -2600 + rnd() * 5800;
    const z = -4400 + rnd() * 5400;
    const y = 120 + rnd() * 1500;
    const s = 10 + rnd() * 14;
    out.push(
      <Mon key={i} x={x} z={z} y={y} w={s} h={s} far={4600} tall={0} className="mon-mote">
        <i style={{ background: hues[i % hues.length], animationDelay: `${-rnd() * 6}s`, animationDuration: `${5 + rnd() * 5}s` }} />
      </Mon>,
    );
  }
  return <>{out}</>;
}

interface WorldProps {
  onMode: (id: string) => void;
  mobile: boolean;
  skin: string;
  onSkin: (id: string) => void;
  level: string;
  onLevel: (id: string) => void;
}

export const World = memo(function World({ onMode, mobile, skin, onSkin, level, onLevel }: WorldProps) {
  return (
    <div className="viewport3d">
      <div className="rig" id="rig">
        <Floor />
        <BlackRank />
        <Queen />
        <Pawn />
        <HandCards />
        <Avenue mobile={mobile} />
        <Forge skin={skin} onSkin={onSkin} />
        <Portes onMode={onMode} level={level} onLevel={onLevel} />
        <Motes />
      </div>
    </div>
  );
});

/** Ciel : dégradé, nébuleuses, cercle de runes à l'horizon. */
export function Sky() {
  return (
    <div className="sky" aria-hidden="true">
      <div className="sky-stars" />
      <div className="sky-move" id="skyMove">
        <div className="sky-neb n1" />
        <div className="sky-neb n2" />
        <div className="sky-neb n3" />
        <svg className="sky-ring" viewBox="0 0 400 400">
          <circle cx="200" cy="200" r="196" />
          <circle cx="200" cy="200" r="170" strokeDasharray="2 7" />
          <circle cx="200" cy="200" r="140" />
          <path d="M200 4 L200 30 M200 370 L200 396 M4 200 L30 200 M370 200 L396 200 M61 61 L80 80 M339 339 L320 320 M61 339 L80 320 M339 61 L320 80" />
          <path d="M200 60 l18 122 L340 200 l-122 18 L200 340 l-18 -122 L60 200 l122 -18z" />
        </svg>
        <div className="sky-horizon" />
      </div>
    </div>
  );
}
