// Engagements de la boutique, et le sceau « Zéro pay-to-win ».
// « Qui voit quoi » dit juste : le roi et les sorts se voient chez l'adversaire, l'échiquier non (chacun garde le sien,
// GamePage passe l'échiquier de celui qui regarde).
import { Link } from 'react-router-dom';
import { StarMark } from '../PageScene';

export function ShopPromise() {
  return (
    <section className="sp" aria-label="Nos engagements">
      <div>
        <span className="sp-k">Aucun avantage</span>
        <p>Un skin change l’apparence, jamais la partie. Toutes les cartes, tous les modes et le classement restent gratuits ; les parties classées restent équitables.</p>
      </div>
      <div>
        <span className="sp-k">Qui voit quoi</span>
        <p>Votre roi et vos sorts : vos adversaires les voient. Votre échiquier : il vous suit dans toutes vos parties, et vos adversaires gardent le leur.</p>
      </div>
      <div>
        <span className="sp-k">Livré à l’instant</span>
        <p>
          Paiement sécurisé par Stripe, prix TTC, ajouté à votre collection et équipé dès la confirmation. <Link to="/cgv">Conditions de vente</Link>
        </p>
      </div>
    </section>
  );
}

/** Sceau tournant « ZÉRO PAY-TO-WIN · STYLE UNIQUEMENT » (ordinateur seulement ; il s'arrête pendant un sort). */
export function Seal() {
  return (
    <div className="bz-seal" aria-label="Zéro pay-to-win : style uniquement" role="img">
      <svg viewBox="0 0 200 200" className="bz-seal-text" aria-hidden="true">
        <defs>
          <path id="bz-seal-c" d="M100 100 m-78 0 a78 78 0 1 1 156 0 a78 78 0 1 1 -156 0" />
        </defs>
        <text fontFamily="Cinzel" fontSize="13.2" letterSpacing="5.2" fill="#f3c969">
          <textPath href="#bz-seal-c">ZÉRO PAY-TO-WIN · STYLE UNIQUEMENT · </textPath>
        </text>
      </svg>
      <span className="bz-seal-core">
        <StarMark size={18} />
      </span>
    </div>
  );
}
