// Point d'entrée : serveur HTTP (API + site) et Socket.IO sur le même port.
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { ClientToServer, MeResponse, ServerToClient } from '../shared/protocol';
import { accountRouter, communityRouter } from './account';
import { adminRouter } from './admin';
import { authRouter, identify, sameOrigin, toMe } from './auth';
import { botPool } from './bot-pool';
import { config } from './config';
import { migrate, pool } from './db';
import { attachSockets, flushRooms, gamesRouter, restoreRooms } from './games';
import { shopRouter, stripeWebhook } from './shop';

async function main() {
  await migrate();
  if (process.argv.includes('--migrate-only')) {
    await pool.end();
    return;
  }

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

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

  app.use('/api', express.json({ limit: '100kb' }), sameOrigin, identify);
  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });
  app.get('/api/me', (req, res) => {
    const body: MeResponse = {
      user: req.identity.user ? toMe(req.identity.user) : null,
      guestId: req.identity.guestId,
      payments: config.payments,
      appName: config.appName,
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
    app.use(
      express.static(clientDist, {
        index: false,
        setHeaders(res, file) {
          if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get(/^(?!\/api\/|\/socket\.io\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
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
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });
  attachSockets(io);
  botPool.start();
  await restoreRooms();

  server.listen(config.port, () => {
    console.log(`${config.appName} prêt sur ${config.publicUrl} (port ${config.port}, paiements : ${config.payments})`);
  });

  const shutdown = async () => {
    console.log('Arrêt en cours…');
    setTimeout(() => process.exit(0), 5000).unref();
    await flushRooms();
    io.close();
    server.close();
    await pool.end().catch(() => undefined);
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
