// Ligne d'action de la cabine : l'écart entre l'essai et la panoplie portée, et un seul bouton principal (équiper,
// acheter et équiper, créer un compte, bientôt en vente). Réutilisée en plus court par la barre fixe du téléphone.
import { formatPrice, itemById, itemLabel } from '../../../shared/catalog';
import { itemWithArticle } from '../../../shared/skins/texts';
import { pluriel } from '../../../shared/text/fr';
import { Spinner } from '../../components/Layout';
import { isCollectionLine, skins } from './trial';
import type { CollectionHint, MainAction, TrialQuote } from './trial';

/** Textes de la ligne d'action : résumé, montant, libellé du bouton principal. */
export function actionTexts(q: TrialQuote, a: MainAction): { line: string; amount: string | null; button: string | null } {
  const n = q.changed.length;
  const total = q.cart?.totalCents ?? 0;
  switch (a.kind) {
    case 'none':
      return { line: 'Votre panoplie actuelle', amount: null, button: null };
    case 'equip': {
      if (a.ids.length === 1) {
        const it = itemById(a.ids[0]);
        return { line: it ? `${itemLabel(it)} · ${it.free ? 'Offert' : 'Possédé'}` : '', amount: null, button: 'Équiper' };
      }
      return { line: `${skins(a.ids.length)} à équiper`, amount: null, button: 'Équiper' };
    }
    case 'buy': {
      const one = q.buy.length === 1 && !q.equip.length ? itemById(q.buy[0]) : undefined;
      const line = one ? itemLabel(one) : `${skins(q.buy.length)} à acheter${q.equip.length ? ` · ${q.equip.length} à équiper` : ''}`;
      return { line, amount: formatPrice(total), button: `Acheter et équiper · ${formatPrice(total)}` };
    }
    case 'signup':
      return {
        line: total ? `Essai : ${skins(n)} · ${formatPrice(total)}` : `Essai : ${skins(n)} ${pluriel(n, 'offert')}`,
        amount: null,
        button: total ? 'Créer un compte pour l’acheter' : 'Créer un compte pour l’équiper',
      };
    case 'soon':
      return { line: `Essai : ${skins(n)} · ${formatPrice(total)}`, amount: null, button: 'Bientôt en vente' };
  }
}

interface Props {
  quote: TrialQuote;
  action: MainAction;
  hint: CollectionHint | null;
  busy: boolean;
  /** Le compte n'est pas encore chargé : les boutons attendent. */
  waiting: boolean;
  demo: boolean;
  /** Connecté : « Équiper ce que je possède » est possible (paiements fermés, essai mêlé). */
  loggedIn: boolean;
  /** Rangée des boutons : la barre fixe du téléphone se montre quand elle sort de l'écran. */
  btnsRef?: (el: HTMLDivElement | null) => void;
  onMain: () => void;
  /** Équiper seulement ce que l'on possède (paiements fermés, essai mêlé). */
  onEquipOwned: () => void;
  onRevertAll: () => void;
  onHint: (h: CollectionHint) => void;
}

export function TrialAction({ quote, action, hint, busy, waiting, demo, loggedIn, btnsRef, onMain, onEquipOwned, onRevertAll, onHint }: Props) {
  const t = actionTexts(quote, action);
  const collectionLine = quote.cart?.lines.find(isCollectionLine);
  return (
    <div className={`ta ${action.kind === 'none' ? 'is-idle' : ''}`}>
      {collectionLine && action.kind !== 'none' ? (
        <p className="ta-note">✦ {collectionLine.label} au prix de la collection, sceau compris</p>
      ) : (
        hint && (
          <button type="button" className="ta-note ta-hint" onClick={() => onHint(hint)}>
            ✦ La collection {hint.collection.name} les réunit avec {phraseOf(hint.extra)} : {formatPrice(hint.price)} →
          </button>
        )
      )}
      <div className="ta-txt">
        <span className="ta-line">{t.line}</span>
        {action.kind === 'none' ? <small className="ta-help">Touchez un skin pour l’essayer.</small> : t.amount && <b className="ta-amount">{t.amount}</b>}
        {quote.changed.length > 0 && (
          <button type="button" className="ta-revert" onClick={onRevertAll}>
            Rétablir
          </button>
        )}
      </div>
      <div className="ta-btns" ref={btnsRef}>
        {action.kind === 'soon' && loggedIn && quote.equip.length > 0 && (
          <button type="button" className="btn ta-second" onClick={onEquipOwned} disabled={busy || waiting}>
            Équiper ce que je possède
          </button>
        )}
        {t.button && <ActionButton label={t.button} kind={action.kind} busy={busy} disabled={waiting} onClick={onMain} />}
      </div>
      {demo && action.kind === 'buy' && (
        <p className="ta-demo">
          <span className="badge cyan">Démo</span> Paiements simulés : rien n’est débité.
        </p>
      )}
    </div>
  );
}

/** Bouton principal : doré pour acheter, plus sobre pour équiper ; désactivé quand les paiements sont fermés. */
export function ActionButton({ label, kind, busy, disabled, onClick, short }: { label: string; kind: MainAction['kind']; busy: boolean; disabled?: boolean; onClick: () => void; short?: string }) {
  const soon = kind === 'soon';
  return (
    <button
      type="button"
      className={`ta-main ${kind === 'equip' ? 'is-equip' : ''} ${soon ? 'is-soon' : ''}`}
      onClick={onClick}
      disabled={busy || soon || disabled}
      aria-label={label}
    >
      {busy ? <Spinner /> : (
        <>
          <span className="ta-main-l">{label}</span>
          {short && <span className="ta-main-s">{short}</span>}
        </>
      )}
    </button>
  );
}

function phraseOf(id: string) {
  const it = itemById(id);
  return it ? itemWithArticle(it) : '';
}
