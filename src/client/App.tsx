import { Suspense, lazy, useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { Route, Routes, matchPath, useLocation } from 'react-router-dom';
import { Footer, Header, PageLoader } from './components/Layout';

/**
 * Page chargée à la demande (un morceau de code et de CSS par page, décision D6). `preload()` récupère son code à
 * l'avance (main.tsx pour la première page, que le serveur précharge aussi dès le HTML ; survol d'un lien) : une page
 * dont le code est déjà là s'affiche d'un coup, sans écran d'attente. Le choix entre rendu direct et attente Suspense
 * est fait au montage et ne change plus ensuite (aucun remontage en cours de vie).
 */
interface Preloadable {
  preload: () => Promise<unknown>;
}
function page<P extends object>(load: () => Promise<{ default: ComponentType<P> }>): ComponentType<P> & Preloadable {
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
    const Shown = (Now ?? Lazy) as ComponentType<P>;
    return <Shown {...props} />;
  }
  return Object.assign(Paged, { preload });
}

const Home = page<object>(() => import('./pages/Home').then(m => ({ default: m.Home })));
const Play = page(() => import('./pages/Play'));
const GamePage = page(() => import('./pages/GameRoute'));
const Rules = page(() => import('./pages/Rules'));
const Shop = page(() => import('./pages/Shop'));
const DemoCheckout = page(() => import('./pages/DemoCheckout'));
const Auth = page(() => import('./pages/Auth'));
const Account = page(() => import('./pages/Account'));
const Profile = page(() => import('./pages/Profile'));
const Leaderboard = page(() => import('./pages/Leaderboard'));
const Admin = page(() => import('./pages/Admin'));
const Legal = page(() => import('./pages/Legal'));
const NotFound = page(() => import('./pages/NotFound'));
const Learn = page(() => import('./pages/Learn'));
const Puzzles = page(() => import('./pages/Puzzles'));
const Analysis = page(() => import('./pages/Analysis'));
const MyGames = page(() => import('./pages/MyGames'));
const Live = page(() => import('./pages/Live'));

/** Chemins et pages de Routes ci-dessous, à tenir ensemble : sert au préchargement de la première page (une route
 *  absente d'ici s'affiche quand même, après un écran d'attente). */
const PAGES: [string, Preloadable][] = [
  ['/', Home],
  ['/jouer', Play],
  ['/partie/:id', GamePage],
  ['/cartes', Rules],
  ['/regles', Rules],
  ['/boutique', Shop],
  ['/boutique/demo/:id', DemoCheckout],
  ['/connexion', Auth],
  ['/inscription', Auth],
  ['/mot-de-passe-oublie', Auth],
  ['/reinitialiser/:token', Auth],
  ['/verifier/:token', Auth],
  ['/compte', Account],
  ['/joueur/:username', Profile],
  ['/classement', Leaderboard],
  ['/admin', Admin],
  ['/apprendre', Learn],
  ['/apprendre/:lesson', Learn],
  ['/problemes', Puzzles],
  ['/problemes/:puzzle', Puzzles],
  ['/analyse', Analysis],
  ['/analyse/:gameId', Analysis],
  ['/parties', MyGames],
  ['/direct', Live],
  ['/cgu', Legal],
  ['/cgv', Legal],
  ['/confidentialite', Legal],
  ['/mentions-legales', Legal],
];

/** Charge le code de la page qui correspond à `pathname` (page introuvable sinon). Ne rejette jamais. */
export function preloadRoute(pathname: string): Promise<unknown> {
  const hit = PAGES.find(([path]) => matchPath(path, pathname));
  return (hit ? hit[1] : NotFound).preload().catch(() => undefined);
}

/**
 * Intention de navigation (survol, toucher ou focus d'un lien interne) : le code de la page visée est chargé
 * d'avance, la navigation n'attend pas le réseau. Rien ne se passe au repos (événements de l'utilisateur seulement).
 */
function usePrefetchOnIntent() {
  useEffect(() => {
    const onIntent = (e: Event) => {
      // Au doigt, pointerover arrive aussi quand on pose le doigt sur un lien pour faire défiler la page : charger et
      // évaluer la page visée (et injecter sa feuille de style) tomberait en plein geste. Le clic suit de toute façon.
      if (e instanceof PointerEvent && e.pointerType !== 'mouse') return;
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(a instanceof HTMLAnchorElement) || a.origin !== window.location.origin || a.target === '_blank') return;
      if (a.pathname.startsWith('/api/') || /\.\w+$/.test(a.pathname)) return;
      void preloadRoute(a.pathname);
    };
    const opts = { capture: true, passive: true };
    document.addEventListener('pointerover', onIntent, opts);
    document.addEventListener('focusin', onIntent, opts);
    return () => {
      document.removeEventListener('pointerover', onIntent, opts);
      document.removeEventListener('focusin', onIntent, opts);
    };
  }, []);
}

export function App() {
  const loc = useLocation();
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
            <Route path="/" element={<Home />} />
            <Route path="/jouer" element={<Play />} />
            <Route path="/partie/:id" element={<GamePage />} />
            <Route path="/cartes" element={<Rules />} />
            <Route path="/regles" element={<Rules />} />
            <Route path="/boutique" element={<Shop />} />
            <Route path="/boutique/demo/:id" element={<DemoCheckout />} />
            <Route path="/connexion" element={<Auth mode="login" />} />
            <Route path="/inscription" element={<Auth mode="register" />} />
            <Route path="/mot-de-passe-oublie" element={<Auth mode="forgot" />} />
            <Route path="/reinitialiser/:token" element={<Auth mode="reset" />} />
            <Route path="/verifier/:token" element={<Auth mode="verify" />} />
            <Route path="/compte" element={<Account />} />
            <Route path="/joueur/:username" element={<Profile />} />
            <Route path="/classement" element={<Leaderboard />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/apprendre" element={<Learn />} />
            <Route path="/apprendre/:lesson" element={<Learn />} />
            <Route path="/problemes" element={<Puzzles />} />
            <Route path="/problemes/:puzzle" element={<Puzzles />} />
            <Route path="/analyse" element={<Analysis />} />
            <Route path="/analyse/:gameId" element={<Analysis />} />
            <Route path="/parties" element={<MyGames />} />
            <Route path="/direct" element={<Live />} />
            <Route path="/cgu" element={<Legal page="cgu" />} />
            <Route path="/cgv" element={<Legal page="cgv" />} />
            <Route path="/confidentialite" element={<Legal page="privacy" />} />
            <Route path="/mentions-legales" element={<Legal page="mentions" />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      {!inGame && <Footer />}
    </>
  );
}
