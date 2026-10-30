// Effets en cours qui concernent toute la partie (Climats, Présages) : une ligne de pastilles sobres dans le HUD.
// Les effets attachés à une case ou à une pièce se lisent déjà sur l'échiquier ; ils ne sont pas répétés ici.
import type { CSSProperties } from 'react';
import { CARDS } from '../../../shared/cards';
import type { Effect } from '../../../shared/game';

const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

export function EffectChips({ effects, all = false }: { effects: Effect[]; /** Montrer aussi les effets locaux. */ all?: boolean }) {
  const shown = effects.filter(e => all || e.global || e.pending);
  if (!shown.length) return null;
  return (
    <ul className="gs-effects" aria-label="Effets en cours">
      {shown.map(e => {
        const def = CARDS[e.card];
        if (!def) return null;
        return (
          <li key={e.id} className={e.pending ? 'is-pending' : ''} style={{ '--h': def.hue } as CSSProperties} title={def.description}>
            <span className="gs-effect-dot" aria-hidden="true" />
            <b>{def.name}</b>
            <span>{e.pending ? (e.delay && e.delay > 1 ? `arrive dans ${plural(e.delay, 'coup')}` : 'arrive au prochain tour') : `encore ${plural(e.remaining, 'coup')}`}</span>
          </li>
        );
      })}
    </ul>
  );
}
