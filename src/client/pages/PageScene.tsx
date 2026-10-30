// Décor et en-têtes des pages intérieures, au langage de l'Odyssée : chaque page est un lieu, avec son ciel, sa
// teinte (--tint, reprise par les panneaux) et son surtitre gravé. Le ciel est un calque fixe, décoratif, qui ne
// s'anime qu'en transform et opacity (coupé par prefers-reduced-motion dans global.css).
import { useEffect, useId, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export type PlaceKey = 'bazar' | 'seuil' | 'observatoire' | 'hall' | 'cabinet' | 'archives' | 'nuees' | 'atelier';

/** Teinte de chaque lieu (r g b), comme les lieux de l'accueil. */
const TINT: Record<PlaceKey, string> = {
  bazar: '236 120 180',
  seuil: '243 201 105',
  observatoire: '120 92 255',
  hall: '150 110 255',
  cabinet: '127 150 255',
  archives: '214 178 120',
  nuees: '94 214 240',
  atelier: '127 231 255',
};

const SEED: Record<PlaceKey, number> = { bazar: 33, seuil: 61, observatoire: 7, hall: 19, cabinet: 41, archives: 53, nuees: 71, atelier: 89 };

const VW = 1600;
const VH = 1000;

function rng(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** Rang en toutes lettres abrégées : 1er, 2e, 3e… */
export function ordinal(n: number) {
  return n === 1 ? '1er' : `${n}e`;
}

/** Titre du document : « Boutique · Spellmate ». */
export function useTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Spellmate`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}

/** Étoile à quatre branches dorée (la marque), en petit. */
export function StarMark({ size = 14 }: { size?: number }) {
  const id = `pgs${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="pg-star">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1c4" />
          <stop offset="0.55" stopColor="#f3c969" />
          <stop offset="1" stopColor="#c47f2a" />
        </linearGradient>
      </defs>
      <path d="M32 4l5.6 22.4L60 32l-22.4 5.6L32 60l-5.6-22.4L4 32l22.4-5.6z" fill={`url(#${id})`} />
    </svg>
  );
}

function Stars({ seed, n, warm = 0.2 }: { seed: number; n: number; warm?: number }) {
  const stars = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: n }, (_, i) => ({
      x: r() * VW,
      y: r() * r() * VH * 0.9,
      rad: r() < 0.06 ? 1.9 : 0.4 + r() * 0.9,
      o: 0.25 + r() * 0.65,
      c: r() < warm ? '#ffe2b0' : r() < 0.2 ? '#bfe6ff' : '#ffffff',
      tw: i % 5 === 0,
    }));
  }, [seed, n, warm]);
  const dot = (s: (typeof stars)[number], i: number) => (
    <circle key={i} cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r={s.rad.toFixed(2)} fill={s.c} opacity={s.o.toFixed(2)} />
  );
  return (
    <>
      <svg className="pg-svg" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMin slice">
        {stars.filter(s => !s.tw).map(dot)}
      </svg>
      <svg className="pg-svg pg-tw" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMin slice">
        {stars.filter(s => s.tw).map(dot)}
      </svg>
    </>
  );
}

