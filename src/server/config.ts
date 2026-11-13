// Configuration lue dans les variables d'environnement (voir .env.example), validée au démarrage par un schéma zod :
// une valeur illisible (PORT=abc, PAYMENTS_MODE=live, PUBLIC_URL sans http…) arrête le serveur avec un message en
// français, au lieu de casser plus tard une page ou un paiement. En production, une valeur encore à l'état de modèle
// (mentions légales entre crochets, contact @example.com) ou un webhook Stripe absent est signalé au démarrage
// (configWarnings, affichés par index.ts) sans arrêter le serveur (décision Q1, pour les mentions légales). Les règles
// des nouvelles parties sont vérifiées au démarrage (rulesReport, appelé par index.ts) : impossibles, le serveur
// s'arrête, comme pour une configuration invalide. Le fichier .env est chargé par settings.ts (importé ci-dessous).
//
// SPELLMATE_TEST_RULES (tests de bout en bout, serveur jetable ; refusée en production) : objet JSON de réglages des
// nouvelles parties. Les règles (cardsPerPlayer, cardsPerTurn, cardEndsTurn…) passent à setRulesOverride ; la mise en
// place (draft, draftMs, limitsInDraft) à setDealOverride. Exemples : {"cardsPerPlayer":5}, {"cardsPerTurn":2},
// {"draft":false} (tirage partout).
import { z } from 'zod';
import { BRAND } from '../shared/config/brand';
import { RULES_CONTEXTS } from '../shared/config/rules';
import type { DealSettings, GameRulesSettings } from '../shared/config/rules';
import { PAYMENTS_MODES } from '../shared/protocol';
import type { PaymentsMode } from '../shared/protocol';
import { SETTING_KEYS, checkRules, rulesFor, rulesSummary, sameRules, setRulesOverride } from '../shared/rules';
import { DATABASE, dealSettings, setDealOverride } from './settings';

/** Réglages de la mise en place que SPELLMATE_TEST_RULES peut changer (le reste de DEAL reste celui du code). */
export const TEST_DEAL_KEYS = ['draft', 'draftMs', 'limitsInDraft'] as const;
export type TestDeal = Partial<Pick<DealSettings, (typeof TEST_DEAL_KEYS)[number]>>;

/** Champs des mentions légales (LEGAL_*), avec leur modèle par défaut (à remplacer en production). */
const LEGAL_DEFAULTS = {
  company: ['LEGAL_COMPANY', '[Raison sociale]'],
  address: ['LEGAL_ADDRESS', '[Adresse du siège]'],
  siren: ['LEGAL_SIREN', '[SIREN]'],
  vat: ['LEGAL_VAT', '[N° de TVA intracommunautaire]'],
  director: ['LEGAL_DIRECTOR', '[Directeur de la publication]'],
  contact: ['LEGAL_CONTACT', 'contact@example.com'],
  host: ['LEGAL_HOST', '[Hébergeur : nom, adresse, téléphone]'],
} as const;
type LegalKey = keyof typeof LEGAL_DEFAULTS;

/** Une valeur des mentions légales encore à l'état de modèle : entre crochets, ou adresse @example.com. */
export const isLegalTemplate = (v: string) => v.trim().startsWith('[') || /@example\.(com|org|net)\s*$/i.test(v);

const optional = (s: string | undefined) => (s === undefined || s.trim() === '' ? undefined : s.trim());

