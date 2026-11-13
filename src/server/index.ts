// Point d'entrée : serveur HTTP (API + site) et Socket.IO sur le même port.
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { featuresDiff } from '../shared/config/features';
import { PROTOCOL_VERSION } from '../shared/protocol';
import type { ClientToServer, MeResponse, ServerToClient } from '../shared/protocol';
import { accountRouter, communityRouter } from './account';
import { adminRouter } from './admin';
import { authRouter, identify, sameOrigin, toMe } from './auth';
import { botPool } from './bot-pool';
import { config, configWarnings, rulesReport } from './config';
import { connectDb, db, migrate } from './db';
import { attachSockets, flushRooms, gamesRouter, restoreRooms } from './games';
import { honorPackPromises, shopRouter, stripeWebhook } from './shop';
import { FEATURES, FEATURE_ERRORS, LIMITS } from './settings';
import { serveBuiltSite } from './site';

/**
 * Journal de démarrage : avertissements de configuration et d'interrupteurs (signalés, sans arrêt : décision Q1 pour
 * les mentions légales), règles des nouvelles parties (une ligne, plus une par contexte qui diffère). Des règles
 * impossibles (checkRules, avec la mise en place de ce serveur) arrêtent le serveur avec leurs messages, comme une
 * configuration invalide (config.ts) : aucune partie ne doit être créée avec elles.
 */
function startupReport() {
  for (const w of configWarnings) console.warn(`Attention : ${w}`);
  for (const e of FEATURE_ERRORS) console.warn(`Attention, interrupteurs : ${e}`);
  const off = Object.keys(featuresDiff(FEATURES));
  if (off.length) console.log(`Interrupteurs changés : ${off.map(k => `${k}=${FEATURES[k as keyof typeof FEATURES]}`).join(', ')}.`);
  const { lines, errors } = rulesReport();
  for (const l of lines) console.log(l);
  if (errors.length) {
    console.error(`Règles impossibles : arrêt.\n${errors.map(e => `- ${e}`).join('\n')}`);
    process.exit(1);
  }
}

async function main() {
  startupReport();
  const dbLabel = await connectDb();
  await migrate();
  // Promesses des packs (« et les prochains offerts ») : livre aux acheteurs les objets ajoutés depuis leur achat.
  // Idempotent ; un échec est signalé sans empêcher le démarrage (rien n'est perdu : on réessaie au suivant).
  await honorPackPromises().catch(e => console.error('Promesses des packs :', e));
  if (process.argv.includes('--migrate-only')) {
    await db.end();
    return;
  }

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: config.isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'blob:'],
              fontSrc: ["'self'", 'data:'],
              connectSrc: ["'self'", 'ws:', 'wss:'],
              frameAncestors: ["'none'"],
              formAction: ["'self'"],
              objectSrc: ["'none'"],
              upgradeInsecureRequests: config.publicUrl.startsWith('https://') ? [] : null,
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());

  // Le webhook Stripe a besoin du corps brut : déclaré avant express.json()
  app.post('/api/stripe/webhook', ...stripeWebhook);

  // Sonde de santé (Docker, update.sh, report.sh) : avant identify, elle ne crée ni ne signe aucun cookie d'invité.
  app.get('/api/health', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ ok: true });
  });
  app.use('/api', express.json({ limit: LIMITS.jsonBody }), sameOrigin, identify);
  app.get('/api/me', (req, res) => {
    const body: MeResponse = {
      user: req.identity.user ? toMe(req.identity.user) : null,
      guestId: req.identity.guestId,
      payments: config.payments,
      appName: config.appName,
      features: FEATURES,
      version: PROTOCOL_VERSION,
    };
    res.json(body);
  });
  app.get('/api/legal', (_req, res) => res.json({ ...config.legal, appName: config.appName, url: config.publicUrl }));
  app.use('/api/auth', authRouter);
  app.use('/api/account', accountRouter);
  app.use('/api/shop', shopRouter);
  app.use('/api/games', gamesRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', communityRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Route inconnue.' }));

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const clientDist = path.join(root, 'dist/client');
  if (config.isProd || existsSync(path.join(clientDist, 'index.html')) && process.env.SERVE_BUILD === 'true') {
    // Fichiers précompressés, cache long des fichiers à empreinte, HTML de chaque page avec son code préchargé
    serveBuiltSite(app, clientDist);
  } else {
    const { createServer: createVite } = await import('vite');
    const vite = await createVite({ root, server: { middlewareMode: true, hmr: { port: config.port + 1 } }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur interne, réessayez.' });
  });

  const server = createServer(app);
  const io = new Server<ClientToServer, ServerToClient>(server, {
    serveClient: false,
    cors: { origin: false },
    pingInterval: LIMITS.pingIntervalMs,
    pingTimeout: LIMITS.pingTimeoutMs,
  });
  attachSockets(io);
  botPool.start();
  await restoreRooms();

  server.listen(config.port, () => {
    console.log(`${config.appName} prêt sur ${config.publicUrl} (port ${config.port}, base : ${dbLabel}, paiements : ${config.payments})`);
  });

  const shutdown = async () => {
    console.log('Arrêt en cours…');
    setTimeout(() => process.exit(0), 5000).unref();
    await flushRooms();
    io.close();
    server.close();
    await db.end().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Une erreur oubliée ne doit jamais arrêter toutes les parties en cours
process.on('unhandledRejection', e => console.error('Promesse rejetée non gérée :', e));

main().catch(e => {
  console.error(e);
  process.exit(1);
});
