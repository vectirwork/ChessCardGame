// Surcharge de test (SPELLMATE_TEST_RULES) que checkRules refuse, pour les tests qui lancent le serveur et attendent
// l'arrêt « Règles impossibles » (test/deploiement.test.ts, test/server-config.test.ts). L'attendu est calculé comme
// le serveur le calcule (parseEnv, setRulesOverride, setDealOverride, rulesReport), au lieu d'être écrit en dur : un
// réglage du jour (DEAL.handLimits par exemple, qui peut rendre 6 cartes possibles) ne fait pas échouer ces tests
// (relecture du lot 9f). Fichier à part : il importe src/server, que les tests du client ne doivent pas charger.
import { BOUNDS } from '../../src/shared/config/rules';
import { setRulesOverride } from '../../src/shared/rules';
import { parseEnv, rulesReport } from '../../src/server/config';
import { setDealOverride } from '../../src/server/settings';
import { DEAL_V1, REGLAGES_V1, configDuJourV1 } from './v1';

/** Messages de checkRules (rulesReport) pour cette surcharge, comme au démarrage du serveur. Retire les surcharges. */
export function erreursDeRegles(surcharge: Record<string, unknown>): string[] {
  const { config, errors } = parseEnv({ SPELLMATE_TEST_RULES: JSON.stringify(surcharge) });
  if (errors.length) throw new Error(`SPELLMATE_TEST_RULES refusée : ${errors.join(' ; ')}`);
  try {
    setRulesOverride(config.testRules);
    setDealOverride(config.testDeal);
    return rulesReport().errors;
  } finally {
    setRulesOverride(null);
    setDealOverride(null);
  }
}

/**
 * Surcharge impossible et messages attendus. Au défaut : 6 cartes par joueur (impossible avec au plus 2 Climats), la
 * surcharge d'avant ; hors défaut, toutes les règles et la mise en place de V1 que SPELLMATE_TEST_RULES accepte, plus
 * 6 cartes. Si la configuration du jour rend quand même 6 cartes possibles (contraintes des mains relevées), un nombre
 * de cartes hors des bornes (BOUNDS), refusé quelle que soit la mise en place.
 */
export function reglesImpossibles(): { surcharge: Record<string, unknown>; erreurs: string[] } {
  const six: Record<string, unknown> = configDuJourV1()
    ? { cardsPerPlayer: 6 }
    : { ...REGLAGES_V1, cardsPerPlayer: 6, draft: DEAL_V1.draft, draftMs: DEAL_V1.draftMs, limitsInDraft: DEAL_V1.limitsInDraft };
  const erreurs = erreursDeRegles(six);
  if (erreurs.length) return { surcharge: six, erreurs };
  const horsBornes = { ...six, cardsPerPlayer: BOUNDS.cardsPerPlayer[1] + 1 };
  return { surcharge: horsBornes, erreurs: erreursDeRegles(horsBornes) };
}

/** Bloc écrit sur la sortie d'erreur par le serveur (src/server/index.ts, startupReport) pour ces messages. */
export const arretRegles = (erreurs: string[]) => `Règles impossibles : arrêt.\n${erreurs.map(e => `- ${e}`).join('\n')}`;
