// Petits éléments communs aux pages des fonctions classiques.
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './features.css';
// Ciel des pages ft- (#contenu:has(> .ft-page)) ; après features.css, comme dans la construction (feuille partagée)
import '../styles/pages.css';

export function PageHead({ kicker, title, sub, children }: { kicker: string; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="ft-head">
      <div className="eyebrow">{kicker}</div>
      <h1 className="page-title">{title}</h1>
      {sub && <p className="page-sub">{sub}</p>}
      {children}
    </header>
  );
}

export function Crumbs({ items }: { items: { to?: string; label: string }[] }) {
  return (
    <nav className="ft-crumbs" aria-label="Fil d’Ariane">
      {items.map((it, i) => (
        <span key={i}>
          {i > 0 && <span className="sep" aria-hidden="true">/</span>}
          {it.to ? <Link to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/**
 * Titre du document : « Apprendre · <marque> » (pageTitle de src/shared/config/brand.ts, figé au build : __SM__). En
 * quittant la page, celui de l'accueil, que gardent les pages sans titre (le HTML servi porte déjà celui de la page).
 * Même code dans pages/PageScene.tsx : ne pas l'importer de là, ni de components/Layout.tsx (le découpage du build en
 * changerait : index.html perdrait des modulepreload, vérifié).
 */
export function useTitle(title: string) {
  useEffect(() => {
    document.title = title + __SM__.suffixeTitre;
    return () => {
      document.title = __SM__.titreAccueil;
    };
  }, [title]);
}

export function Level({ n, max = 3 }: { n: number; max?: number }) {
  const label = n === 1 ? 'Facile' : n === 2 ? 'Moyen' : 'Difficile';
  return (
    <span className="ft-level" title={label} aria-label={`Difficulté : ${label}`}>
      {Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}
    </span>
  );
}

export function Check({ on }: { on: boolean }) {
  return (
    <svg className={`ft-check ${on ? 'on' : ''}`} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" />
      {on && <path d="M6 10.4l2.6 2.6L14.2 7.2" />}
    </svg>
  );
}

/** Interrupteur accessible (moteur, options). */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`ft-switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span className="ft-switch-track"><span className="ft-switch-knob" /></span>
      <span>{label}</span>
    </button>
  );
}
