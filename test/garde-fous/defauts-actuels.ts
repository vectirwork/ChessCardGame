// Valeurs par défaut actuelles de tous les réglages, groupées par fichier, sous une forme comparable à
// test/garde-fous/defauts.json (expressions régulières écrites en texte). Utilisé par defauts.test.ts.
import { BOT_LEVELS, BOT_PROFILES, DEFAULT_BOT_LEVEL } from '../../src/shared/bot';
import { CARD_IDS, CARDS } from '../../src/shared/cards';
import { BRAND } from '../../src/shared/config/brand';
import { FEATURES } from '../../src/shared/config/features';
import { HOME } from '../../src/shared/config/home';
import { GUEST_NAME, PASSWORD, USERNAME } from '../../src/shared/config/limits';
import { BOUNDS, DEAL, GAME_RULES, RULES_BY_CONTEXT, SUSPENDED_CARDS } from '../../src/shared/config/rules';
import { BOT_CARD_PAUSE_MS, BOT_TIMEOUT_MS, CINEMATIC_MS } from '../../src/shared/config/timings';
import { DEFAULT_QUICK, INVITE_CONTROLS, QUICK_CONTROLS, TIME_CONTROLS } from '../../src/shared/protocol';
import { ACCOUNT, BOT_RUNTIME, LIMITS, MATCHMAKING, RATING, RELAY, TIMINGS } from '../../src/server/settings';

const re = (r: RegExp) => `/${r.source}/${r.flags}`;
const texte = (o: object) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v instanceof RegExp ? re(v) : v]));

/** Équilibrage de chaque carte tel que CARDS le décrit (coups, rangées, vitesse des pendules). */
function equilibrage() {
  const out: Record<string, { coups?: number; ranks?: readonly number[]; clockRate?: number }> = {};
  for (const id of CARD_IDS) {
    const { coups, ranks, clockRate } = CARDS[id];
    if (coups !== undefined || ranks !== undefined || clockRate !== undefined) out[id] = { coups, ranks, clockRate };
  }
  return out;
}

export interface Groupe {
  /** Où se règlent ces valeurs. */
  fichier: string;
  valeurs: Record<string, unknown>;
}

/** Groupes de réglages, chacun avec le fichier où il se règle. */
export function defautsActuels(): Record<string, Groupe> {
  const groupes: Record<string, Groupe> = {
    regles: { fichier: 'src/shared/config/rules.ts', valeurs: { GAME_RULES, RULES_BY_CONTEXT, BOUNDS } },
    miseEnPlace: { fichier: 'src/shared/config/rules.ts', valeurs: { DEAL, SUSPENDED_CARDS } },
    equilibrage: { fichier: 'src/shared/cards.ts (coups, ranks, clockRate)', valeurs: { CARDS: equilibrage() } },
    cadences: {
      fichier: 'src/shared/protocol.ts',
      valeurs: { TIME_CONTROLS, QUICK_CONTROLS, INVITE_CONTROLS, DEFAULT_QUICK },
    },
    ia: { fichier: 'src/shared/bot.ts', valeurs: { BOT_LEVELS, DEFAULT_BOT_LEVEL, BOT_PROFILES } },
    accueil: { fichier: 'src/shared/config/home.ts', valeurs: { HOME } },
    interrupteurs: { fichier: 'src/shared/config/features.ts', valeurs: { FEATURES } },
    marque: { fichier: 'src/shared/config/brand.ts', valeurs: { BRAND } },
    pseudos: {
      fichier: 'src/shared/config/limits.ts',
      valeurs: { GUEST_NAME: texte(GUEST_NAME), USERNAME: texte(USERNAME), PASSWORD: texte(PASSWORD) },
    },
    durees: { fichier: 'src/shared/config/timings.ts', valeurs: { CINEMATIC_MS, BOT_CARD_PAUSE_MS, BOT_TIMEOUT_MS } },
    serveur: {
      fichier: 'src/server/settings.ts',
      valeurs: { TIMINGS, RATING, MATCHMAKING, RELAY, BOT_RUNTIME, LIMITS, ACCOUNT },
    },
  };
  // Forme JSON (champs undefined retirés), comme le fichier de référence.
  return JSON.parse(JSON.stringify(groupes)) as Record<string, Groupe>;
}
