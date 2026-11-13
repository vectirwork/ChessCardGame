// Configuration du serveur (src/server/config.ts, parseEnv) et robustesse de ses dépendances :
// - une configuration invalide est refusée (arrêt, message en français) ; une configuration suspecte en production
//   est signalée (mentions légales encore en modèle, webhook Stripe absent) ;
// - SPELLMATE_TEST_RULES : refusée en production, séparée en règles et mise en place, noms inconnus refusés ;
// - TRUST_PROXY en nombre de mandataires ;
// - le pool PostgreSQL survit à la perte d'une connexion inactive (écouteur 'error') ;
// - verifyPassword lit le coût N du hachage stocké (un N relevé n'invalide aucun mot de passe).
import { describe, expect, it, vi } from 'vitest';
import { BRAND } from '../src/shared/config/brand';
import { DEAL } from '../src/shared/config/rules';
import { isLegalTemplate, parseEnv } from '../src/server/config';
import { postgresDriver } from '../src/server/db';
import { hashPassword, needsRehash, verifyPassword } from '../src/server/security';
import { DATABASE, dealSettings, setDealOverride } from '../src/server/settings';

const PROD = { NODE_ENV: 'production', SECRET_KEY: 'x'.repeat(64), PUBLIC_URL: 'https://chess-powers.com' };
const LEGAL_OK = {
  LEGAL_COMPANY: 'Spellmate SAS', LEGAL_ADDRESS: '1 rue de la Paix, 75002 Paris', LEGAL_SIREN: '123 456 789',
  LEGAL_VAT: 'FR12123456789', LEGAL_DIRECTOR: 'Prénom Nom', LEGAL_CONTACT: 'contact@chess-powers.com', LEGAL_HOST: 'Hetzner',
};

describe('configuration : valeurs par défaut identiques à avant', () => {
  it('développement sans variable', () => {
    const { config, errors, warnings } = parseEnv({});
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(config).toMatchObject({
      isProd: false, port: 3000, appName: BRAND.name, publicUrl: 'http://localhost:3000', databaseUrl: '', databasePoolMax: DATABASE.poolMax,
      dataDir: 'data/dev', secret: 'dev-secret-a-changer', trustProxy: 0, payments: 'demo', testRules: null, testDeal: null,
    });
    expect(config.appName).toBe('Spellmate');
    expect(config.smtp).toEqual({ host: '', port: 587, secure: false, user: '', pass: '', from: 'Spellmate <no-reply@localhost>' });
    expect(config.legal).toEqual({
      company: '[Raison sociale]', address: '[Adresse du siège]', siren: '[SIREN]', vat: '[N° de TVA intracommunautaire]',
      director: '[Directeur de la publication]', contact: 'contact@example.com', host: '[Hébergeur : nom, adresse, téléphone]',
    });
  });

  it('production : un mandataire de confiance, boutique fermée sans clé Stripe, base data/', () => {
    const { config, errors } = parseEnv({ ...PROD, ...LEGAL_OK });
    expect(errors).toEqual([]);
    expect(config).toMatchObject({ isProd: true, trustProxy: 1, payments: 'off', dataDir: 'data', publicUrl: 'https://chess-powers.com' });
    expect(parseEnv({ STRIPE_SECRET_KEY: 'sk_test' }).config.payments).toBe('stripe');
    expect(parseEnv({ PUBLIC_URL: 'https://exemple.fr/' }).config.publicUrl).toBe('https://exemple.fr');
  });
});

