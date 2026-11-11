// Garde des valeurs par défaut : toutes les valeurs des réglages (règles, mise en place, équilibrage des cartes,
// cadences, IA, accueil, interrupteurs, marque, pseudos, durées, serveur) sont photographiées dans
// test/garde-fous/defauts.json. C'est le SEUL test qui épingle ces valeurs : les autres tests vérifient les mécanismes
// avec des règles figées (RULES_V1) et continuent de passer quand un réglage change.
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
