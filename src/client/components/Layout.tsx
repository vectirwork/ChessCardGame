// En-tête, menu, pied de page.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../store';

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id="lg-star" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1c4" />
          <stop offset="0.5" stopColor="#f3c969" />
          <stop offset="1" stopColor="#e88a2a" />
        </linearGradient>
      </defs>
      <path d="M32 3l6.5 22.5L61 32l-22.5 6.5L32 61l-6.5-22.5L3 32l22.5-6.5z" fill="url(#lg-star)" />
      <path d="M32 18l2.8 11.2L46 32l-11.2 2.8L32 46l-2.8-11.2L18 32l11.2-2.8z" fill="#0a0b17" opacity="0.85" />
      <circle cx="32" cy="32" r="3.2" fill="#fff4d6" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Spellmate, accueil">
      <LogoMark />
      <span>SPELLMATE</span>
    </Link>
  );
}

function UserMenu() {
  const { me, logout } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  if (!me) return null;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="user-chip" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="avatar">{me.username[0]?.toUpperCase()}</span>
        <span className="hide-mobile" style={{ fontWeight: 600 }}>{me.username}</span>
        <span className="badge gold hide-mobile">{me.rating}</span>
      </button>
      {open && (
        <div className="menu" role="menu" onClick={() => setOpen(false)}>
          <Link to={`/joueur/${me.username}`}>👤 Mon profil</Link>
          <Link to="/compte">⚙️ Mon compte</Link>
          <Link to="/boutique">✨ Ma collection</Link>
          {me.isAdmin && <Link to="/admin">📊 Administration</Link>}
          <div className="sep" />
          <button
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            ↩ Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { me, ready } = useApp();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <header className="header">
      <div className="container">
        <Logo />
        <nav className={`nav ${open ? 'open' : ''}`} aria-label="Navigation principale">
          <NavLink to="/jouer">Jouer</NavLink>
          <NavLink to="/cartes">Les cartes</NavLink>
          <NavLink to="/boutique">Boutique</NavLink>
          <NavLink to="/classement">Classement</NavLink>
        </nav>
        <div className="header-right">
          {ready && !me && (
            <>
              <Link to="/connexion" className="btn btn-ghost btn-sm hide-mobile">Connexion</Link>
              <Link to="/inscription" className="btn btn-primary btn-sm">Créer un compte</Link>
            </>
          )}
          <UserMenu />
          <button className="btn btn-ghost btn-sm burger" onClick={() => setOpen(o => !o)} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Logo />
            <p style={{ marginTop: 14, maxWidth: 320 }}>
              Les échecs que vous aimez, avec trois cartes de pouvoir pour renverser la partie. Gratuit, sans publicité, sans pay-to-win.
            </p>
          </div>
          <div>
            <h4>Jouer</h4>
            <Link to="/jouer">Nouvelle partie</Link>
            <Link to="/jouer?mode=bot">Contre l'IA</Link>
            <Link to="/jouer?mode=invite">Inviter un ami</Link>
            <Link to="/classement">Classement</Link>
          </div>
          <div>
            <h4>Découvrir</h4>
            <Link to="/cartes">Règles et cartes</Link>
            <Link to="/boutique">Boutique</Link>
            <Link to="/inscription">Créer un compte</Link>
          </div>
          <div>
            <h4>Légal</h4>
            <Link to="/mentions-legales">Mentions légales</Link>
            <Link to="/cgu">Conditions d'utilisation</Link>
            <Link to="/cgv">Conditions de vente</Link>
            <Link to="/confidentialite">Confidentialité</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Spellmate. Tous droits réservés.</span>
          <span>Fait avec ♟ et un peu de magie.</span>
        </div>
      </div>
    </footer>
  );
}

export function Modal({ children, onClose, wide }: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal panel panel-pad ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="Chargement" />;
}

export function PageLoader() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
      <Spinner />
    </div>
  );
}