describe('configuration invalide refusée', () => {
  const refus = (env: Record<string, string>) => parseEnv(env).errors;

  it('nombres, adresse, mode de paiement', () => {
    expect(refus({ PORT: 'abc' })).toEqual(['PORT : un nombre entier est attendu.']);
    expect(refus({ PORT: '70000' })).toEqual(['PORT : de 1 à 65535.']);
    expect(refus({ SMTP_PORT: '5 87' })).toEqual(['SMTP_PORT : un nombre entier est attendu.']);
    expect(refus({ PUBLIC_URL: 'chess-powers.com' })).toEqual(['PUBLIC_URL : une adresse complète est attendue (https://exemple.fr).']);
    expect(refus({ PUBLIC_URL: 'ftp://chess-powers.com' })).toHaveLength(1);
    expect(refus({ PAYMENTS_MODE: 'live' })).toEqual(['PAYMENTS_MODE : stripe, demo ou off est attendu.']);
    expect(refus({ DATABASE_POOL_MAX: '0' })).toEqual(['DATABASE_POOL_MAX : de 1 à 1000.']);
  });

  it('secrets : clé trop courte en production, Stripe sans clé', () => {
    expect(refus({ ...PROD, SECRET_KEY: 'court' })).toEqual(['SECRET_KEY manquante ou trop courte (32 caractères minimum).']);
    expect(refus({ PAYMENTS_MODE: 'stripe' })).toEqual(['PAYMENTS_MODE=stripe mais STRIPE_SECRET_KEY est vide.']);
  });

  it('une variable vide compte comme absente', () => {
    const { config, errors } = parseEnv({ PORT: '', PAYMENTS_MODE: '', TRUST_PROXY: ' ' });
    expect(errors).toEqual([]);
    expect([config.port, config.payments, config.trustProxy]).toEqual([3000, 'demo', 0]);
  });
});

describe('TRUST_PROXY : nombre de mandataires', () => {
  it('true = 1 (comme avant), false = 0, un nombre = autant de sauts ; autre chose refusé', () => {
    expect(parseEnv({ TRUST_PROXY: 'true' }).config.trustProxy).toBe(1);
    expect(parseEnv({ TRUST_PROXY: 'false' }).config.trustProxy).toBe(0);
    expect(parseEnv({ ...PROD, TRUST_PROXY: 'false' }).config.trustProxy).toBe(0);
    expect(parseEnv({ TRUST_PROXY: '2' }).config.trustProxy).toBe(2);
    expect(parseEnv({ TRUST_PROXY: 'oui' }).errors).toHaveLength(1);
  });
});

describe('avertissements de production', () => {
  it('mentions légales encore en modèle : signalées, sans arrêt', () => {
    const { errors, warnings } = parseEnv({ ...PROD, LEGAL_HOST: 'Hetzner' });
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/LEGAL_COMPANY, LEGAL_ADDRESS, LEGAL_SIREN, LEGAL_VAT, LEGAL_DIRECTOR, LEGAL_CONTACT\)/);
    expect(warnings[0]).not.toMatch(/LEGAL_HOST/);
    expect(parseEnv({ ...PROD, ...LEGAL_OK }).warnings).toEqual([]);
    // Hors production : rien (les modèles servent au développement).
    expect(parseEnv({}).warnings).toEqual([]);
    expect(isLegalTemplate('[SIREN]')).toBe(true);
    expect(isLegalTemplate('contact@example.com')).toBe(true);
    expect(isLegalTemplate('contact@chess-powers.com')).toBe(false);
  });

  it('Stripe sans secret de webhook : signalé', () => {
    const { warnings } = parseEnv({ PAYMENTS_MODE: 'stripe', STRIPE_SECRET_KEY: 'sk_test' });
    expect(warnings).toEqual(['PAYMENTS_MODE=stripe sans STRIPE_WEBHOOK_SECRET : les paiements ne seront jamais confirmés ni livrés.']);
    expect(parseEnv({ PAYMENTS_MODE: 'stripe', STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: 'whsec' }).warnings).toEqual([]);
  });
});

