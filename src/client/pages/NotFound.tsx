// Page introuvable : hors de la carte, au milieu des nuées.
import { Link } from 'react-router-dom';
import { PageHead, PlacePage, useTitle } from './PageScene';

export default function NotFound() {
  useTitle('Page introuvable');
  return (
    <PlacePage place="nuees" className="nf" narrow>
      <div className="nf-compass" aria-hidden="true">
        <svg viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(243,201,105,.35)" strokeWidth="1" />
          <circle cx="100" cy="100" r="74" fill="none" stroke="rgba(243,201,105,.18)" strokeWidth="1" strokeDasharray="2 6" />
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            const r1 = i % 6 === 0 ? 80 : 86;
            return (
              <line
                key={i}
                x1={(100 + Math.sin(a) * r1).toFixed(1)}
                y1={(100 - Math.cos(a) * r1).toFixed(1)}
                x2={(100 + Math.sin(a) * 92).toFixed(1)}
                y2={(100 - Math.cos(a) * 92).toFixed(1)}
                stroke="rgba(243,201,105,.5)"
                strokeWidth="1"
              />
            );
          })}
          <text x="100" y="40" textAnchor="middle" fontFamily="Cinzel" fontSize="11" fill="#f3c969" letterSpacing="2">
            N
          </text>
        </svg>
        <span className="nf-needle">
          <svg viewBox="0 0 20 140">
            <path d="M10 0 L16 70 L10 76 L4 70 Z" fill="#f3c969" />
            <path d="M10 140 L16 70 L10 64 L4 70 Z" fill="rgba(241,239,248,.35)" />
            <circle cx="10" cy="70" r="3.5" fill="#05060f" stroke="#f3c969" />
          </svg>
        </span>
      </div>
      <PageHead
        place="Hors de la carte"
        aside="Erreur 404"
        title={
          <>
            Ce coup <em>n’existe pas.</em>
          </>
        }
        lede="La page demandée s’est perdue dans les nuées. Même un Retour arrière n’y changera rien : reprenons depuis un lieu connu."
        center
      >
        <div className="nf-actions">
          <Link to="/" className="btn-gold sm">
            Revenir à l’accueil
          </Link>
          <Link to="/apprendre" className="btn btn-sm">
            Apprendre
          </Link>
          <Link to="/boutique" className="btn btn-sm">
            Boutique
          </Link>
          <Link to="/cartes" className="btn btn-sm">
            Règles et cartes
          </Link>
        </div>
      </PageHead>
    </PlacePage>
  );
}