/** Entier lu dans une variable, borné ; message en français. */
const entier = (name: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${name} : un nombre entier est attendu`)
    .transform(Number)
    .refine(n => n >= min && n <= max, `${name} : de ${min} à ${max}`);

/** Schéma des variables lues (toutes facultatives : chacune a un défaut, sauf SECRET_KEY en production). */
const envSchema = z.object({
  PORT: entier('PORT', 1, 65535).optional(),
  PUBLIC_URL: z
    .string()
    .trim()
    .refine(u => {
      try {
        const p = new URL(u).protocol;
        return p === 'http:' || p === 'https:';
      } catch {
        return false;
      }
    }, 'PUBLIC_URL : une adresse complète est attendue (https://exemple.fr)')
    .optional(),
  PAYMENTS_MODE: z
    .enum(PAYMENTS_MODES, { error: `PAYMENTS_MODE : ${PAYMENTS_MODES.slice(0, -1).join(', ')} ou ${PAYMENTS_MODES.at(-1)} est attendu` })
    .optional(),
  TRUST_PROXY: z
    .string()
    .trim()
    .regex(/^(true|false|\d+)$/i, 'TRUST_PROXY : true, false ou un nombre de mandataires (1 derrière Caddy) est attendu')
    .transform(v => (/^true$/i.test(v) ? 1 : /^false$/i.test(v) ? 0 : Number(v)))
    .optional(),
  SMTP_PORT: entier('SMTP_PORT', 1, 65535).optional(),
  DATABASE_POOL_MAX: entier('DATABASE_POOL_MAX', 1, 1000).optional(),
  SPELLMATE_TEST_RULES: z.string().optional(),
});

export interface Config {
  isProd: boolean;
  port: number;
  appName: string;
  publicUrl: string;
  /** Vide : base PGlite embarquée dans DATA_DIR (aucune installation nécessaire). */
  databaseUrl: string;
  /** Connexions PostgreSQL au plus (DATABASE_POOL_MAX). */
  databasePoolMax: number;
  /** Données locales (base PGlite) : data/ en production locale, data/dev/ en développement. */
  dataDir: string;
  secret: string;
  /** Mandataires (reverse proxies) de confiance devant le serveur : 0 aucun, 1 derrière Caddy (défaut en production). */
  trustProxy: number;
  payments: PaymentsMode;
  stripe: { secretKey: string; webhookSecret: string; automaticTax: boolean; invoices: boolean };
  smtp: { host: string; port: number; secure: boolean; user: string; pass: string; from: string };
  adminEmails: string[];
  legal: Record<LegalKey, string>;
  /** Surcharges de test (SPELLMATE_TEST_RULES), null hors tests. */
  testRules: Partial<GameRulesSettings> | null;
  testDeal: TestDeal | null;
}

export interface ParsedEnv {
  config: Config;
  /** Erreurs qui arrêtent le serveur. */
  errors: string[];
  /** Avertissements affichés au démarrage. */
  warnings: string[];
}

function list(v: string | undefined): string[] {
  return (v ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

/** Lecture de SPELLMATE_TEST_RULES : règles et mise en place séparées, ou erreurs. */
function readTestRules(raw: string | undefined, isProd: boolean, errors: string[]): Pick<Config, 'testRules' | 'testDeal'> {
  const none = { testRules: null, testDeal: null };
  if (optional(raw) === undefined) return none;
  if (isProd) {
    errors.push('SPELLMATE_TEST_RULES est réservée aux tests : refusée en production (NODE_ENV=production).');
    return none;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw!);
  } catch {
    errors.push('SPELLMATE_TEST_RULES : un objet JSON est attendu, par exemple {"cardsPerPlayer":5}.');
    return none;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push('SPELLMATE_TEST_RULES : un objet JSON est attendu, par exemple {"cardsPerPlayer":5}.');
    return none;
  }
  const rules: Record<string, unknown> = {};
  const deal: Record<string, unknown> = {};
  const known = [...SETTING_KEYS, ...TEST_DEAL_KEYS];
  for (const [k, v] of Object.entries(parsed)) {
    if ((SETTING_KEYS as readonly string[]).includes(k)) rules[k] = v;
    else if ((TEST_DEAL_KEYS as readonly string[]).includes(k)) deal[k] = v;
    else errors.push(`SPELLMATE_TEST_RULES.${k} : réglage inconnu (réglages : ${known.join(', ')}).`);
  }
  if (deal.draft !== undefined && typeof deal.draft !== 'boolean') errors.push('SPELLMATE_TEST_RULES.draft : true ou false est attendu.');
  if (deal.limitsInDraft !== undefined && typeof deal.limitsInDraft !== 'boolean') errors.push('SPELLMATE_TEST_RULES.limitsInDraft : true ou false est attendu.');
  if (deal.draftMs !== undefined && !(Number.isInteger(deal.draftMs) && (deal.draftMs as number) >= 1000)) {
    errors.push('SPELLMATE_TEST_RULES.draftMs : une durée d’au moins 1000 ms est attendue.');
  }
  return {
    testRules: Object.keys(rules).length ? (rules as Partial<GameRulesSettings>) : null,
    testDeal: Object.keys(deal).length ? (deal as TestDeal) : null,
  };
}

/**
 * Configuration d'un environnement : valeurs typées, erreurs (arrêt) et avertissements. Pure (n'arrête rien, ne lit
 * pas .env) : exportée pour les tests (test/server-config.test.ts).
 */
export function parseEnv(env: Record<string, string | undefined>): ParsedEnv {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProd = env.NODE_ENV === 'production';
  // Une variable vide compte comme absente (VAR= dans un fichier .env).
  const raw = Object.fromEntries(Object.keys(envSchema.shape).map(k => [k, optional(env[k])]));
  const r = envSchema.safeParse(raw);
  const v = r.success ? r.data : {};
  if (!r.success) for (const issue of r.error.issues) errors.push(`${issue.message}.`);

  const port = v.PORT ?? 3000;
  const stripeKey = env.STRIPE_SECRET_KEY ?? '';
  const payments: PaymentsMode = v.PAYMENTS_MODE ?? (stripeKey ? 'stripe' : isProd ? 'off' : 'demo');
  const legal = Object.fromEntries(
    (Object.keys(LEGAL_DEFAULTS) as LegalKey[]).map(k => [k, env[LEGAL_DEFAULTS[k][0]] ?? LEGAL_DEFAULTS[k][1]]),
  ) as Record<LegalKey, string>;

  const config: Config = {
    isProd,
    port,
    appName: env.APP_NAME ?? BRAND.name,
    publicUrl: (v.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
    databaseUrl: env.DATABASE_URL ?? '',
    databasePoolMax: v.DATABASE_POOL_MAX ?? DATABASE.poolMax,
    dataDir: env.DATA_DIR ?? (isProd ? 'data' : 'data/dev'),
    secret: env.SECRET_KEY ?? (isProd ? '' : 'dev-secret-a-changer'),
    trustProxy: v.TRUST_PROXY ?? (isProd ? 1 : 0),
    payments,
    stripe: {
      secretKey: stripeKey,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
      automaticTax: env.STRIPE_AUTOMATIC_TAX === 'true',
      invoices: env.STRIPE_INVOICES === 'true',
    },
    smtp: {
      host: env.SMTP_HOST ?? '',
      port: v.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE === 'true',
      user: env.SMTP_USER ?? '',
      pass: env.SMTP_PASS ?? '',
      from: env.MAIL_FROM ?? `${BRAND.name} <no-reply@localhost>`,
    },
    adminEmails: list(env.ADMIN_EMAILS),
    legal,
    ...readTestRules(v.SPELLMATE_TEST_RULES, isProd, errors),
  };

  if (isProd && config.secret.length < 32) errors.push('SECRET_KEY manquante ou trop courte (32 caractères minimum).');
  if (config.payments === 'stripe' && !config.stripe.secretKey) errors.push('PAYMENTS_MODE=stripe mais STRIPE_SECRET_KEY est vide.');
  if (isProd && config.payments === 'demo' && !config.publicUrl.startsWith('http://localhost')) {
    warnings.push('paiements en mode démo en production, les achats sont gratuits.');
  }
  if (config.payments === 'stripe' && !config.stripe.webhookSecret) {
    warnings.push('PAYMENTS_MODE=stripe sans STRIPE_WEBHOOK_SECRET : les paiements ne seront jamais confirmés ni livrés.');
  }
  if (isProd) {
    const templates = (Object.keys(LEGAL_DEFAULTS) as LegalKey[]).filter(k => isLegalTemplate(legal[k])).map(k => LEGAL_DEFAULTS[k][0]);
    if (templates.length) {
      warnings.push(`mentions légales encore à l'état de modèle (${templates.join(', ')}) : /api/legal les sert telles quelles. Renseignez-les (deploy/README.md).`);
    }
  }
  return { config, errors, warnings };
}

