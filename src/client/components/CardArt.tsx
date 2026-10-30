// Emblèmes des cartes de pouvoir (SVG dessinés pour Spellmate).
import type { CardId } from '../../shared/cards';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 3.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function Emblem({ id }: { id: CardId }) {
  switch (id) {
    // ----- Pouvoirs -----
    case 'hourglass':
      return (
        <>
          <g transform="rotate(-16 50 50)">
            <path {...S} d="M32 15 H68 M32 85 H68" strokeWidth={4.4} />
            <path {...S} d="M36 15 C36 38 48 44 48 50 C48 56 36 62 36 85 M64 15 C64 38 52 44 52 50 C52 56 64 62 64 85" />
            <path d="M41 81 Q50 65 59 81 Z" fill="currentColor" opacity="0.9" />
            <path d="M42 26 Q50 33 58 26 Z" fill="currentColor" opacity="0.5" />
            <path {...S} d="M50 50 L50 66" strokeWidth={1.8} strokeDasharray="2 4" />
          </g>
          <path {...S} d="M15 38 A37 37 0 0 1 38 12" strokeWidth={2.4} opacity="0.8" />
          <path d="M44 9 L35 6 L37 16 Z" fill="currentColor" opacity="0.85" />
          <path {...S} d="M85 62 A37 37 0 0 1 62 88" strokeWidth={2.4} opacity="0.8" />
          <path d="M56 91 L65 94 L63 84 Z" fill="currentColor" opacity="0.85" />
          <circle cx="80" cy="24" r="2.2" fill="currentColor" />
          <circle cx="87" cy="34" r="1.5" fill="currentColor" opacity="0.7" />
          <circle cx="16" cy="70" r="1.8" fill="currentColor" opacity="0.8" />
        </>
      );
    case 'truce':
      return (
        <>
          {[0, 1].map(m => (
            <g key={m} transform={m ? 'translate(100 0) scale(-1 1)' : undefined}>
              <path {...S} d="M35 28 L73 78" strokeWidth={4.4} />
              <path {...S} d="M28 35 L42 22" />
              <path {...S} d="M35 28 L28 19" strokeWidth={3} />
              <circle cx="26.5" cy="16.5" r="3" fill="currentColor" />
              <path d="M73 78 L77 85 L69 81 Z" fill="currentColor" />
            </g>
          ))}
          <path {...S} d="M30 90 C16 82 9 64 12 44" strokeWidth={2.2} opacity="0.8" />
          <path {...S} d="M70 90 C84 82 91 64 88 44" strokeWidth={2.2} opacity="0.8" />
          {[[24, 85, 35], [16, 74, 60], [12, 61, 80], [12, 49, 100]].map(([x, y, a]) => (
            <g key={x * 100 + y}>
              <ellipse cx={x} cy={y} rx="5.2" ry="2.3" transform={`rotate(${-a} ${x} ${y})`} fill="currentColor" opacity="0.85" />
              <ellipse cx={100 - x} cy={y} rx="5.2" ry="2.3" transform={`rotate(${a} ${100 - x} ${y})`} fill="currentColor" opacity="0.85" />
            </g>
          ))}
          <circle cx="50" cy="53" r="4.5" fill="currentColor" />
        </>
      );
    case 'blood_moon':
      return (
        <>
          <circle cx="50" cy="42" r="28" fill="currentColor" opacity="0.2" />
          <circle cx="50" cy="42" r="28" {...S} />
          <path d="M50 14 A28 28 0 0 0 50 70 A18 28 0 0 1 50 14 Z" fill="currentColor" opacity="0.9" />
          <circle cx="61" cy="33" r="4.6" {...S} strokeWidth={2} opacity="0.8" />
          <circle cx="67" cy="50" r="3" {...S} strokeWidth={1.8} opacity="0.7" />
          <circle cx="55" cy="57" r="2.2" fill="currentColor" opacity="0.6" />
          <path d="M38 76 C38 81 34 83 34 87 A4 4 0 0 0 42 87 C42 83 38 81 38 76 Z" fill="currentColor" />
          <path d="M52 79 C52 82 49.6 83.6 49.6 86 A2.4 2.4 0 0 0 54.4 86 C54.4 83.6 52 82 52 79 Z" fill="currentColor" opacity="0.8" />
          <path d="M64 74 C64 78 61 79.5 61 82.5 A3 3 0 0 0 67 82.5 C67 79.5 64 78 64 74 Z" fill="currentColor" opacity="0.9" />
          <path {...S} d="M14 22 L20 26 M86 22 L80 26 M10 46 L17 46 M90 46 L83 46" strokeWidth={2.2} opacity="0.7" />
        </>
      );
    case 'ice_age':
      return (
        <>
          <path {...S} d="M50 8 L86 29 L86 71 L50 92 L14 71 L14 29 Z" strokeWidth={2.6} />
          <path {...S} d="M50 8 L50 17 M86 29 L78 33.5 M86 71 L78 66.5 M50 92 L50 83 M14 71 L22 66.5 M14 29 L22 33.5" strokeWidth={2.2} />
          <circle cx="50" cy="35" r="9" fill="currentColor" opacity="0.9" />
          <path d="M44.5 45 L55.5 45 C56 53 60 60 63 69 L37 69 C40 60 44 53 44.5 45 Z" fill="currentColor" opacity="0.9" />
          <rect x="33" y="69" width="34" height="7" rx="3" fill="currentColor" opacity="0.9" />
          <path {...S} d="M30 52 L38 49 M70 52 L62 49 M28 62 L35 62 M72 62 L65 62" strokeWidth={2} opacity="0.75" />
          <path d="M70 18 l1.8 4.6 4.6 1.8 -4.6 1.8 -1.8 4.6 -1.8 -4.6 -4.6 -1.8 4.6 -1.8 Z" fill="currentColor" />
          <path d="M26 78 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 Z" fill="currentColor" opacity="0.8" />
        </>
      );
    case 'blast':
      return (
        <>
          <path
            d="M50 10 L57 34 L80 21 L67 43 L91 51 L67 58 L79 81 L56 67 L50 91 L44 67 L21 81 L33 58 L9 51 L33 43 L20 21 L43 34 Z"
            fill="currentColor"
            opacity="0.22"
          />
          <path {...S} d="M50 10 L57 34 L80 21 L67 43 L91 51 L67 58 L79 81 L56 67 L50 91 L44 67 L21 81 L33 58 L9 51 L33 43 L20 21 L43 34 Z" />
          <circle cx="50" cy="51" r="11" fill="currentColor" />
          <circle cx="50" cy="51" r="17" {...S} strokeWidth={1.8} strokeDasharray="3 4" opacity="0.8" />
          <path d="M12 12 L19 14 L15 19 Z M88 11 L83 16 L90 18 Z M90 89 L84 87 L87 82 Z M10 88 L14 82 L17 88 Z" fill="currentColor" opacity="0.8" />
        </>
      );
    case 'rift':
      return (
        <>
          <path {...S} d="M10 16 H90 V39 L77 45 L63 37 L50 46 L37 38 L23 45 L10 39 Z" />
          <path {...S} d="M10 84 H90 V61 L77 55 L63 63 L50 54 L37 62 L23 55 L10 61 Z" />
          <path d="M10 16 H30 V27 H10 Z M50 16 H70 V27 H50 Z M30 27 H50 V38 L37 38 L30 41.5 Z M70 27 H90 V39 L77 45 L70 41 Z" fill="currentColor" opacity="0.3" />
          <path d="M10 73 H30 V84 H10 Z M50 73 H70 V84 H50 Z M30 62 L37 62 L50 54 V73 H30 Z M70 59 L77 55 L90 61 V73 H70 Z" fill="currentColor" opacity="0.3" />
          <path {...S} d="M6 50 L20 50 L28 47.5 L40 51.5 L50 49 L60 51.5 L72 47.5 L80 50 L94 50" strokeWidth={1.8} strokeDasharray="1 4" opacity="0.9" />
          <circle cx="44" cy="50" r="1.6" fill="currentColor" />
          <circle cx="66" cy="49" r="1.2" fill="currentColor" />
          <path d="M56 49 l2 2 -2 2 -2 -2 Z" fill="currentColor" opacity="0.8" />
        </>
      );
    case 'tide':
      return (
        <>
          <path {...S} d="M8 72 C22 72 25 56 36 49 C48 41 64 44 68 57 C71 66 63 72 57 67 C52 63 55 56 61 57" strokeWidth={3.6} />
          <path d="M8 72 C22 72 25 56 36 49 C48 41 64 44 68 57 C70 63 68 70 76 74 L8 74 Z" fill="currentColor" opacity="0.22" />
          <path {...S} d="M6 81 Q18 75 30 81 T54 81 T78 81 T96 79" strokeWidth={2.8} />
          <path {...S} d="M6 91 Q18 85 30 91 T54 91 T78 91 T96 89" strokeWidth={2} opacity="0.6" />
          <path {...S} d="M82 58 L82 22 M74 30 L82 22 L90 30 M74 42 L82 34 L90 42" strokeWidth={3} />
          <circle cx="30" cy="36" r="2" fill="currentColor" opacity="0.8" />
          <circle cx="40" cy="30" r="1.5" fill="currentColor" opacity="0.7" />
          <circle cx="22" cy="44" r="1.4" fill="currentColor" opacity="0.6" />
        </>
      );
    // ----- Duel (anciennes parties) -----
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
    default:
      return <circle cx="50" cy="50" r="20" {...S} />;
  }
}

export function CardEmblem({ id, className }: { id: CardId; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <Emblem id={id} />
    </svg>
  );
}
