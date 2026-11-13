import { Component, Suspense, createElement, lazy, useContext, useEffect, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Route, Routes, matchPath, useLocation } from 'react-router-dom';
import { Footer, Header, PageLoader } from './components/Layout';
import { reloadForNewVersion } from './socket';
import { FeaturesContext } from './store';
import { ROUTES, routeOpen } from '../shared/config/routes';
import type { PageModule, PropsOf } from '../shared/config/routes';

/**
 * Page chargée à la demande (un morceau de code et de CSS par page, décision D6). `preload()` récupère son code à
 * l'avance (main.tsx pour la première page, que le serveur précharge aussi dès le HTML ; survol d'un lien) : une page
 * dont le code est déjà là s'affiche d'un coup, sans écran d'attente. Le choix entre rendu direct et attente Suspense
 * est fait au montage et ne change plus ensuite (aucun remontage en cours de vie).
 *
 * Code de la page introuvable (onglet resté ouvert après une mise en ligne, réseau coupé) : un préchargement en échec
 * ne fait rien (survol d'un lien : aucun rechargement en pleine partie) ; à l'affichage, l'erreur va à PageBoundary,
 * qui recharge le site.
 */
type Page<P> = ComponentType<P> & { preload: () => Promise<unknown> };
export function page<P extends object>(load: () => Promise<{ default: ComponentType<P> }>): Page<P> {
  let ready: ComponentType<P> | undefined;
  let pending: Promise<ComponentType<P>> | undefined;
  const preload = () =>
    (pending ??= load().then(
      m => (ready = m.default),
      e => {
        pending = undefined; // nouvel essai possible (réseau coupé, nouvelle version)
        throw e;
      },
    ));
  const Lazy = lazy(() => preload().then(C => ({ default: C })));
  function Paged(props: P) {
    const [Now] = useState(() => ready);
    return createElement((Now ?? Lazy) as ComponentType<P>, props);
  }
  return Object.assign(Paged, { preload });
}

/**
 * Chargeur de chaque module de page (src/shared/config/routes.ts) : un import() littéral par module, donc un morceau
 * de code par page. Le type exige un chargeur pour chaque module de PAGE_MODULES, et des propriétés conformes à
 * PageProps (Auth : mode ; Legal : page).
 */
const PAGES: { [M in PageModule]: Page<PropsOf<M>> } = {
  Home: page<object>(() => import('./pages/Home').then(m => ({ default: m.Home }))),
  Play: page(() => import('./pages/Play')),
  GameRoute: page(() => import('./pages/GameRoute')),
  Rules: page(() => import('./pages/Rules')),
  Shop: page(() => import('./pages/Shop')),
  DemoCheckout: page(() => import('./pages/DemoCheckout')),
  Auth: page(() => import('./pages/Auth')),
  Account: page(() => import('./pages/Account')),
  Profile: page(() => import('./pages/Profile')),
  Leaderboard: page(() => import('./pages/Leaderboard')),
  Admin: page(() => import('./pages/Admin')),
  Legal: page(() => import('./pages/Legal')),
  NotFound: page(() => import('./pages/NotFound')),
  Learn: page(() => import('./pages/Learn')),
  Puzzles: page(() => import('./pages/Puzzles')),
  Analysis: page(() => import('./pages/Analysis')),
  MyGames: page(() => import('./pages/MyGames')),
  Live: page(() => import('./pages/Live')),
};
/** Charge le code de la page qui correspond à `pathname` (page introuvable sinon). Ne rejette jamais. */
export function preloadRoute(pathname: string): Promise<unknown> {
  const hit = ROUTES.find(r => matchPath(r.path, pathname));
  return PAGES[hit ? hit.page : 'NotFound'].preload().catch(() => undefined);
}

/**
 * Échec du chargement d'un module (code d'une page, ou composant paresseux d'une page comme l'échiquier de l'accueil) :
 * « Failed to fetch dynamically imported module » (Chromium), « error loading dynamically imported module » (Firefox),
 * « Importing a module script failed. » (Safari), « Unable to preload CSS for … » (feuille du module, Vite).
 */
export const importFailed = (e: unknown) => /dynamically imported|a module script|preload CSS/.test(String(e));

/**
 * Limite d'erreur d'une page : code introuvable, ou exception pendant le rendu. Sans elle, React démonte tout le site
 * (page blanche, sans en-tête pour repartir).
 * - Code introuvable (onglet resté ouvert après une mise en ligne, réseau coupé) : le site est rechargé tout de suite,
 *   au plus une fois par minute (reloadForNewVersion), ce qui prend aussi la version en ligne ; sinon « Réessayer »
 *   recharge. Ni React (composant paresseux rejeté) ni le navigateur (import en échec, vérifié dans Chromium) ne
 *   retentent le même module : redessiner ne suffirait pas.
 * - Exception de rendu : « Réessayer » redessine la page.
 * Une limite par module de page (clé) : une page saine n'est jamais remontée (même module, même instance, comme
 * avant) ; l'erreur s'efface quand le chemin change (`at`), même vers une autre page du même module.
 */
