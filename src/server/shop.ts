// Boutique : paiement par Stripe Checkout (page de paiement hébergée par Stripe), webhook et mode démo.
// On paie un produit (objet, collection « à compléter », pack) ou un panier d'essai (au plus un objet par
// emplacement). Le montant est toujours calculé ici (productPrice, quoteCart), jamais reçu du navigateur.
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import Stripe from 'stripe';
import { z } from 'zod';
import {
  ALL_PRODUCTS, DEFAULT_ITEM, FREE_ITEMS, ITEMS, PRODUCTS, SLOTS, formatPrice, itemById, productById,
  productPrice, quoteCart,
} from '../shared/catalog';
import type { Item, ItemKind, Product } from '../shared/catalog';
import { CART_PRODUCT_ID } from '../shared/protocol';
import type { ConfirmResponse, DemoCompleteResponse, DemoPurchase, PurchaseStatus } from '../shared/protocol';
import { SLOT_COLUMN, requireUser, toMe, userById } from './auth';
import { config } from './config';
import { one, q, tx } from './db';
import type { DbClient } from './db';
import { purchaseItemLines, sendPurchaseConfirmation } from './mail';

const stripe = config.payments === 'stripe' ? new Stripe(config.stripe.secretKey) : null;

interface PurchaseRow {
  id: string;
  user_id: string | null;
  product_id: string;
  items: string[];
  amount_cents: number;
  status: PurchaseStatus;
  email: string | null;
  /** Équiper à la livraison ce qui est livré (un objet par emplacement). */
  equip: boolean;
}

// ---------------------------------------------------------------------------------------------
// Sélections et équipement

/**
 * Objets d'une sélection (équipement ou panier) : tous connus (sinon 404), au plus un par emplacement (sinon 400).
 * Exportée pour /account/equip et les tests.
 */
export function slotSelection(ids: readonly string[]): { items: Item[] } | { status: 400 | 404; error: string } {
  const items = ids.map(itemById);
  if (items.some(i => !i)) return { status: 404, error: 'Objet inconnu.' };
  const kinds = new Set(items.map(i => i!.kind));
  if (kinds.size !== items.length) return { status: 400, error: 'Un seul objet par emplacement.' };
  return { items: items as Item[] };
}

/**
 * Équipe des objets (au plus un par emplacement, déjà vérifiés) en une seule requête. Les noms de colonnes ne viennent
 * que de SLOT_COLUMN. `c` : connexion d'une transaction, sinon la base.
 */
export async function equipItems(userId: string, items: readonly Item[], c?: DbClient): Promise<void> {
  if (!items.length) return;
  const sets = items.map((it, i) => `${SLOT_COLUMN[it.kind]} = $${i + 2}`).join(', ');
  const params = [userId, ...items.map(it => it.id)];
  const text = `UPDATE users SET ${sets} WHERE id = $1`;
  if (c) await c.query(text, params);
  else await q(text, params);
}

/** Objets à équiper à la livraison : pour chaque emplacement, l'objet livré s'il est seul de son emplacement. */
export function equipAtDelivery(items: readonly string[]): Item[] {
  const known = items.map(itemById).filter((i): i is Item => !!i);
  return SLOTS.flatMap(kind => {
    const of = known.filter(i => i.kind === kind);
    return of.length === 1 ? of : [];
  });
}

// ---------------------------------------------------------------------------------------------
// Promesses des packs (« et les prochains offerts »)

/**
 * Objets promis par un produit : tous les objets payants des emplacements de `future`, y compris ceux ajoutés au
 * catalogue après l'achat. Le Grimoire des sorts promet les sorts, le Grimoire complet (retiré) les sorts et les
 * échiquiers, jamais les rois.
 */
export function promisedItems(productId: string): string[] {
  const future: readonly ItemKind[] = productById(productId)?.future ?? [];
  if (!future.length) return [];
  return ITEMS.filter(i => !i.free && future.includes(i.kind)).map(i => i.id);
}

/**
 * Tient les promesses des packs pour les achats déjà payés : livre à chaque acheteur les objets promis que son achat ne
 * contient pas encore, avec la source de l'achat (un remboursement du pack les retire aussi), puis les ajoute à
 * `purchases.items`. Chaque objet promis n'est ainsi livré qu'une fois par achat : un objet retiré ensuite par
 * l'administrateur ne revient pas au démarrage suivant. Un objet déjà possédé par ailleurs garde sa source.
 * Idempotente ; appelée au démarrage, juste après les migrations. Un achat remboursé, en attente ou échoué ne reçoit
 * rien. Renvoie le nombre d'objets livrés.
 */
