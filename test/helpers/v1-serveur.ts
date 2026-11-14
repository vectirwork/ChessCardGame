// Mise en place V1 pour les tests du serveur (lot 9e ; voir test/helpers/v1.ts). Fichier à part : il importe
// src/server/settings, que les tests du client ne doivent pas charger.
//
// Le serveur lit sa mise en place dans dealSettings() (DEAL, ou la surcharge de test). setDealOverride superpose ce
// qu'on lui donne à DEAL : avec DEAL_V1 entier, toute la mise en place est celle d'avant la passe (choix des cartes en
// 45 s, contraintes R9, poids et essais du tirage), quel que soit le DEAL du jour.
import { setDealOverride } from '../../src/server/settings';
import { DEAL_V1 } from './v1';

/** Mise en place des nouvelles parties du serveur fixée à DEAL_V1 ; setDealOverride(null) dans afterEach. */
export function reglerMiseEnPlaceV1(): void {
  setDealOverride(DEAL_V1);
}
