// Configuration lue dans les variables d'environnement (voir .env.example).
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const port = Number(env.PORT ?? 3000);

function list(v: string | undefined): string[] {
  return (v ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

const stripeKey = env.STRIPE_SECRET_KEY ?? '';
const paymentsMode = (env.PAYMENTS_MODE ?? (stripeKey ? 'stripe' : isProd ? 'off' : 'demo')) as 'stripe' | 'demo' | 'off';

export const config = {
  isProd,
  port,
  appName: env.APP_NAME ?? 'Spellmate',
  publicUrl: (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
  databaseUrl: env.DATABASE_URL ?? 'postgres://spellmate:spellmate@localhost:5432/spellmate',
  secret: env.SECRET_KEY ?? (isProd ? '' : 'dev-secret-a-changer'),
  trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === 'true' : isProd,
  payments: paymentsMode,
  stripe: {
    secretKey: stripeKey,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
    automaticTax: env.STRIPE_AUTOMATIC_TAX === 'true',
    invoices: env.STRIPE_INVOICES === 'true',
  },
  smtp: {
    host: env.SMTP_HOST ?? '',
    port: Number(env.SMTP_PORT ?? 587),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER ?? '',
    pass: env.SMTP_PASS ?? '',
    from: env.MAIL_FROM ?? 'Spellmate <no-reply@localhost>',
  },
  adminEmails: list(env.ADMIN_EMAILS),
  legal: {
    company: env.LEGAL_COMPANY ?? '[Raison sociale]',
    address: env.LEGAL_ADDRESS ?? '[Adresse du siège]',
    siren: env.LEGAL_SIREN ?? '[SIREN]',
    vat: env.LEGAL_VAT ?? '[N° de TVA intracommunautaire]',
    director: env.LEGAL_DIRECTOR ?? '[Directeur de la publication]',
    contact: env.LEGAL_CONTACT ?? 'contact@example.com',
    host: env.LEGAL_HOST ?? '[Hébergeur : nom, adresse, téléphone]',
  },
};

if (isProd && config.secret.length < 32) {
  console.error('SECRET_KEY manquante ou trop courte (32 caractères minimum) : arrêt.');
  process.exit(1);
}
if (config.payments === 'stripe' && !config.stripe.secretKey) {
  console.error('PAYMENTS_MODE=stripe mais STRIPE_SECRET_KEY est vide : arrêt.');
  process.exit(1);
}
if (isProd && config.payments === 'demo') {
  console.warn('Attention : paiements en mode démo en production, les achats sont gratuits.');
}
