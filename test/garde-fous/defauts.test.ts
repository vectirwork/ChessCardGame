// Garde des valeurs par défaut : toutes les valeurs des réglages (règles, mise en place, équilibrage des cartes,
// cadences, IA, accueil, interrupteurs, marque, pseudos, durées, serveur) sont photographiées dans
// test/garde-fous/defauts.json. C'est le seul test qui épingle toutes ces valeurs. Depuis le lot 9e, les autres tests
// fixent leurs règles et leur mise en place (RULES_V1, REGLAGES_V1, DEAL_V1 : test/helpers/v1.ts) ou dérivent l'attendu
// du réglage du jour. Ce qui a été vérifié (`npm run essai-reglage -- --essai=tous`, docs/REGLAGES.md, section 2.1) :
// pour les 10 essais prêts à l'emploi (5, 1 et 6 cartes, 2 cartes par tour, carte à la place du coup, Présage en 4
// demi-coups, choix en 30 s, tirage partout, rangées du Mur, Faille en 6 coups) et les autres changements essayés une
// fois dans cette section, seuls échouent ce garde, le garde de protocole (protocole.test.ts), les tests de
// docs/REGLAGES.md qui reprennent les valeurs par défaut (reglages-doc.test.ts) et, pour une configuration impossible,
// checkRules (config.test.ts). Un autre réglage (autre équilibrage, cadences, IA, accueil, interrupteurs, marque,
// pseudos, durées, serveur) peut encore faire échouer d'autres tests : l'outil les liste à part.
//
// Ce test échoue quand une valeur par défaut change :
// - changement voulu : reportez la nouvelle valeur dans test/garde-fous/defauts.json (le message dit quel groupe) ;
// - changement involontaire : rétablissez la valeur dans le fichier indiqué.
// Cartes, cadences, niveaux de l'IA, GAME_RULES et durée du choix sont aussi suivis par le garde de protocole
// (protocole.test.ts), qui demande alors de monter PROTOCOL_VERSION.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defautsActuels } from './defauts-actuels';

const fixture = JSON.parse(readFileSync(new URL('./defauts.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const actuels = defautsActuels();

describe('garde des valeurs par défaut', () => {
  it('chaque groupe de defauts.json existe encore', () => {
    expect(Object.keys(fixture).filter(k => k !== '//').sort()).toEqual(Object.keys(actuels).sort());
  });
  for (const [groupe, { fichier, valeurs }] of Object.entries(actuels)) {
    it(`${groupe} (${fichier})`, () => {
      expect(
        valeurs,
        `Valeur par défaut changée dans ${fichier} (groupe « ${groupe} »). Changement voulu ? Reportez-le dans ` +
          'test/garde-fous/defauts.json. Sinon, rétablissez la valeur.',
      ).toEqual(fixture[groupe]);
    });
  }
});
