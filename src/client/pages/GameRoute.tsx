// Route /partie/:id : la partie en ligne avec sa feuille de style (game.css, partagée avec la page Jouer), chargées
// ensemble à la demande plutôt que dans le paquet principal de toutes les pages (décision D6).
import '../styles/game.css';

export { default } from '../game/GamePage';
