// En-tête, menu complet, pied de page et petites briques communes (modale, chargement), au style Odyssée.
// Le menu est sobre : quelques entrées dans l'en-tête, toutes les fonctions dans le panneau « Menu ».
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../store';

/** Marque Spellmate : étoile à quatre branches dans son cercle, dégradé d'or. */
export function LogoMark({ size = 30 }: { size?: number }) {
  const id = `lg${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="logo-mark">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1c4" />
          <stop offset="0.55" stopColor="#f3c969" />
          <stop offset="1" stopColor="#c47f2a" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill="none" stroke={`url(#${id})`} strokeWidth="1.2" opacity="0.6" />
      <path d="M32 6l5.2 20.8L58 32l-20.8 5.2L32 58l-5.2-20.8L6 32l20.8-5.2z" fill={`url(#${id})`} />
      <circle cx="32" cy="32" r="3.4" fill="#05060f" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Spellmate, accueil">
      <LogoMark size={28} />
      <span>SPELLMATE</span>
    </Link>
  );
}

/** Toutes les fonctions du site, rangées (menu complet et pied de page). */
const SECTIONS: { title: string; links: { to: string; label: string; hint?: string }[] }[] = [
  {
    title: 'Jouer',
    links: [
      { to: '/', label: 'Partie immédiate', hint: "Sur l'échiquier de l'accueil, sans compte" },
      { to: '/jouer?mode=bot', label: "Contre l'IA", hint: 'Apprenti, Sorcier, Archimage' },
      { to: '/jouer?mode=invite', label: 'Inviter un ami', hint: 'Un lien, même sans compte' },
      { to: '/jouer?mode=quick', label: 'Parties classées', hint: 'Elo, adversaire de votre niveau' },
      { to: '/direct', label: 'Parties en direct', hint: 'Regarder les parties en cours' },
    ],
  },
  {
    title: 'Apprendre',
    links: [
      { to: '/apprendre', label: 'Leçons', hint: 'Des règles aux premières combinaisons' },
      { to: '/problemes', label: 'Problèmes', hint: 'Trouver le coup juste' },
      { to: '/analyse', label: 'Analyse', hint: 'Moteur, import et export PGN ou FEN' },
      { to: '/cartes', label: 'Règles et cartes', hint: 'Tous les pouvoirs, expliqués' },
    ],
  },
  {
    title: 'Communauté',
    links: [
      { to: '/classement', label: 'Classement' },
      { to: '/parties', label: 'Mes parties' },
      { to: '/boutique', label: 'Boutique', hint: 'Skins et plateaux, rien d’autre' },
    ],
  },
];

