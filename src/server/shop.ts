// Boutique : paiement par Stripe Checkout (page de paiement hébergée par Stripe), webhook et mode démo.
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import Stripe from 'stripe';
import { z } from 'zod';
import { DEFAULT_ITEM, FREE_ITEMS, ITEMS, PRODUCTS, formatPrice, productById } from '../shared/catalog';
import type { ItemKind } from '../shared/catalog';
import { SLOT_COLUMN, requireUser, toMe, userById } from './auth';
import { config } from './config';
import { one, q, tx } from './db';
import { sendPurchaseConfirmation } from './mail';

const stripe = config.payments === 'stripe' ? new Stripe(config.stripe.secretKey) : null;

interface PurchaseRow {
  id: string;
  user_id: string | null;
  product_id: string;
  items: string[];
  amount_cents: number;
  status: string;
  email: string | null;
}

/** Livre les objets d'un achat payé. Idempotent : un second appel ne fait rien. */
export async function fulfillPurchase(purchaseId: string, paymentRef: string | null): Promise<boolean> {
  const p = await tx(async c => {
    const r = await c.query<PurchaseRow>(
      `UPDATE purchases SET status = 'paid', paid_at = now(), payment_ref = coalesce($2, payment_ref)
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [purchaseId, paymentRef],
    );
    const row = r.rows[0];
    if (!row || !row.user_id) return null;
    for (const item of row.items) {
      await c.query(
        `INSERT INTO user_items (user_id, item_id, source) VALUES ($1, $2, $3) ON CONFLICT (user_id, item_id) DO NOTHING`,
        [row.user_id, item, `purchase:${row.id}`],
      );
    }
    return row;
  });
  if (!p) return false;
  const product = productById(p.product_id);
  if (p.email && product) void sendPurchaseConfirmation(p.email, product.name, formatPrice(p.amount_cents));
  console.log(`Achat ${p.id} livré (${p.product_id}, ${formatPrice(p.amount_cents)}).`);
  return true;
}

const SLOTS = Object.entries(SLOT_COLUMN) as [ItemKind, (typeof SLOT_COLUMN)[ItemKind]][];
/**
 * Après un retrait d'objets : chaque emplacement équipé d'un objet ni offert ni encore possédé revient à son défaut.
 * Une seule requête, construite depuis SLOT_COLUMN ($1 : utilisateur, $2 : objets offerts, puis un défaut par
 * emplacement, dans l'ordre de SLOTS). Couvre aussi les objets livrés par la promesse d'un pack.
 */
export const UNEQUIP_LOST_SQL = `UPDATE users SET ${SLOTS.map(
  ([, col], i) =>
    `${col} = CASE WHEN ${col} = ANY($2::text[]) OR ${col} IN (SELECT item_id FROM user_items WHERE user_id = $1) THEN ${col} ELSE $${i + 3} END`,
).join(', ')} WHERE id = $1`;

/** Remboursement : retire les objets livrés par cet achat et déséquipe ce qui n'est plus possédé. */
async function refundPurchase(paymentRef: string) {
  const p = await one<PurchaseRow>(
    `UPDATE purchases SET status = 'refunded' WHERE payment_ref = $1 AND status = 'paid' RETURNING *`,
    [paymentRef],
  );
  if (!p?.user_id) return;
  await q(`DELETE FROM user_items WHERE user_id = $1 AND source = $2`, [p.user_id, `purchase:${p.id}`]);
  await q(UNEQUIP_LOST_SQL, [p.user_id, FREE_ITEMS, ...SLOTS.map(([kind]) => DEFAULT_ITEM[kind])]);
  console.log(`Achat ${p.id} remboursé : objets retirés.`);
}

const checkoutLimiter = rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false });

export const shopRouter = Router();

shopRouter.get('/catalog', (_req, res) => {
  res.json({ items: ITEMS, products: PRODUCTS, payments: config.payments });
});

shopRouter.post('/checkout', checkoutLimiter, requireUser, async (req, res) => {
  const parsed = z
    .object({
      productId: z.string().max(60),
      waiver: z.literal(true, { error: 'Vous devez accepter la livraison immédiate du contenu numérique.' }),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Requête invalide.' });
  if (config.payments === 'off') return res.status(503).json({ error: 'Les paiements ne sont pas encore ouverts.' });
  const product = productById(parsed.data.productId);
  if (!product) return res.status(404).json({ error: 'Produit inconnu.' });
  if (product.retired) return res.status(404).json({ error: 'Ce produit n’est plus en vente.' });
  const u = req.identity.user!;
  if (product.items.every(i => u.items.includes(i))) {
    return res.status(409).json({ error: 'Vous possédez déjà tout le contenu de ce produit.' });
  }
  const purchase = await one<{ id: string }>(
    `INSERT INTO purchases (user_id, product_id, items, provider, amount_cents, currency, status, email)
     VALUES ($1, $2, $3, $4, $5, 'eur', 'pending', $6) RETURNING id`,
    [u.id, product.id, product.items, config.payments, product.priceCents, u.email],
  );
  if (config.payments === 'demo') {
    return res.json({ url: `/boutique/demo/${purchase!.id}` });
  }
  try {
    const session = await stripe!.checkout.sessions.create({
      mode: 'payment',
      locale: 'fr',
      customer_email: u.email,
      client_reference_id: u.id,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: product.priceCents,
          tax_behavior: 'inclusive',
          product_data: { name: product.name, description: product.description },
        },
      }],
      automatic_tax: { enabled: config.stripe.automaticTax },
      invoice_creation: { enabled: config.stripe.invoices },
      metadata: { purchaseId: purchase!.id, userId: u.id, productId: product.id },
      payment_intent_data: { metadata: { purchaseId: purchase!.id } },
      custom_text: {
        submit: {
          message: 'Contenu numérique livré immédiatement : vous avez renoncé à votre droit de rétractation (art. L221-28 du Code de la consommation).',
        },
      },
      success_url: `${config.publicUrl}/boutique?achat={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.publicUrl}/boutique?annule=1`,
    });
    await q('UPDATE purchases SET provider_ref = $1 WHERE id = $2', [session.id, purchase!.id]);
    res.json({ url: session.url });
  } catch (e) {
    console.error('Stripe :', e);
    await q(`UPDATE purchases SET status = 'failed' WHERE id = $1`, [purchase!.id]);
    res.status(502).json({ error: 'Le service de paiement est indisponible, réessayez plus tard.' });
  }
});

/** Retour de Stripe : on vérifie le paiement sans attendre le webhook. */
shopRouter.get('/confirm/:sessionId', requireUser, async (req, res) => {
  const p = await one<PurchaseRow>('SELECT * FROM purchases WHERE provider_ref = $1 AND user_id = $2', [req.params.sessionId, req.identity.user!.id]);
  if (!p) return res.status(404).json({ error: 'Achat introuvable.' });
  if (p.status === 'pending' && stripe) {
    try {
      const session = await stripe.checkout.sessions.retrieve(String(req.params.sessionId));
      if (session.payment_status === 'paid') {
        const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
        await fulfillPurchase(p.id, pi);
      }
    } catch (e) {
      console.error('Stripe :', e);
    }
  }
  const fresh = await one<PurchaseRow>('SELECT * FROM purchases WHERE id = $1', [p.id]);
  res.json({ status: fresh!.status, productId: p.product_id, user: toMe((await userById(req.identity.user!.id))!) });
});

/** Mode démo uniquement : simule un paiement réussi. */
shopRouter.post('/demo/:purchaseId/complete', requireUser, async (req, res) => {
  if (config.payments !== 'demo') return res.status(404).json({ error: 'Indisponible.' });
  const p = await one<PurchaseRow>(`SELECT * FROM purchases WHERE id = $1 AND user_id = $2`, [req.params.purchaseId, req.identity.user!.id]);
  if (!p) return res.status(404).json({ error: 'Achat introuvable.' });
  await fulfillPurchase(p.id, `demo_${p.id}`);
  res.json({ ok: true, productId: p.product_id, user: toMe((await userById(req.identity.user!.id))!) });
});

shopRouter.get('/demo/:purchaseId', requireUser, async (req, res) => {
  if (config.payments !== 'demo') return res.status(404).json({ error: 'Indisponible.' });
  const p = await one<PurchaseRow>(`SELECT * FROM purchases WHERE id = $1 AND user_id = $2`, [req.params.purchaseId, req.identity.user!.id]);
  if (!p) return res.status(404).json({ error: 'Achat introuvable.' });
  res.json({ id: p.id, productId: p.product_id, amountCents: p.amount_cents, status: p.status });
});

/** Webhook Stripe : à déclarer dans le tableau de bord Stripe (voir README). Corps brut obligatoire. */
export const stripeWebhook = [
  express.raw({ type: 'application/json', limit: '1mb' }),
  async (req: express.Request, res: express.Response) => {
    if (!stripe || !config.stripe.webhookSecret) return res.status(404).end();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, req.headers['stripe-signature'] as string, config.stripe.webhookSecret);
    } catch (e) {
      console.warn('Webhook Stripe refusé :', (e as Error).message);
      return res.status(400).send('Signature invalide');
    }
    try {
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
          const s = event.data.object as Stripe.Checkout.Session;
          if (s.payment_status === 'paid' && s.metadata?.purchaseId) {
            const pi = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null;
            await fulfillPurchase(s.metadata.purchaseId, pi);
          }
          break;
        }
        case 'checkout.session.expired':
        case 'checkout.session.async_payment_failed': {
          const s = event.data.object as Stripe.Checkout.Session;
          if (s.metadata?.purchaseId) await q(`UPDATE purchases SET status = 'failed' WHERE id = $1 AND status = 'pending'`, [s.metadata.purchaseId]);
          break;
        }
        case 'charge.refunded': {
          const ch = event.data.object as Stripe.Charge;
          const pi = typeof ch.payment_intent === 'string' ? ch.payment_intent : ch.payment_intent?.id;
          if (pi && ch.refunded) await refundPurchase(pi);
          break;
        }
      }
      res.json({ received: true });
    } catch (e) {
      console.error('Traitement du webhook :', e);
      res.status(500).end();
    }
  },
];
