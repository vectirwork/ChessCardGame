import { Suspense, lazy, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Footer, Header, PageLoader } from './components/Layout';
import { Home } from './pages/Home';

const Play = lazy(() => import('./pages/Play'));
const GamePage = lazy(() => import('./game/GamePage'));
const Rules = lazy(() => import('./pages/Rules'));
const Shop = lazy(() => import('./pages/Shop'));
const DemoCheckout = lazy(() => import('./pages/DemoCheckout'));
const Auth = lazy(() => import('./pages/Auth'));
const Account = lazy(() => import('./pages/Account'));
const Profile = lazy(() => import('./pages/Profile'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const Admin = lazy(() => import('./pages/Admin'));
const Legal = lazy(() => import('./pages/Legal'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Learn = lazy(() => import('./pages/Learn'));
const Puzzles = lazy(() => import('./pages/Puzzles'));
const Analysis = lazy(() => import('./pages/Analysis'));
const MyGames = lazy(() => import('./pages/MyGames'));
const Live = lazy(() => import('./pages/Live'));

export function App() {
  const loc = useLocation();
  const inGame = loc.pathname.startsWith('/partie/');
  useEffect(() => {
    if (!loc.hash) window.scrollTo(0, 0);
  }, [loc.pathname, loc.hash]);
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