/** Bazar : îles à coupoles, guirlande de lanternes et lanternes qui montent. */
function BazarDecor() {
  const lamps = useMemo(() => {
    const s = { x1: 700, y1: 64, x2: 1660, y2: 30, sag: 70 };
    const mx = (s.x1 + s.x2) / 2;
    const my = (s.y1 + s.y2) / 2 + s.sag;
    return Array.from({ length: 9 }, (_, k) => {
      const t = (k + 0.5) / 9;
      return {
        x: (1 - t) * (1 - t) * s.x1 + 2 * (1 - t) * t * mx + t * t * s.x2,
        y: (1 - t) * (1 - t) * s.y1 + 2 * (1 - t) * t * my + t * t * s.y2,
        hue: k % 3,
        path: `M${s.x1} ${s.y1} Q${mx} ${my} ${s.x2} ${s.y2}`,
      };
    });
  }, []);
  const domes = (x: number, y: number, sc: number, seed: number, color: string) => {
    const r = rng(seed);
    const d = Array.from({ length: 4 }, (_, i) => ({ dx: -80 + i * 52 + r() * 16, h: 40 + r() * 70, w: 28 + r() * 18 }));
    return (
      <g transform={`translate(${x} ${y}) scale(${sc})`} fill={color}>
        <path d="M-150 0 C-120 70 -60 150 -10 230 C10 160 60 90 150 0 Z" />
        <path d="M-160 0 L160 0 L150 14 L-150 14 Z" />
        {d.map((o, i) => (
          <g key={i}>
            <rect x={o.dx - o.w / 2} y={-o.h} width={o.w} height={o.h} />
            <path d={`M${o.dx - o.w / 2 - 3} ${-o.h} Q${o.dx} ${-o.h - o.w * 1.3} ${o.dx + o.w / 2 + 3} ${-o.h} Z`} />
            <rect x={o.dx - 3} y={-o.h * 0.6} width="6" height="9" rx="3" fill="#ffc46b" opacity="0.8" />
          </g>
        ))}
      </g>
    );
  };
  return (
    <>
      <div className="pg-cloud pg-cloud-a" />
      <div className="pg-cloud pg-cloud-b" />
      <svg className="pg-svg pg-islands" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice">
        {domes(1330, 520, 0.6, 5, '#2a1238')}
        {domes(150, 640, 0.46, 9, '#2a1238')}
        {domes(820, 380, 0.3, 14, '#331843')}
      </svg>
      <svg className="pg-svg pg-garland" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMin slice">
        <path d={lamps[0].path} fill="none" stroke="rgba(255,200,140,.32)" strokeWidth="1.2" />
        {lamps.map((l, k) => (
          <g key={k} transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)})`}>
            <line x1="0" y1="0" x2="0" y2={12 + (k % 3) * 8} stroke="rgba(255,200,140,.4)" />
            <g transform={`translate(0 ${(k % 3) * 8})`}>
              <circle cx="0" cy="28" r="24" fill={['#ffb35c', '#ff7ab6', '#7fe7ff'][l.hue]} opacity="0.14" />
              <rect x="-7" y="14" width="14" height="22" rx="6" fill={['#ffc46b', '#ff8ac0', '#9cecff'][l.hue]} opacity="0.9" />
            </g>
          </g>
        ))}
      </svg>
      <div className="pg-sky-lanterns">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="pg-sky-lantern" style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      <svg className="pg-svg pg-ground" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMax slice">
        <path d="M0 930 C 260 905 520 948 800 924 C 1080 900 1330 944 1600 918 L1600 1000 L0 1000 Z" fill="#1a0a24" />
        <g fill="#12061a">
          {[150, 430, 1170, 1450].map((x, i) => (
            <g key={x} transform={`translate(${x} ${925 + (i % 2) * 12})`}>
              <path d="M-60 0 L-60 -80 Q0 -150 60 -80 L60 0 Z" />
              <path d="M-78 -78 L0 -116 L78 -78 Z" fill="#3a1440" />
              <rect x="-18" y="-52" width="36" height="52" rx="18" fill="#ffb35c" opacity="0.45" />
            </g>
          ))}
        </g>
      </svg>
    </>
  );
}

/** Seuil : une porte d'or entrouverte à l'horizon, des rayons. */
function SeuilDecor() {
  return (
    <>
      <div className="pg-rays" />
      <svg className="pg-svg pg-door" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="pg-door-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f3c969" stopOpacity="0.55" />
            <stop offset="1" stopColor="#f3c969" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M560 1000 L560 420 Q800 150 1040 420 L1040 1000" fill="none" stroke="url(#pg-door-g)" strokeWidth="1.2" />
        <path d="M600 1000 L600 438 Q800 205 1000 438 L1000 1000" fill="none" stroke="url(#pg-door-g)" strokeWidth="0.8" opacity="0.6" />
        <path d="M0 960 C 400 930 1200 930 1600 960 L1600 1000 L0 1000 Z" fill="#06060f" />
      </svg>
    </>
  );
}

/** Observatoire et Hall : anneaux d'astrolabe qui tournent lentement, constellations. */
function OrbitDecor({ constellation }: { constellation?: boolean }) {
  return (
    <>
      <div className="pg-orbits">
        <span className="pg-orbit o1" />
        <span className="pg-orbit o2" />
        <span className="pg-orbit o3" />
      </div>
      {constellation && (
        <svg className="pg-svg pg-constellation" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMin slice">
          <polyline points="1120,120 1200,170 1300,150 1360,230 1450,210" fill="none" stroke="rgba(243,201,105,.35)" strokeWidth="1" />
          <polyline points="1200,170 1230,260 1360,230" fill="none" stroke="rgba(243,201,105,.25)" strokeWidth="1" />
          {[
            [1120, 120],
            [1200, 170],
            [1300, 150],
            [1360, 230],
            [1450, 210],
            [1230, 260],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === 1 ? 3 : 2} fill="#fff1c4" />
          ))}
        </svg>
      )}
    </>
  );
}

function CloudDecor() {
  return (
    <>
      <div className="pg-cloud pg-cloud-c" />
      <div className="pg-cloud pg-cloud-d" />
      <div className="pg-cloud pg-cloud-e" />
    </>
  );
}

/** Ciel du lieu : calque fixe derrière le contenu. */
export function Sky({ place }: { place: PlaceKey }) {
  return (
    <div className={`pg-sky pg-sky-${place}`} aria-hidden="true">
      <div className="pg-sky-glow" />
      <Stars seed={SEED[place]} n={place === 'archives' ? 70 : 130} warm={place === 'bazar' || place === 'seuil' ? 0.4 : 0.15} />
      {place === 'bazar' && <BazarDecor />}
      {place === 'seuil' && <SeuilDecor />}
      {place === 'observatoire' && <OrbitDecor />}
      {place === 'hall' && <OrbitDecor constellation />}
      {place === 'nuees' && <CloudDecor />}
    </div>
  );
}

/** Enveloppe d'une page-lieu : ciel, teinte des panneaux, conteneur. */
export function PlacePage({ place, className = '', narrow, children }: { place: PlaceKey; className?: string; narrow?: boolean; children: ReactNode }) {
  return (
    <div className={`pg pg-${place}`} style={{ '--tint': TINT[place] } as CSSProperties}>
      <Sky place={place} />
      <div className={`container page pg-in ${narrow ? 'pg-narrow' : ''} ${className}`}>{children}</div>
    </div>
  );
}

/**
 * Surtitre gravé et grand titre : « V · LE BAZAR CÉLESTE ── 640 M » puis le titre en Cormorant (italique dorée sur <em>).
 * `num` : chiffre romain d'un lieu de l'accueil ; sinon l'étoile de la marque.
 */
export function PageHead({
  num,
  place,
  aside,
  title,
  lede,
  center,
  children,
  as: Tag = 'h1',
}: {
  num?: string;
  place: string;
  aside?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  center?: boolean;
  children?: ReactNode;
  as?: 'h1' | 'h2';
}) {
  return (
    <header className={`pg-head ${center ? 'center' : ''}`}>
      <p className="pg-kicker">
        <span className="pg-num">{num ?? <StarMark size={12} />}</span>
        <span>{place}</span>
        {aside && (
          <>
            <i className="pg-rule" />
            <span className="pg-aside">{aside}</span>
          </>
        )}
      </p>
      <Tag className="pg-title">{title}</Tag>
      {lede && <p className="pg-lede">{lede}</p>}
      {children}
    </header>
  );
}
