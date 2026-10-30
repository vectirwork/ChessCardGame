// Décors de la descente : chaque lieu est une pile de calques (data-d = profondeur de parallaxe).
// Les reliefs sont générés (graine fixe) pour rester légers : des chemins SVG pleins, sans filtre animé.
import type { CSSProperties, ReactNode } from 'react';
import frostA from './assets/cloud-frost-a.webp';
import frostB from './assets/cloud-frost-b.webp';
import stormA from './assets/cloud-storm-a.webp';
import stormB from './assets/cloud-storm-b.webp';
import sandA from './assets/cloud-sand-a.webp';
import sandB from './assets/cloud-sand-b.webp';
import roseA from './assets/cloud-rose-a.webp';
import roseB from './assets/cloud-rose-b.webp';
import duskA from './assets/cloud-dusk-a.webp';
import duskB from './assets/cloud-dusk-b.webp';

const CLOUDS = {
  frost: [frostA, frostB],
  storm: [stormA, stormB],
  sand: [sandA, sandB],
  rose: [roseA, roseB],
  dusk: [duskA, duskB],
} as const;
type Tone = keyof typeof CLOUDS;

export const VW = 1600;
export const VH = 1000;

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f1 = (n: number) => n.toFixed(1);

/** Crête montagneuse par déplacement du point milieu. */
export function ridgePath(seed: number, base: number, amp: number, rough = 0.52, steps = 7, w = VW, h = 1900) {
  const r = rng(seed);
  let pts = [base + (r() - 0.5) * amp, base + (r() - 0.5) * amp];
  let disp = amp;
  for (let s = 0; s < steps; s++) {
    const next: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      next.push(pts[i], (pts[i] + pts[i + 1]) / 2 + (r() - 0.5) * disp);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
    disp *= rough;
  }
  const n = pts.length - 1;
  let d = `M0 ${h} L0 ${f1(pts[0])}`;
  pts.forEach((y, i) => (d += ` L${f1((i / n) * w)} ${f1(y)}`));
  return { d: d + ` L${w} ${h} Z`, pts, n };
}

