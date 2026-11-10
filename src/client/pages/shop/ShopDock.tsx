// Barre d'achat fixe (téléphone et tablette, sous 1100 px) : elle apparaît quand l'essai diffère de la panoplie et que
// les boutons de la ligne d'action sont hors de l'écran (IntersectionObserver ; sur téléphone, la ligne d'action est
// sous le portant). Entrée et sortie en translateY seulement.
// Elle se cache quand le clavier virtuel est ouvert et ne prend jamais le focus d'elle-même. Toucher les vignettes
// ramène à la cabine. La page réserve sa hauteur en bas (shop.css) : elle ne masque jamais la dernière carte.
import { useEffect, useState } from 'react';
import { formatPrice } from '../../../shared/catalog';
import type { ItemKind } from '../../../shared/catalog';
import { ItemThumb } from './ItemThumb';
import { ActionButton, actionTexts } from './TrialAction';
import type { MainAction, Trial, TrialQuote } from './trial';

interface Props {
  /** Boutons de la ligne d'action : la barre se montre quand ils sortent de l'écran (un seul bouton à l'écran). */
  anchor: HTMLElement | null;
  trial: Trial;
  quote: TrialQuote;
  action: MainAction;
  busy: boolean;
  waiting: boolean;
  onMain: () => void;
  onBack: () => void;
}

export function ShopDock({ anchor, trial, quote, action, busy, waiting, onMain, onBack }: Props) {
  const [away, setAway] = useState(false);
  const [keyboard, setKeyboard] = useState(false);

  useEffect(() => {
    if (!anchor || !('IntersectionObserver' in window)) return;
    // L'en-tête du site est translucide et fixe : une ligne d'action passée dessous est hors de vue
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64;
    // Visible en entier ou presque : sinon la barre fixe prend le relais (elle porte le même bouton)
    const io = new IntersectionObserver(([e]) => setAway(e.intersectionRatio < 0.9), {
      threshold: [0, 0.9, 1],
      rootMargin: `-${Math.round(header)}px 0px 0px 0px`,
    });
    io.observe(anchor);
    return () => io.disconnect();
  }, [anchor]);

  // Le pied de page commun réserve la hauteur de la barre (shop.css) : au bout de la page, rien n'est dessous
  useEffect(() => {
    document.body.classList.add('has-shop-dock');
    return () => document.body.classList.remove('has-shop-dock');
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setKeyboard(vv.height < window.innerHeight * 0.72);
    vv.addEventListener('resize', on);
    return () => vv.removeEventListener('resize', on);
  }, []);

  const show = away && !keyboard && quote.changed.length > 0;
  const t = actionTexts(quote, action);
  const n = quote.changed.length;
  const total = quote.cart?.totalCents;
  return (
    <div className={`dock ${show ? 'on' : ''}`} aria-hidden={!show} inert={!show ? true : undefined}>
      <button type="button" className="dock-ths" onClick={onBack} aria-label="Revenir à la cabine d’essayage">
        {quote.changed.map((k: ItemKind) => (
          <ItemThumb key={k} id={trial[k]} size="chip" />
        ))}
      </button>
      <span className="dock-txt">
        <span>
          Essai : {n} skin{n > 1 ? 's' : ''}
        </span>
        {total ? <b>{formatPrice(total)}</b> : <b>{action.kind === 'equip' ? 'À équiper' : 'Offert'}</b>}
      </span>
      {t.button && (
        <ActionButton
          label={t.button}
          short={action.kind === 'buy' ? 'Acheter et équiper' : action.kind === 'signup' ? 'Créer un compte' : undefined}
          kind={action.kind}
          busy={busy}
          disabled={waiting}
          onClick={onMain}
        />
      )}
    </div>
  );
}