interface BoundaryProps {
  children: ReactNode;
  /** Chemin affiché : quand il change, l'erreur est oubliée. */
  at: string;
}
interface BoundaryState {
  failure: 'import' | 'render' | null;
  at?: string;
}
export class PageBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failure: null };
  static getDerivedStateFromError(e: unknown): Partial<BoundaryState> {
    return { failure: importFailed(e) ? 'import' : 'render' };
  }
  static getDerivedStateFromProps(p: BoundaryProps, s: BoundaryState): Partial<BoundaryState> | null {
    return p.at === s.at ? null : { failure: null, at: p.at };
  }
  componentDidCatch(e: unknown) {
    if (importFailed(e)) reloadForNewVersion();
  }
  retry = () => {
    if (this.state.failure === 'import') window.location.reload();
    else this.setState({ failure: null });
  };
  render() {
    if (!this.state.failure) return this.props.children;
    return (
      <div className="page-loader" role="alert">
        <p>
          Impossible d’afficher cette page.{' '}
          <button type="button" className="btn" onClick={this.retry}>
            Réessayer
          </button>
        </p>
      </div>
    );
  }
}

/** Élément d'une route : la page dans sa limite d'erreur. */
const pageElement = (page: PageModule, at: string, props?: object) => (
  <PageBoundary key={page} at={at}>
    {createElement(PAGES[page] as ComponentType<object>, props)}
  </PageBoundary>
);

/**
 * Intention de navigation (souris qui bouge au-dessus d'un lien interne, ou focus clavier) : le code de la page
 * visée est chargé d'avance, la navigation n'attend pas le réseau. Rien ne se passe au repos (événements de l'utilisateur seulement).
 */
function usePrefetchOnIntent() {
  useEffect(() => {
    const onIntent = (e: Event) => {
      // Au doigt, le pointeur passe aussi sur un lien quand on pose le doigt pour faire défiler la page : charger et
      // évaluer la page visée (et injecter sa feuille de style) tomberait en plein geste. Le clic suit de toute façon.
      if (e instanceof PointerEvent && e.pointerType !== 'mouse') return;
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(a instanceof HTMLAnchorElement) || a.origin !== window.location.origin || a.target === '_blank') return;
      if (a.pathname.startsWith('/api/') || /\.\w+$/.test(a.pathname)) return;
      void preloadRoute(a.pathname);
    };
    // Souris : un vrai mouvement au-dessus du lien (pointermove), pas pointerover. Pendant un défilement à la molette
    // sous un curseur immobile, les liens qui passent sous lui émettent pointerover : chaque page visée était alors
    // chargée, évaluée et sa feuille de style injectée (restyle de tout l'accueil) en pleine glissade. Seul un
    // changement d'élément survolé est examiné.
    let last: EventTarget | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.target === last) return;
      last = e.target;
      onIntent(e);
    };
    const opts = { capture: true, passive: true };
    document.addEventListener('pointermove', onMove, opts);
    // Lien arrivé sous un curseur immobile puis cliqué : le chargement part dès l'appui, avant le clic
    document.addEventListener('pointerdown', onIntent, opts);
    document.addEventListener('focusin', onIntent, opts);
    return () => {
      document.removeEventListener('pointermove', onMove, opts);
      document.removeEventListener('pointerdown', onIntent, opts);
      document.removeEventListener('focusin', onIntent, opts);
    };
  }, []);
}

export function App() {
  const loc = useLocation();
  // Interrupteurs (contexte à part : ne change pas à chaque réponse de /api/me, aucun rendu de plus au défaut)
  const features = useContext(FeaturesContext);
  const inGame = loc.pathname.startsWith('/partie/');
  useEffect(() => {
    if (!loc.hash) window.scrollTo(0, 0);
  }, [loc.pathname, loc.hash]);
  usePrefetchOnIntent();
  return (
    <>
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <Header />
      <main id="contenu">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {ROUTES.filter(r => routeOpen(r, features)).map(r => (
              <Route key={r.path} path={r.path} element={pageElement(r.page, loc.pathname, r.props)} />
            ))}
            <Route path="*" element={pageElement('NotFound', loc.pathname)} />
          </Routes>
        </Suspense>
      </main>
      {!inGame && <Footer />}
    </>
  );
}
