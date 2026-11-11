// Garde de version du protocole : tout ce qu'un onglet resté ouvert doit partager avec le serveur (cartes,
// catalogues, cadences, niveaux de l'IA, règles par défaut, durée du choix) est photographié dans
// test/fixtures/protocole.json avec PROTOCOL_VERSION. Si l'un change, ce test échoue : montez PROTOCOL_VERSION
// (src/shared/protocol.ts), puis mettez la photographie à jour. Le client d'une autre version recevra
// `server:outdated` et rechargera la page.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOT_LEVELS } from '../../src/shared/bot';
import { CARD_IDS, CATALOGS, CATALOG_IDS } from '../../src/shared/cards';
import { DEAL, GAME_RULES } from '../../src/shared/config/rules';
import { PROTOCOL_VERSION, QUICK_CONTROLS, TIME_CONTROLS } from '../../src/shared/protocol';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/protocole.json', import.meta.url), 'utf8')) as Record<string, unknown>;

const actuel = {
  version: PROTOCOL_VERSION,
  cards: CARD_IDS,
  catalogs: CATALOG_IDS,
  offeredCatalogs: CATALOGS.map(c => c.id),
  timeControls: TIME_CONTROLS.map(t => t.id),
  quickControls: QUICK_CONTROLS,
  botLevels: BOT_LEVELS,
  gameRules: GAME_RULES,
  draftMs: DEAL.draftMs,
};

describe('garde de protocole', () => {
  it('PROTOCOL_VERSION suit les contrats partagés avec le client', () => {
    const { version, ...contenu } = actuel;
    const { version: versionFigee, ...contenuFige } = fixture;
    const change = JSON.stringify(contenu) !== JSON.stringify(contenuFige);
    if (change && version === versionFigee) {
      throw new Error(
        'Cartes, catalogues, cadences, niveaux, règles par défaut ou durée du choix ont changé : montez PROTOCOL_VERSION ' +
          '(src/shared/protocol.ts), puis mettez à jour test/fixtures/protocole.json.',
      );
    }
    expect(JSON.parse(JSON.stringify(actuel)), 'photographie à mettre à jour : test/fixtures/protocole.json').toEqual(fixture);
  });
});