describe('SPELLMATE_TEST_RULES (serveur jetable)', () => {
  it('refusée en production', () => {
    expect(parseEnv({ ...PROD, ...LEGAL_OK, SPELLMATE_TEST_RULES: '{"cardsPerPlayer":5}' }).errors).toEqual([
      'SPELLMATE_TEST_RULES est réservée aux tests : refusée en production (NODE_ENV=production).',
    ]);
  });

  it('règles et mise en place séparées ; JSON illisible ou nom inconnu refusés', () => {
    const r = parseEnv({ SPELLMATE_TEST_RULES: '{"cardsPerPlayer":5,"cardsPerTurn":2,"draft":false,"draftMs":5000}' });
    expect(r.errors).toEqual([]);
    expect(r.config.testRules).toEqual({ cardsPerPlayer: 5, cardsPerTurn: 2 });
    expect(r.config.testDeal).toEqual({ draft: false, draftMs: 5000 });
    expect(parseEnv({ SPELLMATE_TEST_RULES: '{"draft":false}' }).config.testRules).toBeNull();
    expect(parseEnv({ SPELLMATE_TEST_RULES: '{cardsPerPlayer:5}' }).errors).toEqual(['SPELLMATE_TEST_RULES : un objet JSON est attendu, par exemple {"cardsPerPlayer":5}.']);
    expect(parseEnv({ SPELLMATE_TEST_RULES: '[5]' }).errors).toHaveLength(1);
    expect(parseEnv({ SPELLMATE_TEST_RULES: '{"cardPerPlayer":5}' }).errors[0]).toMatch(/^SPELLMATE_TEST_RULES\.cardPerPlayer : réglage inconnu/);
    expect(parseEnv({ SPELLMATE_TEST_RULES: '{"draft":"non"}' }).errors).toEqual(['SPELLMATE_TEST_RULES.draft : true ou false est attendu.']);
    expect(parseEnv({ SPELLMATE_TEST_RULES: '{"draftMs":10}' }).errors).toHaveLength(1);
  });

  it('setDealOverride : mise en place du serveur, refusée en production', () => {
    expect(dealSettings()).toBe(DEAL);
    setDealOverride({ draft: false });
    expect(dealSettings()).toMatchObject({ ...DEAL, draft: false });
    expect(Object.isFrozen(dealSettings())).toBe(true);
    setDealOverride(null);
    expect(dealSettings()).toBe(DEAL);
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(() => setDealOverride({ draft: false })).toThrow(/refusée en production/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('PostgreSQL : perte d’une connexion inactive', () => {
  it('le pool écoute « error » (sans écouteur, Node arrêterait le serveur) et borne l’ouverture d’une connexion', async () => {
    const d = postgresDriver('postgres://personne@127.0.0.1:1/aucune', 3);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(d.pool.listenerCount('error')).toBeGreaterThan(0);
      expect(() => d.pool.emit('error', new Error('terminating connection due to administrator command'))).not.toThrow();
      expect(log).toHaveBeenCalledTimes(1);
      expect(d.pool.options.max).toBe(3);
      expect(d.pool.options.connectionTimeoutMillis).toBe(DATABASE.connectionTimeoutMs);
    } finally {
      log.mockRestore();
      await d.end();
    }
  });
});

describe('mots de passe : coût du hachage', () => {
  it('verifyPassword lit N dans le hachage : un mot de passe haché avec un autre coût reste valide', async () => {
    const h = await hashPassword('motdepasse123');
    expect(h.split('$')[1]).toBe('32768');
    expect(await verifyPassword('motdepasse123', h)).toBe(true);
    expect(await verifyPassword('autre', h)).toBe(false);
    expect(needsRehash(h)).toBe(false);
    // Hachage à N = 16384 (coût plus faible, par exemple d'une ancienne version) : vérifié avec son N, à refaire.
    const { scryptSync } = await import('node:crypto');
    const salt = Buffer.from('0123456789abcdef');
    const key = scryptSync('motdepasse123'.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1 });
    const old = `scrypt$16384$${salt.toString('base64')}$${key.toString('base64')}`;
    expect(await verifyPassword('motdepasse123', old)).toBe(true);
    expect(needsRehash(old)).toBe(true);
    // N illisible ou démesuré : refusé sans calcul.
    expect(await verifyPassword('motdepasse123', `scrypt$abc$${salt.toString('base64')}$${key.toString('base64')}`)).toBe(false);
    expect(await verifyPassword('motdepasse123', `scrypt$${2 ** 24}$${salt.toString('base64')}$${key.toString('base64')}`)).toBe(false);
  });
});