// .env : déjà chargé par settings.ts (importé plus haut, donc évalué avant ce module).
const parsed = parseEnv(process.env);

export const config: Config = parsed.config;

/** Avertissements de configuration, affichés au démarrage du serveur (index.ts). */
export const configWarnings: readonly string[] = parsed.warnings;

if (parsed.errors.length) {
  console.error(`Configuration invalide : arrêt.\n${parsed.errors.map(e => `- ${e}`).join('\n')}`);
  process.exit(1);
}

// Surcharges de test (serveur jetable des tests de bout en bout) : règles et mise en place des nouvelles parties.
if (config.testRules) setRulesOverride(config.testRules);
if (config.testDeal) setDealOverride(config.testDeal);

// ---------------------------------------------------------------------------------------------
// Règles des nouvelles parties sur ce serveur (journal et vérification du démarrage)

/**
 * Règles des nouvelles parties sur ce serveur, vérifiées au démarrage (index.ts) : `lines`, le journal (une ligne pour
 * les règles communes, plus une par contexte qui diffère, chacune avec la mise en place de CE serveur : dealSettings,
 * surcharge de test comprise) ; `errors`, les erreurs de checkRules avec cette mise en place et la surcharge de test.
 * Des erreurs arrêtent le serveur (designDoc §2.5) : une règle impossible ne doit jamais passer (le build la refuse
 * aussi, greffon de vite.config.ts). Vide au défaut. Exportée pour les tests.
 */
export function rulesReport(): { lines: string[]; errors: string[] } {
  const deal = dealSettings();
  const base = rulesFor('classee');
  const test = config.testRules || config.testDeal ? ` (surcharge de test : ${JSON.stringify({ ...config.testRules, ...config.testDeal })})` : '';
  const lines = [`Règles des nouvelles parties : ${rulesSummary(base, deal)}${test}.`];
  for (const ctx of RULES_CONTEXTS) {
    const r = rulesFor(ctx);
    if (!sameRules(r, base)) lines.push(`Règles des nouvelles parties (${ctx}) : ${rulesSummary(r, deal)}.`);
  }
  return { lines, errors: checkRules({ deal }) };
}
