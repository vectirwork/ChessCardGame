// Ligne d'aide des pré-coups (Board, premoves.ts), dans le statut pendant le tour adverse.
export function PremoveNote({ n, mobile, onCancel }: { n: number; mobile: boolean; onCancel: () => void }) {
  if (n <= 0) return <small>Préparez déjà vos coups suivants : ils se joueront d’eux-mêmes, dans l’ordre.</small>;
  return (
    <small className="gs-premoves">
      {n === 1 ? '1 pré-coup en attente' : `${n} pré-coups en attente`}
      {mobile ? ' · touchez une case vide pour les annuler. ' : ' · clic droit pour les annuler. '}
      <button type="button" className="gs-premoves-cancel" onClick={onCancel}>
        Annuler
      </button>
    </small>
  );
}
