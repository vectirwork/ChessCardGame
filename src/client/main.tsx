import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/800.css';
import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/300-italic.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource-variable/inter';
// Feuilles communes à toutes les pages. Les autres arrivent avec le code de leur page (décision D6) : odyssee.css
// (accueil), shell.css (coque de partie : accueil et /partie), game.css (Jouer et /partie, via pages/GameRoute.tsx),
// pages.css (PageScene et features/ui), features.css, Rules.css, draft.css. Leur ordre d'arrivée dépend alors des
// pages visitées, et Vite place une feuille partagée par plusieurs pages (game.css, pages.css) après la feuille propre
// de la page. Règle : une règle ne doit pas compter sur l'ordre des feuilles pour l'emporter sur une règle de même
// spécificité d'une autre feuille (vérifié : aucun cas aujourd'hui ; game.css / shell.css : les deux cas de même
// spécificité sont tranchés par des règles plus spécifiques de game.css).
import './styles/global.css';
import './styles/cards.css';
import './styles/board.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App, preloadRoute } from './App';
import { AppProvider } from './store';

// Après une mise en ligne, un onglet resté ouvert peut demander le code d'une page qui n'existe plus : on recharge
// (nouvelle version), au plus une fois par minute pour ne jamais boucler.
window.addEventListener('vite:preloadError', e => {
  try {
    if (Date.now() - Number(sessionStorage.getItem('spellmate:reload') ?? 0) < 60_000) return;
    sessionStorage.setItem('spellmate:reload', String(Date.now()));
  } catch {
    return; // stockage indisponible : pas de rechargement automatique (aucun risque de boucle)
  }
  e.preventDefault();
  window.location.reload();
});

const root = createRoot(document.getElementById('root')!);
const render = () =>
  root.render(
    <StrictMode>
      <BrowserRouter>
        <AppProvider>
          <App />
        </AppProvider>
      </BrowserRouter>
    </StrictMode>,
  );

// Le code de la page demandée est préchargé dès le HTML par le serveur (src/server/site.ts). L'accueil, qui était
// dans le paquet principal et s'affichait d'un coup, attend son code avant le premier rendu (pas d'écran d'attente
// intermédiaire). Les autres pages s'affichent comme avant : en-tête et attente tout de suite (la session, /api/me,
// part sans attendre), puis la page dès que son code est là.
const firstPage = preloadRoute(window.location.pathname);
if (window.location.pathname === '/') void firstPage.then(render);
else render();
