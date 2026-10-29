// Emblèmes des cartes de pouvoir (SVG dessinés pour Spellmate).
import type { CardId } from '../../shared/cards';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 3.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function Emblem({ id }: { id: CardId }) {
  switch (id) {
    case 'time_warp':
      return (
        <>
          <path {...S} d="M30 14 H70 M30 86 H70" strokeWidth={4} />
          <path {...S} d="M34 14 C34 38 49 43 49 50 C49 57 34 62 34 86 M66 14 C66 38 51 43 51 50 C51 57 66 62 66 86" />
          <path d="M39 82 Q50 66 61 82 Z" fill="currentColor" opacity="0.9" />
          <path d="M41 26 Q50 33 59 26 Z" fill="currentColor" opacity="0.55" />
          <path {...S} d="M50 47 L50 66" strokeWidth={1.8} strokeDasharray="2 4" />
          <path {...S} d="M14 40 A38 38 0 0 1 30 18" strokeWidth={2.2} opacity="0.7" />
          <path {...S} d="M86 60 A38 38 0 0 1 70 82" strokeWidth={2.2} opacity="0.7" />
          <path d="M28 14 l5 -5 l1 7 z M72 86 l-5 5 l-1 -7 z" fill="currentColor" opacity="0.7" />
        </>
      );
    case 'ice_wall':
      return (
        <>
          <path {...S} d="M50 10 L61 24 L61 72 L50 86 L39 72 L39 24 Z" />
          <path {...S} d="M50 10 L50 86 M39 24 L50 30 L61 24" strokeWidth={2} opacity="0.75" />
          <path {...S} d="M27 34 L35 44 L35 74 L27 84 L19 74 L19 44 Z" />
          <path {...S} d="M73 34 L81 44 L81 74 L73 84 L65 74 L65 44 Z" />
          <path {...S} d="M27 34 L27 84 M73 34 L73 84" strokeWidth={1.6} opacity="0.6" />
          <path d="M50 30 L61 24 L61 40 L50 46 Z" fill="currentColor" opacity="0.25" />
          <circle cx="86" cy="22" r="2" fill="currentColor" />
          <circle cx="14" cy="28" r="1.6" fill="currentColor" />
        </>
      );
    case 'gravity':
      return (
        <>
          <circle cx="50" cy="42" r="15" {...S} />
          <path d="M40 36 A12 12 0 0 1 52 29" {...S} strokeWidth={2} opacity="0.7" />
          <ellipse cx="50" cy="42" rx="36" ry="10" {...S} strokeWidth={2.4} transform="rotate(-14 50 42)" />
          <path {...S} d="M32 70 L38 78 L44 70 M44 76 L50 86 L56 76 M56 70 L62 78 L68 70" />
          <circle cx="83" cy="33" r="3" fill="currentColor" />
        </>
      );
    case 'freeze':
      return (
        <>
          {[0, 60, 120].map(a => (
            <g key={a} transform={`rotate(${a} 50 50)`}>
              <path {...S} d="M50 12 L50 88" />
              <path {...S} d="M42 20 L50 28 L58 20 M42 80 L50 72 L58 80 M44 33 L50 38 L56 33 M44 67 L50 62 L56 67" strokeWidth={2.6} />
            </g>
          ))}
          <circle cx="50" cy="50" r="6" fill="currentColor" />
        </>
      );
    case 'shield':
      return (
        <>
          <path {...S} d="M50 10 L82 22 L80 54 C77 72 65 83 50 90 C35 83 23 72 20 54 L18 22 Z" />
          <path {...S} d="M50 22 L70 30 L69 53 C67 65 59 73 50 78 C41 73 33 65 31 53 L30 30 Z" strokeWidth={2} opacity="0.6" />
          <path {...S} d="M50 34 L50 66 M40 44 L50 34 L60 44 M41 58 L50 50 L59 58" strokeWidth={2.8} />
        </>
      );
    case 'swap':
      return (
        <>
          <path {...S} d="M24 40 A28 28 0 0 1 74 30" />
          <path d="M80 18 L78 38 L62 30 Z" fill="currentColor" />
          <path {...S} d="M76 60 A28 28 0 0 1 26 70" />
          <path d="M20 82 L22 62 L38 70 Z" fill="currentColor" />
          <circle cx="34" cy="50" r="7" {...S} strokeWidth={2.6} />
          <rect x="59" y="43" width="14" height="14" rx="3" {...S} strokeWidth={2.6} />
        </>
      );
    case 'rewind':
      return (
        <>
          <path {...S} d="M78 30 A34 34 0 1 0 84 56" />
          <path d="M86 18 L84 42 L64 32 Z" fill="currentColor" />
          <path d="M50 36 L34 50 L50 64 Z M66 36 L50 50 L66 64 Z" fill="currentColor" />
        </>
      );
    case 'revive':
      return (
        <>
          <path {...S} d="M50 50 C38 42 38 20 50 18 C62 20 62 42 50 50 Z" />
          <path {...S} d="M30 52 L70 52 M50 50 L50 88" strokeWidth={4} />
          <path {...S} d="M20 30 L28 34 M80 30 L72 34 M14 52 L22 52 M86 52 L78 52 M24 72 L31 67 M76 72 L69 67" strokeWidth={2.4} opacity="0.8" />
          <path {...S} d="M38 88 L62 88" />
        </>
      );
    case 'knight_leap':
      return (
        <>
          <path
            d="M40 86 C39 76 42 70 47 66 C43 67 38 67 35 66 C30 64 28 60 29 56 C30 52 35 49 38 46 C41 43 42 39 44 35 L45 28 L50 33 L53 29 L55 34 C65 36 72 46 72 60 C72 70 70 78 69 86 Z"
            fill="currentColor"
            opacity="0.92"
          />
          <path {...S} d="M14 74 C14 40 34 16 66 14" strokeDasharray="5 6" strokeWidth={2.6} />
          <path d="M72 12 L60 6 L62 20 Z" fill="currentColor" />
        </>
      );
    case 'lightning':
      return (
        <>
          <path d="M58 6 L28 54 L47 54 L38 94 L74 40 L54 40 L66 6 Z" fill="currentColor" />
          <path {...S} d="M18 30 L26 36 M82 64 L74 60 M20 70 L28 66 M80 24 L74 30" strokeWidth={2.4} opacity="0.75" />
        </>
      );
    case 'phase':
      return (
        <>
          <path
            {...S}
            d="M30 84 L33 50 L67 50 L70 84 Z M28 50 L72 50 L72 44 L28 44 Z M28 44 L28 24 L36 24 L36 30 L45 30 L45 24 L55 24 L55 30 L64 30 L64 24 L72 24 L72 44"
            strokeDasharray="5 5"
          />
          <path {...S} d="M10 62 Q20 56 30 62 T50 62 T70 62 T90 62" strokeWidth={2.4} opacity="0.85" />
          <path {...S} d="M10 74 Q20 68 30 74 T50 74 T70 74 T90 74" strokeWidth={2} opacity="0.55" />
        </>
      );
  }
}

export function CardEmblem({ id, className }: { id: CardId; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <Emblem id={id} />
    </svg>
  );
}
