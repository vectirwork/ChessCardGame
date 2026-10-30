// Spellmate · La Galerie : petites briques partagées (marque, lignes masquées, visibilité).
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';

/** Étoile à quatre branches, en encre ou en vermillon (couleur courante). */
export function Star({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <path d="M32 2l5.6 24.4L62 32l-24.4 5.6L32 62l-5.6-24.4L2 32l24.4-5.6z" fill="currentColor" />
    </svg>
  );
}

export function Arrow({ dir = 'right', size = 18 }: { dir?: 'right' | 'left' | 'down'; size?: number }) {
  const rot = dir === 'left' ? 180 : dir === 'down' ? 90 : 0;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ transform: `rotate(${rot}deg)` }} className="arrow">
      <path d="M3 12h17M14 5.5 20.5 12 14 18.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
    </svg>
  );
}

/** Titre découpé en lignes masquées : chaque ligne monte dans sa fenêtre à l'apparition. */
export function Lines({ lines, as: Tag = 'h2', className = '' }: { lines: ReactNode[]; as?: 'h1' | 'h2' | 'h3' | 'p'; className?: string }) {
  return (
    <Tag className={`lines ${className}`} data-rv="lines">
      {lines.map((l, i) => (
        <span className="ln" key={i} style={{ '--i': i } as CSSProperties}>
          <span className="ln-in">{l}</span>
        </span>
      ))}
    </Tag>
  );
}

/** Étiquette éditoriale : « 02 — Salle des pouvoirs ». */
export function Eyebrow({ num, children, className = '' }: { num?: string; children: ReactNode; className?: string }) {
  return (
    <p className={`eyebrow ${className}`} data-rv="up">
      {num && <span className="eb-num">{num}</span>}
      {num && <span className="eb-rule" />}
      <span>{children}</span>
    </p>
  );
}

/** Vrai tant que l'élément touche l'écran (les transformations sont prises en compte). */
export function useInView(ref: RefObject<Element | null>, margin = '0px') {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(entries => setOn(entries[0]?.isIntersecting ?? false), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return on;
}