/** Pics escarpés : une suite de sommets nets plutôt qu'une crête douce. Renvoie le relief et sa ligne de crête. */
export function peaksPath(seed: number, base: number, count: number, minH: number, maxH: number, w = VW, h = 1900) {
  const r = rng(seed);
  const pts: [number, number][] = [[0, base]];
  const faces: string[] = [];
  const step = w / count;
  let x = -step * 0.3;
  while (x < w + step) {
    const peakX = x + step * (0.35 + r() * 0.3);
    const top = base - (minH + r() * (maxH - minH));
    const sh = top + (base - top) * (0.35 + r() * 0.25);
    pts.push([peakX - step * (0.32 + r() * 0.1), sh]);
    pts.push([peakX - step * (0.12 + r() * 0.05), top + (base - top) * (0.18 + r() * 0.1)]);
    pts.push([peakX - step * 0.04, top + (base - top) * 0.05]);
    pts.push([peakX, top]);
    pts.push([peakX + step * (0.08 + r() * 0.04), top + (base - top) * (0.16 + r() * 0.1)]);
    pts.push([peakX + step * 0.16, top + (base - top) * (0.3 + r() * 0.1)]);
    pts.push([peakX + step * (0.3 + r() * 0.12), top + (base - top) * (0.5 + r() * 0.2)]);
    // Versant éclairé : du sommet jusqu'à l'épaule gauche, puis droit vers le pied
    const n = pts.length;
    const face = [pts[n - 4], pts[n - 5], pts[n - 6], pts[n - 7]];
    const foot: [number, number] = [peakX + step * 0.05, base + 40];
    faces.push(`M${face.map(([px, py]) => `${f1(px)} ${f1(py)}`).join(' L')} L${f1(face[3][0])} ${f1(base + 40)} L${f1(foot[0])} ${f1(foot[1])} Z`);
    x += step;
  }
  pts.push([w, base]);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${f1(px)} ${f1(py)}`).join(' ');
  return { d: `M0 ${h} ${line.replace(/^M/, 'L')} L${w} ${h} Z`, line, faces: faces.join(' ') };
}

/** Rangée de sapins sur un sol ondulé. */
export function pinesPath(seed: number, ground: number, count: number, minH: number, maxH: number, w = VW, h = 1900) {
  const r = rng(seed);
  const gy = (x: number) => ground + Math.sin(x / 210 + seed) * 16 + Math.sin(x / 67 + seed * 2) * 5;
  let d = `M0 ${h} L0 ${f1(gy(0))}`;
  for (let x = 40; x <= w; x += 40) d += ` L${x} ${f1(gy(x))}`;
  d += ` L${w} ${h} Z`;
  const step = w / count;
  for (let i = -1; i <= count; i++) {
    const x = i * step + r() * step;
    const H = minH + r() * (maxH - minH);
    const base = gy(x) + 24;
    const top = base - H;
    const W = H * (0.2 + r() * 0.07);
    const tiers = 4 + Math.floor(r() * 2);
    const right: [number, number][] = [];
    for (let t = 1; t <= tiers; t++) {
      const yy = top + (H * t) / tiers;
      const ww = W * (0.35 + (0.65 * t) / tiers);
      right.push([ww, yy]);
      if (t < tiers) right.push([ww * 0.42, yy - H * 0.035]);
    }
    right.push([W * 0.2, base]);
    d += ` M${f1(x)} ${f1(top)}`;
    for (const [dx, y] of right) d += ` L${f1(x + dx)} ${f1(y)}`;
    for (let k = right.length - 1; k >= 0; k--) d += ` L${f1(x - right[k][0])} ${f1(right[k][1])}`;
    d += ' Z';
  }
  return d;
}

/** Dunes : courbe lissée par milieux successifs. */
export function dunePath(seed: number, base: number, amp: number, freq = 1, w = VW, h = 1900) {
  return duneCurve(seed, base, amp, freq, w) + ` L${w + 60} ${h} L-60 ${h} Z`;
}

/** Ligne de crête d'une dune (ouverte), pour la lumière de contour. */
export function duneCurve(seed: number, base: number, amp: number, freq = 1, w = VW) {
  const r = rng(seed);
  const p1 = r() * 6, p2 = r() * 6, p3 = r() * 6;
  const pts: [number, number][] = [];
  for (let x = -60; x <= w + 60; x += 50) {
    const y = base + amp * (Math.sin((x / 520) * freq + p1) * 0.6 + Math.sin((x / 230) * freq + p2) * 0.28 + Math.sin((x / 97) * freq + p3) * 0.08);
    pts.push([x, y]);
  }
  let d = `M${pts[0][0]} ${f1(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${pts[i][0]} ${f1(pts[i][1])} ${f1(mx)} ${f1(my)}`;
  }
  return d;
}

export function Layer({ d, children, className = '', style }: { d: number; children?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`o-layer ${className}`} data-d={d} style={style}>
      {children}
    </div>
  );
}

function Svg({ children, anchor = 'xMidYMax', className = '', style }: { children: ReactNode; anchor?: string; className?: string; style?: CSSProperties }) {
  return (
    <svg className={`o-svg ${className}`} style={style} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio={`${anchor} slice`} aria-hidden="true">
      {children}
    </svg>
  );
}

function Stars({ seed, n, maxR = 1.4, twinkle = 0, color = '#fff', yMax = VH, warm = 0.15 }: { seed: number; n: number; maxR?: number; twinkle?: number; color?: string; yMax?: number; warm?: number }) {
  const r = rng(seed);
  const stars = Array.from({ length: n }, (_, i) => {
    const big = r() < 0.06;
    return {
      x: r() * VW,
      y: r() * r() * yMax,
      rad: (big ? maxR * 1.6 : 0.35 + r() * maxR * 0.7),
      o: 0.25 + r() * 0.7,
      tw: i < twinkle,
      c: r() < warm ? '#ffe2b0' : r() < 0.2 ? '#bfe6ff' : color,
      delay: r() * 6,
    };
  });
  const dot = (s: (typeof stars)[number], i: number) => <circle key={i} cx={f1(s.x)} cy={f1(s.y)} r={s.rad.toFixed(2)} fill={s.c} opacity={s.o.toFixed(2)} />;
  const fixed = stars.filter(s => !s.tw);
  const tw = stars.filter(s => s.tw);
  return (
    <>
      <Svg anchor="xMidYMin">{fixed.map(dot)}</Svg>
      {tw.length > 0 && (
        <>
          <Svg anchor="xMidYMin" className="o-tw o-tw-a">
            {tw.filter((_, i) => i % 2 === 0).map(dot)}
          </Svg>
          <Svg anchor="xMidYMin" className="o-tw o-tw-b">
            {tw.filter((_, i) => i % 2 === 1).map(dot)}
          </Svg>
        </>
      )}
    </>
  );
}

/**
 * Bancs de nuées traversés pendant la chute, entre deux lieux (invisibles au repos, au-dessus de l'écran).
 * Chaque banc a sa vitesse : il croise le centre de l'écran quand il reste `f` écran à parcourir avant le lieu.
 * Les bancs « back » passent derrière l'échiquier, les bancs « front » devant.
 */
const BANKS: Record<'back' | 'front', { d: number; f: number; img: 0 | 1; left: number; width: number; height: number; flip?: boolean; o?: number }[]> = {
  back: [
    { d: 1.6, f: 0.28, img: 0, left: -40, width: 130, height: 50, o: 0.92 },
    { d: 2.2, f: 0.5, img: 1, left: -2, width: 120, height: 54, flip: true },
  ],
  front: [
    { d: 2.5, f: 0.4, img: 1, left: -46, width: 120, height: 56 },
    { d: 2.9, f: 0.72, img: 0, left: 14, width: 118, height: 72, flip: true },
  ],
};

export function CloudBanks({ tone, part }: { tone: Tone; part: 'back' | 'front' }) {
  return (
    <>
      {BANKS[part].map((b, i) => (
        <Layer key={i} d={b.d} className="o-bank">
          <div
            className="o-bank-img"
            style={{
              backgroundImage: `url(${CLOUDS[tone][b.img]})`,
              left: `${b.left}vw`,
              width: `${b.width}vw`,
              height: `${b.height}vh`,
              top: `calc(50vh - ${(b.f * b.d * 100).toFixed(1)}vh - ${b.height / 2}vh)`,
              transform: b.flip ? 'scaleX(-1)' : undefined,
              opacity: b.o,
            }}
          />
        </Layer>
      ))}
    </>
  );
}

/** Mot géant en filigrane, typographie d'apparat. */
function Word({ text, style }: { text: string; style?: CSSProperties }) {
  return (
    <div className="o-ghost-word" style={style} aria-hidden="true">
      {text}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// I. L'Observatoire

export function SceneObservatoire({ part }: { part: 'back' | 'front' }) {
  if (part === 'front') {
    return (
      <>
        <Layer d={1.45} className="o-fg-clouds">
          <div className="o-cloud-bank o-cb-1" />
          <div className="o-cloud-bank o-cb-2" />
        </Layer>
      </>
    );
  }
  const far = ridgePath(11, 840, 120, 0.55, 7);
  const obs = ridgePath(23, 900, 120, 0.5, 7);
  return (
    <>
      <Layer d={0.03}>
        <div className="o-nebula o-nb-1" />
        <div className="o-nebula o-nb-2" />
        <div className="o-nebula o-nb-3" />
        <Stars seed={3} n={420} maxR={1.1} yMax={VH * 1.1} />
      </Layer>
      <Layer d={0.09}>
        <Stars seed={7} n={90} maxR={1.9} twinkle={26} yMax={VH * 0.9} warm={0.3} />
        <div className="o-milky" />
      </Layer>
      <Layer d={0.16}>
        <Svg anchor="xMidYMin">
          <g className="o-constellation" stroke="rgba(243,201,105,.34)" strokeWidth="0.8" fill="none">
            <path d="M598 236 L640 178 L702 196 L742 128 L806 146" />
            <path d="M702 196 L716 262 L776 288" />
          </g>
          {[[598, 236], [640, 178], [702, 196], [742, 128], [806, 146], [716, 262], [776, 288]].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="5" fill="rgba(255,226,160,.18)" />
              <circle cx={x} cy={y} r="1.8" fill="#ffe7b0" />
            </g>
          ))}
        </Svg>
      </Layer>
      <Layer d={0.34}>
        <Svg>
          <defs>
            <linearGradient id="ob-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1d2257" />
              <stop offset="1" stopColor="#0b0e2b" />
            </linearGradient>
          </defs>
          <path d={far.d} fill="url(#ob-far)" />
        </Svg>
      </Layer>
      <Layer d={0.58}>
        <Svg>
          <defs>
            <linearGradient id="ob-mid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0d1031" />
              <stop offset="1" stopColor="#04050f" />
            </linearGradient>
            <radialGradient id="ob-slit" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#ffe3a0" stopOpacity="0.9" />
              <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path d={obs.d} fill="url(#ob-mid)" />
          <path d="M470 1000 C560 900 610 872 690 866 C770 872 820 900 910 1000 Z" fill="url(#ob-mid)" />
          {/* L'observatoire : tour, coupole, fente lumineuse, lunette braquée vers l'échiquier et son faisceau */}
          <defs>
            <linearGradient id="ob-beam" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#ffe6a8" stopOpacity="0.62" />
              <stop offset="0.45" stopColor="#ffd27a" stopOpacity="0.22" />
              <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="ob-dome" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#1a1d48" />
              <stop offset="0.55" stopColor="#0b0d26" />
              <stop offset="1" stopColor="#05060f" />
            </linearGradient>
            <radialGradient id="ob-halo" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#ffe3a0" stopOpacity="0.55" />
              <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g className="o-obs-tower" transform="translate(905 1010) scale(1.4)">
            <g className="o-obs-beam" transform="rotate(28 0 -96)">
              <path d="M-9 -118 L9 -118 L430 -620 L-430 -620 Z" fill="url(#ob-beam)" opacity="0.55" />
              <path d="M-5 -118 L5 -118 L190 -620 L-170 -620 Z" fill="url(#ob-beam)" opacity="0.7" />
              <path d="M-1.5 -118 L1.5 -118 L-250 -620 L-262 -620 Z" fill="url(#ob-beam)" />
              <path d="M-1.5 -118 L1.5 -118 L300 -620 L286 -620 Z" fill="url(#ob-beam)" />
            </g>
            <circle cx="0" cy="-122" r="80" fill="url(#ob-halo)" />
            <path d="M-78 130 L-66 -40 L66 -40 L78 130 Z" fill="#05060f" />
            <path d="M-66 -40 L66 -40 L72 30 L-72 30 Z" fill="#090b20" />
            <path d="M-84 -40 A84 84 0 0 1 84 -40 Z" fill="url(#ob-dome)" />
            <path d="M-84 -40 A84 84 0 0 1 84 -40" fill="none" stroke="rgba(243,201,105,.7)" strokeWidth="1.2" />
            <path d="M-60 -40 A62 62 0 0 1 -30 -96" fill="none" stroke="rgba(255,240,200,.28)" strokeWidth="1" />
            <path d="M-7 -123 L7 -123 L11 -40 L-11 -40 Z" fill="#ffd27a" opacity="0.9" />
            <g transform="translate(0 -84) rotate(-62)">
              <rect x="-6" y="-12" width="100" height="24" rx="4" fill="#0a0c22" stroke="rgba(243,201,105,.7)" strokeWidth="1.1" />
              <rect x="88" y="-15" width="20" height="30" rx="3" fill="#0a0c22" stroke="rgba(243,201,105,.85)" strokeWidth="1.1" />
              <circle cx="108" cy="0" r="5" fill="#fff1c4" />
            </g>
            <path d="M-92 -40 L92 -40" stroke="rgba(243,201,105,.45)" strokeWidth="1.2" />
            {[-40, 0, 40].map(x => (
              <rect key={x} x={x - 6} y="0" width="12" height="20" rx="6" fill="#ffcf6e" opacity="0.7" />
            ))}
            {[-46, 46].map(x => (
              <rect key={x} x={x - 4} y="56" width="8" height="14" rx="4" fill="#ffcf6e" opacity="0.45" />
            ))}
          </g>
        </Svg>
      </Layer>
      <Layer d={0.82} className="o-cloud-sea">
        <div className="o-sea o-sea-1" />
        <div className="o-sea o-sea-2" />
        <div className="o-sea o-sea-3" />
      </Layer>
    </>
  );
}

// ------------------------------------------------------------------------------------------------
// II. La Forêt de givre

export function SceneForet({ part }: { part: 'back' | 'front' }) {
  if (part === 'front') {
    return (
      <>
        <Layer d={1.15} className="o-snow o-snow-near" />
        <CloudBanks tone="frost" part="front" />
      </>
    );
  }
  const far = ridgePath(41, 560, 300, 0.55, 7);
  return (
    <>
      <Layer d={0.03}>
        <div className="o-moon" />
        <Stars seed={13} n={160} maxR={1.1} yMax={VH * 0.6} color="#dff6ff" warm={0} />
      </Layer>
      <Layer d={0.07} className="o-aurora-wrap">
        <Svg anchor="xMidYMin" className="o-aurora-svg">
          <defs>
            <filter id="au-blur" x="-10%" y="-60%" width="120%" height="220%">
              <feGaussianBlur stdDeviation="22" />
            </filter>
            <linearGradient id="au-1" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#5effc8" stopOpacity="0" />
              <stop offset="0.3" stopColor="#5effc8" stopOpacity="0.55" />
              <stop offset="0.7" stopColor="#5ee7ff" stopOpacity="0.45" />
              <stop offset="1" stopColor="#a77bff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g filter="url(#au-blur)">
            <path d="M-100 260 C 200 120, 420 330, 760 210 S 1300 110, 1700 230" stroke="url(#au-1)" strokeWidth="70" fill="none" />
            <path d="M-100 330 C 260 230, 520 380, 880 290 S 1380 220, 1700 300" stroke="url(#au-1)" strokeWidth="38" fill="none" opacity="0.6" />
          </g>
        </Svg>
      </Layer>
      <Layer d={0.13}>
        <Word text="Givre" />
      </Layer>
      <Layer d={0.2}>
        <Svg>
          <defs>
            <linearGradient id="fo-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3d7d8f" />
              <stop offset="0.5" stopColor="#1b4655" />
              <stop offset="1" stopColor="#0e2b36" />
            </linearGradient>
          </defs>
          <path d={far.d} fill="url(#fo-far)" />
          <linearGradient id="fo-rim" x1="0" y1="0" x2={VW} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#e1faff" stopOpacity="0.08" />
            <stop offset="0.42" stopColor="#e1faff" stopOpacity="0.1" />
            <stop offset="0.6" stopColor="#e1faff" stopOpacity="0.6" />
            <stop offset="1" stopColor="#e1faff" stopOpacity="0.5" />
          </linearGradient>
          <path
            d={far.pts.map((y, i) => `${i ? 'L' : 'M'}${f1((i / far.n) * VW)} ${f1(y)}`).join(' ')}
            fill="none"
            stroke="url(#fo-rim)"
            strokeWidth="1.6"
          />
        </Svg>
      </Layer>
      <Layer d={0.24} className="o-ground-mist o-gm-1" />
      <Layer d={0.36}>
        <Svg>
          <defs>
            <linearGradient id="pine-1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0.5" stopColor="#2b6576" />
              <stop offset="0.8" stopColor="#174250" />
            </linearGradient>
            <linearGradient id="pine-2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0.45" stopColor="#163f4c" />
              <stop offset="0.9" stopColor="#0a2530" />
            </linearGradient>
            <linearGradient id="pine-3" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0.3" stopColor="#0a2631" />
              <stop offset="0.9" stopColor="#030f15" />
            </linearGradient>
          </defs>
          <path d={pinesPath(52, 720, 34, 90, 170)} fill="url(#pine-1)" />
        </Svg>
      </Layer>
      <Layer d={0.58}>
        <Svg>
          <path d={pinesPath(63, 820, 22, 160, 290)} fill="url(#pine-2)" />
        </Svg>
      </Layer>
      <Layer d={0.62} className="o-ground-mist o-gm-2" />
      <Layer d={0.84}>
        <Svg>
          <path d={pinesPath(74, 930, 13, 280, 480)} fill="url(#pine-3)" />
          <path d={pinesPath(74, 930, 13, 280, 480)} fill="none" stroke="rgba(190,240,255,.12)" strokeWidth="1.2" />
        </Svg>
      </Layer>
      <Layer d={0.9} className="o-snow o-snow-far" />
      <CloudBanks tone="frost" part="back" />
    </>
  );
}

// ------------------------------------------------------------------------------------------------
// III. Les Pics de l'orage

export function ScenePics({ part }: { part: 'back' | 'front' }) {
  if (part === 'front') {
    return (
      <>
        <Layer d={1.0} className="o-rain" />
        <Layer d={1.4}>
          <div className="o-storm-cloud o-sc-a" />
        </Layer>
        <CloudBanks tone="storm" part="front" />
      </>
    );
  }
  const pkFar = peaksPath(17, 740, 7, 240, 460);
  const pkMid = peaksPath(29, 860, 5, 200, 400);
  return (
    <>
      <Layer d={0.03}>
        <div className="o-storm-glow" />
        <div className="o-flash o-fl-1" />
      </Layer>
      <Layer d={0.1}>
        <Svg anchor="xMidYMin" className="o-bolt o-b1">
          <defs>
            <filter id="bolt-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>
          <path d="M980 40 L940 190 L985 196 L930 360 L1010 210 L962 204 L1012 40 Z" fill="#cdb8ff" filter="url(#bolt-glow)" />
          <path d="M980 40 L940 190 L985 196 L930 360 L1010 210 L962 204 L1012 40 Z" fill="#f7f1ff" />
        </Svg>
        <Svg anchor="xMidYMin" className="o-bolt o-b2">
          <path d="M330 80 L310 170 L340 172 L300 300 L360 160 L330 158 L352 80 Z" fill="#ffe6a8" filter="url(#bolt-glow)" />
          <path d="M330 80 L310 170 L340 172 L300 300 L360 160 L330 158 L352 80 Z" fill="#fff8e6" />
        </Svg>
        <div className="o-cloud-ceiling" />
      </Layer>
      <Layer d={0.15}>
        <Word text="Orage" style={{ left: 'auto', right: '-4vw' }} />
      </Layer>
      <Layer d={0.22}>
        <Svg>
          <defs>
            <linearGradient id="pk-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#30275f" />
              <stop offset="0.6" stopColor="#1a1440" />
              <stop offset="1" stopColor="#0e0a24" />
            </linearGradient>
            <linearGradient id="pk-face" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7a68c8" stopOpacity="0.55" />
              <stop offset="0.5" stopColor="#4a3c8e" stopOpacity="0.28" />
              <stop offset="1" stopColor="#1a1440" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="pk-rim" x1="0" y1="0" x2={VW} y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#e2d6ff" stopOpacity="0.6" />
              <stop offset="0.48" stopColor="#d6c4ff" stopOpacity="0.45" />
              <stop offset="0.62" stopColor="#d6c4ff" stopOpacity="0.06" />
              <stop offset="1" stopColor="#d6c4ff" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <path d={pkFar.d} fill="url(#pk-far)" />
          <path d={pkFar.faces} fill="url(#pk-face)" />
          <path d={pkFar.line} fill="none" stroke="url(#pk-rim)" strokeWidth="1.4" />
        </Svg>
      </Layer>
      <Layer d={0.42}>
        <Svg>
          <defs>
            <linearGradient id="pk-mid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1c1640" />
              <stop offset="1" stopColor="#09071a" />
            </linearGradient>
          </defs>
          <path d={pkMid.d} fill="url(#pk-mid)" />
          <path d={pkMid.faces} fill="url(#pk-face)" opacity="0.55" />
          <path d={pkMid.line} fill="none" stroke="url(#pk-rim)" strokeWidth="1.1" opacity="0.6" />
        </Svg>
      </Layer>
      <Layer d={0.48} className="o-ground-mist o-gm-storm" />
      <Layer d={0.72}>
        <Svg>
          <path d={peaksPath(37, 990, 4, 140, 300).d} fill="#05040f" />
        </Svg>
      </Layer>
      <CloudBanks tone="storm" part="back" />
    </>
  );
}

// ------------------------------------------------------------------------------------------------
// IV. Le Sablier

function Hourglass() {
  return (
    <svg className="o-hourglass" viewBox="0 0 400 640" aria-hidden="true">
      <defs>
        <linearGradient id="hg-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2a1408" />
          <stop offset="0.5" stopColor="#4a2610" />
          <stop offset="1" stopColor="#1c0d05" />
        </linearGradient>
        <linearGradient id="hg-sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd890" />
          <stop offset="1" stopColor="#d8862e" />
        </linearGradient>
      </defs>
      <path d="M40 40 H360 M40 600 H360" stroke="#f3c969" strokeWidth="6" strokeLinecap="round" opacity="0.8" />
      <rect x="20" y="10" width="360" height="34" rx="6" fill="#1a0c05" stroke="rgba(243,201,105,.6)" />
      <rect x="20" y="596" width="360" height="34" rx="6" fill="#1a0c05" stroke="rgba(243,201,105,.6)" />
      <path d="M70 44 C70 200 190 260 190 320 C190 380 70 440 70 596 L330 596 C330 440 210 380 210 320 C210 260 330 200 330 44 Z" fill="url(#hg-glass)" stroke="rgba(255,214,140,.55)" strokeWidth="2" />
      <path d="M112 160 C150 210 190 250 196 300 L204 300 C210 250 250 210 288 160 Z" fill="url(#hg-sand)" opacity="0.92" />
      <path d="M98 596 C130 520 170 490 200 486 C230 490 270 520 302 596 Z" fill="url(#hg-sand)" />
      <rect x="198" y="300" width="4" height="190" fill="#ffe1a0" opacity="0.8" />
      {[30, 370].map(x => (
        <g key={x}>
          <rect x={x - 9} y="44" width="18" height="552" fill="#140903" stroke="rgba(243,201,105,.5)" />
          <circle cx={x} cy="320" r="10" fill="#f3c969" opacity="0.7" />
        </g>
      ))}
    </svg>
  );
}

function ClockRing({ size, ticks, className, style }: { size: number; ticks: number; className: string; style?: CSSProperties }) {
  const c = size / 2;
  return (
    <svg className={`o-clock-ring ${className}`} style={{ width: size, height: size, ...style }} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={c} cy={c} r={c - 2} fill="none" stroke="rgba(243,201,105,.45)" strokeWidth="1" />
      <circle cx={c} cy={c} r={c - 16} fill="none" stroke="rgba(243,201,105,.2)" strokeWidth="1" strokeDasharray="2 6" />
      {Array.from({ length: ticks }, (_, i) => {
        const a = (i / ticks) * Math.PI * 2;
        const long = i % 5 === 0;
        const r1 = c - 4, r2 = c - (long ? 14 : 9);
        return (
          <line
            key={i}
            x1={f1(c + Math.cos(a) * r1)}
            y1={f1(c + Math.sin(a) * r1)}
            x2={f1(c + Math.cos(a) * r2)}
            y2={f1(c + Math.sin(a) * r2)}
            stroke="rgba(255,220,150,.7)"
            strokeWidth={long ? 1.6 : 0.8}
          />
        );
      })}
    </svg>
  );
}

export function SceneSablier({ part }: { part: 'back' | 'front' }) {
  if (part === 'front') {
    return (
      <>
        <Layer d={1.05} className="o-sand-drift" />
        <CloudBanks tone="sand" part="front" />
      </>
    );
  }
  return (
    <>
      <Layer d={0.03}>
        <div className="o-sun" />
        <Stars seed={21} n={60} maxR={1} yMax={VH * 0.35} warm={0.6} />
      </Layer>
      <Layer d={0.1} className="o-hg-wrap">
        <div className="o-hg-pos">
          <ClockRing size={760} ticks={60} className="o-ring-a" />
          <ClockRing size={560} ticks={40} className="o-ring-b" />
          <Hourglass />
        </div>
      </Layer>
      <Layer d={0.16}>
        <Word text="Temps" />
      </Layer>
      <Layer d={0.24}>
        <Svg>
          <defs>
            <linearGradient id="du-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#a35a26" />
              <stop offset="1" stopColor="#5a2c10" />
            </linearGradient>
          </defs>
          <linearGradient id="du-rim" x1="0" y1="0" x2={VW} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0.1" stopColor="#ffd690" stopOpacity="0" />
            <stop offset="0.44" stopColor="#ffe2a8" stopOpacity="0.95" />
            <stop offset="0.8" stopColor="#ffd690" stopOpacity="0" />
          </linearGradient>
          <path d={dunePath(31, 780, 55, 1)} fill="url(#du-far)" />
          <path d={duneCurve(31, 780, 55, 1)} fill="none" stroke="url(#du-rim)" strokeWidth="2.2" />
        </Svg>
      </Layer>
      <Layer d={0.44}>
        <Svg>
          <defs>
            <linearGradient id="du-mid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6b3514" />
              <stop offset="1" stopColor="#331707" />
            </linearGradient>
          </defs>
          <path d={dunePath(47, 850, 70, 0.8)} fill="url(#du-mid)" />
          <path d={duneCurve(47, 850, 70, 0.8)} fill="none" stroke="url(#du-rim)" strokeWidth="1.6" opacity="0.7" />
        </Svg>
      </Layer>
      <Layer d={0.7}>
        <Svg>
          <path d={dunePath(59, 920, 60, 0.6)} fill="#1f0e05" />
        </Svg>
      </Layer>
      <CloudBanks tone="sand" part="back" />
    </>
  );
}

// ------------------------------------------------------------------------------------------------
// V. Le Bazar céleste

function Island({ x, y, s, seed, color }: { x: number; y: number; s: number; seed: number; color: string }) {
  const r = rng(seed);
  const domes = Array.from({ length: 4 }, (_, i) => ({ dx: -80 + i * 52 + r() * 16, h: 40 + r() * 70, w: 28 + r() * 18 }));
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-150 0 C-120 70 -60 150 -10 230 C10 160 60 90 150 0 Z" fill={color} />
      <path d="M-160 0 L160 0 L150 14 L-150 14 Z" fill={color} />
      {domes.map((d, i) => (
        <g key={i}>
          <rect x={d.dx - d.w / 2} y={-d.h} width={d.w} height={d.h} fill={color} />
          <path d={`M${d.dx - d.w / 2 - 3} ${-d.h} Q${d.dx} ${-d.h - d.w * 1.3} ${d.dx + d.w / 2 + 3} ${-d.h} Z`} fill={color} />
          <rect x={d.dx - 3} y={-d.h * 0.6} width="6" height="9" rx="3" fill="#ffc46b" opacity="0.85" />
        </g>
      ))}
      <rect x="95" y="-150" width="12" height="150" fill={color} />
      <path d="M92 -150 L101 -178 L110 -150 Z" fill={color} />
    </g>
  );
}

export function SceneBazar({ part }: { part: 'back' | 'front' }) {
  if (part === 'front') {
    return (
      <>
        <Layer d={1.0} className="o-sky-lanterns">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="o-sky-lantern" style={{ '--i': i } as CSSProperties} />
          ))}
        </Layer>
        <Layer d={1.4}>
          <div className="o-pink-cloud o-pc-fg" />
        </Layer>
        <CloudBanks tone="rose" part="front" />
      </>
    );
  }
  const strings = [{ x1: -40, y1: 130, x2: 660, y2: 96, sag: 120 }];
  return (
    <>
      <Layer d={0.03}>
        <div className="o-dusk-glow" />
        <Stars seed={33} n={140} maxR={1.2} yMax={VH * 0.55} warm={0.4} />
      </Layer>
      <Layer d={0.12}>
        <div className="o-pink-cloud o-pc-1" />
        <div className="o-pink-cloud o-pc-2" />
      </Layer>
      <Layer d={0.2}>
        <Svg anchor="xMidYMid">
          <Island x={1270} y={430} s={0.62} seed={5} color="#2a1238" />
          <Island x={170} y={520} s={0.48} seed={9} color="#2a1238" />
          <Island x={720} y={300} s={0.32} seed={14} color="#331843" />
        </Svg>
      </Layer>
      <Layer d={0.38}>
        <Svg anchor="xMidYMin">
          {strings.map((s, i) => {
            const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2 + s.sag;
            const lamps = Array.from({ length: 9 }, (_, k) => {
              const t = (k + 0.5) / 9;
              const x = (1 - t) * (1 - t) * s.x1 + 2 * (1 - t) * t * mx + t * t * s.x2;
              const y = (1 - t) * (1 - t) * s.y1 + 2 * (1 - t) * t * my + t * t * s.y2;
              return { x, y, hue: k % 3 };
            });
            return (
              <g key={i}>
                <path d={`M${s.x1} ${s.y1} Q${mx} ${my} ${s.x2} ${s.y2}`} fill="none" stroke="rgba(255,200,140,.35)" strokeWidth="1.2" />
                {lamps.map((l, k) => (
                  <g key={k} transform={`translate(${f1(l.x)} ${f1(l.y)})`}>
                    <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(255,200,140,.4)" />
                    <circle cx="0" cy="30" r="26" fill={['#ffb35c', '#ff7ab6', '#7fe7ff'][l.hue]} opacity="0.16" />
                    <rect x="-8" y="14" width="16" height="24" rx="7" fill={['#ffc46b', '#ff8ac0', '#9cecff'][l.hue]} />
                    <rect x="-8" y="14" width="16" height="24" rx="7" fill="url(#lantern-shade)" opacity="0.45" />
                  </g>
                ))}
              </g>
            );
          })}
          <defs>
            <linearGradient id="lantern-shade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#000" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity="0.6" />
            </linearGradient>
          </defs>
        </Svg>
      </Layer>
      <Layer d={0.6}>
        <Svg>
          <path d={dunePath(71, 900, 26, 0.6)} fill="#1a0a24" />
          <g fill="#12061a">
            {[160, 420, 1180, 1440].map((x, i) => (
              <g key={x} transform={`translate(${x} ${880 + (i % 2) * 14})`}>
                <path d="M-70 0 L-70 -90 Q0 -170 70 -90 L70 0 Z" />
                <path d="M-90 -88 L0 -132 L90 -88 Z" fill="#3a1440" />
                <rect x="-22" y="-60" width="44" height="60" rx="22" fill="#ffb35c" opacity="0.55" />
              </g>
            ))}
          </g>
        </Svg>
      </Layer>
      <CloudBanks tone="rose" part="back" />
    </>
  );
}

// ------------------------------------------------------------------------------------------------
// VI. Le Seuil

export function SceneSeuil({ part }: { part: 'back' | 'front' }) {
  if (part === 'front') {
    return (
      <>
        <Layer d={1.1} className="o-motes" />
        <CloudBanks tone="dusk" part="front" />
      </>
    );
  }
  return (
    <>
      <Layer d={0.03}>
        <Stars seed={57} n={180} maxR={1} yMax={VH} warm={0.5} />
      </Layer>
      <Layer d={0.08} className="o-gate-light-wrap">
        <div className="o-beams">
          {[-34, -20, -8, 6, 18, 31].map((a, i) => (
            <span key={a} className="o-beam" style={{ '--a': `${a}deg`, '--i': i } as CSSProperties} />
          ))}
        </div>
      </Layer>
      <Layer d={0.14} className="o-gate-wrap">
        <svg className="o-gate" viewBox="0 0 800 1000" aria-hidden="true">
          <defs>
            <radialGradient id="gate-in" cx="0.5" cy="0.55" r="0.6">
              <stop offset="0" stopColor="#fff6dc" />
              <stop offset="0.35" stopColor="#f6d28a" stopOpacity="0.85" />
              <stop offset="0.75" stopColor="#8a5a1c" stopOpacity="0.35" />
              <stop offset="1" stopColor="#1a1208" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="gate-stone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1b1826" />
              <stop offset="1" stopColor="#0a0910" />
            </linearGradient>
          </defs>
          <path d="M120 1000 L120 420 A280 280 0 0 1 680 420 L680 1000 Z" fill="url(#gate-in)" />
          <path
            d="M40 1000 L40 410 A360 360 0 0 1 760 410 L760 1000 L680 1000 L680 420 A280 280 0 0 0 120 420 L120 1000 Z"
            fill="url(#gate-stone)"
          />
          <path d="M120 1000 L120 420 A280 280 0 0 1 680 420 L680 1000" fill="none" stroke="#f3c969" strokeWidth="2.2" />
          <path d="M40 1000 L40 410 A360 360 0 0 1 760 410 L760 1000" fill="none" stroke="rgba(243,201,105,.55)" strokeWidth="1.2" />
          <path d="M80 1000 L80 415 A320 320 0 0 1 720 415 L720 1000" fill="none" stroke="rgba(243,201,105,.25)" strokeWidth="1" strokeDasharray="3 7" />
          {Array.from({ length: 13 }, (_, i) => {
            const a = Math.PI + (i / 12) * Math.PI;
            return (
              <line
                key={i}
                x1={f1(400 + Math.cos(a) * 282)}
                y1={f1(420 + Math.sin(a) * 282)}
                x2={f1(400 + Math.cos(a) * 358)}
                y2={f1(420 + Math.sin(a) * 358)}
                stroke="rgba(243,201,105,.35)"
                strokeWidth="1"
              />
            );
          })}
          <path d="M392 60 l8 -26 l8 26 l26 8 l-26 8 l-8 26 l-8 -26 l-26 -8 z" fill="#f3c969" />
        </svg>
      </Layer>
      <Layer d={0.5}>
        <Svg>
          <defs>
            <linearGradient id="steps" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#16131f" />
              <stop offset="1" stopColor="#05040a" />
            </linearGradient>
          </defs>
          {Array.from({ length: 5 }, (_, i) => {
            const y = 860 + i * 30;
            const half = 300 + i * 120;
            return (
              <g key={i}>
                <path d={`M${800 - half} ${y} L${800 + half} ${y} L${800 + half + 60} ${y + 30} L${800 - half - 60} ${y + 30} Z`} fill="url(#steps)" />
                <path d={`M${800 - half} ${y} L${800 + half} ${y}`} stroke="rgba(243,201,105,.3)" strokeWidth="1" />
              </g>
            );
          })}
        </Svg>
      </Layer>
      <CloudBanks tone="dusk" part="back" />
    </>
  );
}

export const SCENES = [SceneObservatoire, SceneForet, ScenePics, SceneSablier, SceneBazar, SceneSeuil];