export async function honorPackPromises(): Promise<number> {
  let delivered = 0;
  for (const p of ALL_PRODUCTS.filter(x => x.future?.length).map(x => x.id)) {
    delivered += await tx(async c => {
      const where = `pu.product_id = $1 AND pu.status = 'paid' AND pu.user_id IS NOT NULL`;
      const promised = promisedItems(p);
      const added = await c.query(
        `INSERT INTO user_items (user_id, item_id, source)
         SELECT pu.user_id, it, 'purchase:' || pu.id
         FROM purchases pu CROSS JOIN unnest($2::text[]) AS it
         WHERE ${where} AND NOT (it = ANY(pu.items))
         ON CONFLICT (user_id, item_id) DO NOTHING
         RETURNING user_id`,
        [p, promised],
      );
      await c.query(
        `UPDATE purchases pu SET items = pu.items || array(SELECT it FROM unnest($2::text[]) AS it WHERE NOT (it = ANY(pu.items)))
         WHERE ${where} AND NOT (pu.items @> $2::text[])`,
        [p, promised],
      );
      return added.rows.length;
    });
  }
  if (delivered) console.log(`Promesses des packs : ${delivered} objet(s) livré(s) aux acheteurs.`);
  return delivered;
}

// ---------------------------------------------------------------------------------------------
// Commande : ce que l'on facture

/** Une ligne facturée (une ligne Stripe). */
export interface OrderLine {
  name: string;
  description?: string;
  cents: number;
}

/** Commande calculée au serveur : produit (ou CART_PRODUCT_ID), objets livrés, montant et lignes. */
export interface Order {
  productId: string;
  items: string[];
  amountCents: number;
  lines: OrderLine[];
}

export type OrderRequest = { productId: string } | { itemIds: readonly string[] };

/**
 * Nom facturé : une collection dont on possédait déjà des pièces (payée moins que son prix) se lit « (pièces
 * manquantes) », sur la ligne Stripe (reçu, facture) comme dans l'e-mail d'achat.
 */
function billedName(name: string, product: Product | undefined, cents: number): string {
  return product?.kind === 'collection' && cents < product.priceCents ? `${name} (pièces manquantes)` : name;
}

/**
 * Commande d'un produit ou d'un panier pour qui possède `owned` (objets de user_items). Exportée pour les tests.
 * - Produit : prix de productPrice (collection au prix « compléter »), objets du produit. Inconnu ou retiré : 404.
 * - Panier : lignes de quoteCart (une collection complétée par le panier au prix « compléter »), objets à payer
 *   seulement (ni offerts ni possédés). Objet inconnu : 404 ; deux objets du même emplacement : 400.
 * Rien à payer : 409.
 */
export function orderFor(req: OrderRequest, owned: readonly string[]): Order | { status: number; error: string } {
  if ('productId' in req) {
    const product = productById(req.productId);
    if (!product) return { status: 404, error: 'Produit inconnu.' };
    if (product.retired) return { status: 404, error: 'Ce produit n’est plus en vente.' };
    const amount = productPrice(product, owned);
    if (amount === null) return { status: 409, error: 'Vous possédez déjà tout le contenu de ce produit.' };
    return {
      productId: product.id,
      items: [...product.items],
      amountCents: amount,
      lines: [{ name: billedName(product.name, product, amount), description: product.description, cents: amount }],
    };
  }
  const sel = slotSelection(req.itemIds);
  if ('error' in sel) return sel;
  const quote = quoteCart(req.itemIds, owned);
  if (!quote) return { status: 409, error: 'Vous possédez déjà tout le contenu de cette sélection.' };
  return {
    productId: CART_PRODUCT_ID,
    items: quote.lines.flatMap(l => l.items),
    amountCents: quote.totalCents,
    lines: quote.lines.map(l => {
      const product = productById(l.productId);
      return { name: billedName(l.label, product, l.cents), description: product?.description, cents: l.cents };
    }),
  };
}

/** Lignes Stripe d'une commande : une par produit ou par ligne du panier, prix TTC (`tax_behavior: 'inclusive'`). */
export function stripeLineItems(order: Order): Stripe.Checkout.SessionCreateParams.LineItem[] {
  return order.lines.map(l => ({
    quantity: 1,
    price_data: {
      currency: 'eur',
      unit_amount: l.cents,
      tax_behavior: 'inclusive',
      product_data: { name: l.name, ...(l.description ? { description: l.description } : {}) },
    },
  }));
}

/**
 * Libellé d'un achat (e-mail) : le nom facturé du produit (« (pièces manquantes) » pour une collection complétée, comme
 * la ligne Stripe), ou « Votre sélection (n skins) » pour un panier.
 */
export function purchaseLabel(productId: string, items: readonly string[], amountCents?: number): string {
  const product = productId === CART_PRODUCT_ID ? undefined : productById(productId);
  if (product) return amountCents === undefined ? product.name : billedName(product.name, product, amountCents);
  return `Votre sélection (${items.length} skin${items.length > 1 ? 's' : ''})`;
}