function useOutside(ref: React.RefObject<HTMLElement | null>, on: boolean, close: () => void) {
  useEffect(() => {
    if (!on) return;
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, [ref, on, close]);
}

function UserMenu() {
  const { me, logout } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useOutside(ref, open, () => setOpen(false));
  if (!me) return null;
  return (
    <div ref={ref} className="user-menu">
      <button className="user-chip" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="avatar">{me.username[0]?.toUpperCase()}</span>
        <span className="hide-mobile user-name">{me.username}</span>
        <span className="user-elo hide-mobile">{me.rating}</span>
      </button>
      {open && (
        <div className="menu" role="menu" onClick={() => setOpen(false)}>
          <Link role="menuitem" to={`/joueur/${me.username}`}>Mon profil</Link>
          <Link role="menuitem" to="/parties">Mes parties</Link>
          <Link role="menuitem" to="/compte">Mon compte</Link>
          <Link role="menuitem" to="/boutique">Ma collection</Link>
          {me.isAdmin && <Link role="menuitem" to="/admin">Administration</Link>}
          <div className="sep" />
          <button
            role="menuitem"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

/** Panneau « Menu » : toutes les fonctions, en colonnes, dans la nuit de l'Odyssée. */
function SiteMenu({ onClose }: { onClose: () => void }) {
  const { me, logout } = useApp();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    ref.current?.querySelector<HTMLElement>('a, button')?.focus();
    document.documentElement.classList.add('menu-open');
    return () => {
      window.removeEventListener('keydown', key);
      document.documentElement.classList.remove('menu-open');
    };
  }, [onClose]);
  return (
    <div className="site-menu" role="dialog" aria-modal="true" aria-label="Menu" ref={ref}>
      <div className="site-menu-in">
        {SECTIONS.map(s => (
          <nav key={s.title} className="site-menu-col" aria-label={s.title}>
            <p className="site-menu-k">{s.title}</p>
            {s.links.map(l => (
              <Link key={l.to + l.label} to={l.to} onClick={onClose}>
                <span>{l.label}</span>
                {l.hint && <small>{l.hint}</small>}
              </Link>
            ))}
          </nav>
        ))}
        <nav className="site-menu-col" aria-label="Compte">
          <p className="site-menu-k">Compte</p>
          {me ? (
            <>
              <Link to={`/joueur/${me.username}`} onClick={onClose}>
                <span>{me.username}</span>
                <small>{me.rating} Elo · profil public</small>
              </Link>
              <Link to="/compte" onClick={onClose}>
                <span>Mon compte</span>
              </Link>
              {me.isAdmin && (
                <Link to="/admin" onClick={onClose}>
                  <span>Administration</span>
                </Link>
              )}
              <button
                type="button"
                onClick={async () => {
                  onClose();
                  await logout();
                  navigate('/');
                }}
              >
                <span>Se déconnecter</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/connexion" onClick={onClose}>
                <span>Se connecter</span>
              </Link>
              <Link to="/inscription" onClick={onClose}>
                <span>Créer un compte</span>
                <small>Gratuit et facultatif : Elo, historique, collection</small>
              </Link>
            </>
          )}
        </nav>
      </div>
    </div>
  );
}

export function Header() {
  const { me, ready } = useApp();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname, loc.search]);
  return (
    <>
      <header className={`site-header ${open ? 'is-open' : ''}`}>
        <div className="site-header-in">
          <Logo />
          <nav className="site-nav" aria-label="Navigation principale">
            <NavLink to="/jouer">Jouer</NavLink>
            <NavLink to="/apprendre">Apprendre</NavLink>
            <NavLink to="/problemes">Problèmes</NavLink>
            <NavLink to="/analyse">Analyse</NavLink>
            <NavLink to="/boutique">Boutique</NavLink>
          </nav>
          <div className="header-right">
            {ready && !me && (
              <Link to="/connexion" className="link-quiet hide-mobile">
                Se connecter
              </Link>
            )}
            <UserMenu />
            <button className="menu-btn" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}>
              <span className="menu-btn-lines" aria-hidden="true">
                <span />
                <span />
              </span>
              <span className="menu-btn-label">{open ? 'Fermer' : 'Menu'}</span>
            </button>
          </div>
        </div>
      </header>
      {open && <SiteMenu onClose={() => setOpen(false)} />}
    </>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-in">
        <div className="site-footer-top">
          <div className="site-footer-brand">
            <Logo />
            <p>Les échecs que vous aimez, avec trois cartes de pouvoir pour renverser la partie. Gratuit, sans publicité, sans pay-to-win.</p>
          </div>
          <div className="site-footer-links">
            {SECTIONS.map(s => (
              <nav key={s.title} aria-label={s.title}>
                <h4>{s.title}</h4>
                {s.links.map(l => (
                  <Link key={l.to + l.label} to={l.to}>
                    {l.label}
                  </Link>
                ))}
              </nav>
            ))}
            <nav aria-label="Légal">
              <h4>Légal</h4>
              <Link to="/mentions-legales">Mentions légales</Link>
              <Link to="/cgu">Conditions d'utilisation</Link>
              <Link to="/cgv">Conditions de vente</Link>
              <Link to="/confidentialite">Confidentialité</Link>
            </nav>
          </div>
        </div>
        <div className="site-footer-bottom">
          <span>© {new Date().getFullYear()} Spellmate. Tous droits réservés.</span>
          <span>Les échecs, avec un peu de magie.</span>
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
    <div className="page-loader">
      <Spinner />
    </div>
  );
}