// ---------------------------------------------------------------------------------------------
// Livraison et remboursement

/**
 * Livre les objets d'un achat payé et, si l'achat le demande (`equip`), équipe dans la même transaction l'objet livré
 * de chaque emplacement (s'il est seul de son emplacement) : l'équipement ne dépend pas du retour du navigateur.
 * Un pack livre aussi ses objets promis ajoutés au catalogue depuis la création de l'achat (session Stripe ouverte,
 * paiement différé), notés dans `purchases.items` comme le fait honorPackPromises.
 * Idempotent : un second appel ne fait rien. L'e-mail ne présente comme nouveaux que les objets réellement ajoutés.
 */
export async function fulfillPurchase(purchaseId: string, paymentRef: string | null): Promise<boolean> {
  const done = await tx(async c => {
    const r = await c.query<PurchaseRow>(
      `UPDATE purchases SET status = 'paid', paid_at = now(), payment_ref = coalesce($2, payment_ref)
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [purchaseId, paymentRef],
    );
    const row = r.rows[0];
    if (!row || !row.user_id) return null;
    const items = [...new Set([...row.items, ...promisedItems(row.product_id)])];
    if (items.length > row.items.length) await c.query(`UPDATE purchases SET items = $2 WHERE id = $1`, [row.id, items]);
    const added = await c.query<{ item_id: string }>(
      `INSERT INTO user_items (user_id, item_id, source) SELECT $1::uuid, it, $3::text FROM unnest($2::text[]) AS it
       ON CONFLICT (user_id, item_id) DO NOTHING RETURNING item_id`,
      [row.user_id, items, `purchase:${row.id}`],
    );
    const equipped = row.equip ? equipAtDelivery(items) : [];
    await equipItems(row.user_id, equipped, c);
    return { row: { ...row, items }, added: new Set(added.rows.map(a => a.item_id)), equipped };
  });
  if (!done) return false;
  const { row: p, added, equipped } = done;
  if (p.email) {
    void sendPurchaseConfirmation(p.email, {
      label: purchaseLabel(p.product_id, p.items, p.amount_cents),
      amount: formatPrice(p.amount_cents),
      items: purchaseItemLines(p.items.filter(id => added.has(id))),
      alreadyOwned: purchaseItemLines(p.items.filter(id => !added.has(id))),
      equipped: equipped.length > 0,
    });
  }
  console.log(`Achat ${p.id} livré (${p.product_id}, ${formatPrice(p.amount_cents)}${equipped.length ? ', équipé' : ''}).`);
  return true;
}

const SLOT_ENTRIES = Object.entries(SLOT_COLUMN) as [ItemKind, (typeof SLOT_COLUMN)[ItemKind]][];
/**
 * Après un retrait d'objets : chaque emplacement équipé d'un objet ni offert ni encore possédé revient à son défaut.
 * Une seule requête, construite depuis SLOT_COLUMN ($1 : utilisateur, $2 : objets offerts, puis un défaut par
 * emplacement, dans l'ordre de SLOT_ENTRIES). Couvre aussi les objets livrés par la promesse d'un pack.
 */
export const UNEQUIP_LOST_SQL = `UPDATE users SET ${SLOT_ENTRIES.map(
  ([, col], i) =>
    `${col} = CASE WHEN ${col} = ANY($2::text[]) OR ${col} IN (SELECT item_id FROM user_items WHERE user_id = $1) THEN ${col} ELSE $${i + 3} END`,
).join(', ')} WHERE id = $1`;

/**
 * Remboursement : retire les objets livrés par cet achat (promesses d'un pack comprises : même source) et déséquipe ce
 * qui n'est plus possédé. Exportée pour les tests.
 */
export async function refundPurchase(paymentRef: string) {
  const p = await one<PurchaseRow>(
    `UPDATE purchases SET status = 'refunded' WHERE payment_ref = $1 AND status = 'paid' RETURNING *`,
    [paymentRef],
  );
  if (!p?.user_id) return;
  await q(`DELETE FROM user_items WHERE user_id = $1 AND source = $2`, [p.user_id, `purchase:${p.id}`]);
  await q(UNEQUIP_LOST_SQL, [p.user_id, FREE_ITEMS, ...SLOT_ENTRIES.map(([kind]) => DEFAULT_ITEM[kind])]);
  console.log(`Achat ${p.id} remboursé : objets retirés.`);
}

// ---------------------------------------------------------------------------------------------
// Routes

const checkoutLimiter = rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false });

/**
 * Corps de POST /api/shop/checkout (CheckoutRequest) : un produit ou un panier, jamais les deux. Tous les messages sont
 * en français (la route renvoie le premier tel quel). Exporté pour les tests.
 */
export const checkoutSchema = z
  .object(
    {
      productId: z.string({ error: 'Produit inconnu.' }).max(60, { error: 'Produit inconnu.' }).optional(),
      itemIds: z
        .array(z.string({ error: 'Objet inconnu.' }).max(60, { error: 'Objet inconnu.' }), { error: 'Sélection invalide.' })
        .min(1, { error: 'Sélection vide.' })
        .max(SLOTS.length, { error: 'Un seul objet par emplacement.' })
        .optional(),
      waiver: z.literal(true, { error: 'Vous devez accepter la livraison immédiate du contenu numérique.' }),
      equip: z.boolean({ error: 'Requête invalide.' }).optional(),
    },
    { error: 'Requête invalide.' },
  )
  .refine(b => (b.productId === undefined) !== (b.itemIds === undefined), { error: 'Indiquez un produit ou une sélection.' });

export const shopRouter = Router();

shopRouter.get('/catalog', (_req, res) => {
  res.json({ items: ITEMS, products: PRODUCTS, payments: config.payments });
});

shopRouter.post('/checkout', checkoutLimiter, requireUser, async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Requête invalide.' });
  if (config.payments === 'off') return res.status(503).json({ error: 'Les paiements ne sont pas encore ouverts.' });
  const u = req.identity.user!;
  const { productId, itemIds, equip = false } = parsed.data;
  const order = orderFor(itemIds ? { itemIds } : { productId: productId! }, u.items);
  if ('error' in order) return res.status(order.status).json({ error: order.error });
  const purchase = await one<{ id: string }>(
    `INSERT INTO purchases (user_id, product_id, items, provider, amount_cents, currency, status, email, equip)
     VALUES ($1, $2, $3, $4, $5, 'eur', 'pending', $6, $7) RETURNING id`,
    [u.id, order.productId, order.items, config.payments, order.amountCents, u.email, equip],
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
      line_items: stripeLineItems(order),
      automatic_tax: { enabled: config.stripe.automaticTax },
      invoice_creation: { enabled: config.stripe.invoices },
      metadata: { purchaseId: purchase!.id, userId: u.id, productId: order.productId },
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
  // Relu après la livraison : `items` comprend les objets promis d'un pack livrés avec lui
  const fresh = await one<PurchaseRow>('SELECT * FROM purchases WHERE id = $1', [p.id]);
  res.json({
    status: fresh!.status,
    productId: p.product_id,
    items: fresh!.items,
    user: toMe((await userById(req.identity.user!.id))!),
  } satisfies ConfirmResponse);
});

/** Mode démo uniquement : simule un paiement réussi. */
shopRouter.post('/demo/:purchaseId/complete', requireUser, async (req, res) => {
  if (config.payments !== 'demo') return res.status(404).json({ error: 'Indisponible.' });
  const p = await one<PurchaseRow>(`SELECT * FROM purchases WHERE id = $1 AND user_id = $2`, [req.params.purchaseId, req.identity.user!.id]);
  if (!p) return res.status(404).json({ error: 'Achat introuvable.' });
  await fulfillPurchase(p.id, `demo_${p.id}`);
  const fresh = await one<PurchaseRow>('SELECT * FROM purchases WHERE id = $1', [p.id]);
  res.json({
    ok: true,
    productId: p.product_id,
    items: fresh!.items,
    user: toMe((await userById(req.identity.user!.id))!),
  } satisfies DemoCompleteResponse);
});

shopRouter.get('/demo/:purchaseId', requireUser, async (req, res) => {
  if (config.payments !== 'demo') return res.status(404).json({ error: 'Indisponible.' });
  const p = await one<PurchaseRow>(`SELECT * FROM purchases WHERE id = $1 AND user_id = $2`, [req.params.purchaseId, req.identity.user!.id]);
  if (!p) return res.status(404).json({ error: 'Achat introuvable.' });
  res.json({ id: p.id, productId: p.product_id, items: p.items, amountCents: p.amount_cents, status: p.status } satisfies DemoPurchase);
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
          else if (pi && ch.amount_refunded > 0) {
            // Remboursement partiel (une ligne d'un panier, par exemple) : rien n'est retiré automatiquement.
            const p = await one<{ id: string }>(`SELECT id FROM purchases WHERE payment_ref = $1`, [pi]);
            console.warn(
              `Remboursement partiel (${formatPrice(ch.amount_refunded)}) de l’achat ${p?.id ?? `inconnu, paiement ${pi}`} : ` +
                'aucun objet retiré. Retirez l’objet remboursé dans l’administration, ou remboursez l’achat en entier.',
            );
          }
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
