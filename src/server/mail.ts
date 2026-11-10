// Envoi des e-mails. Sans SMTP configuré, les messages sont affichés dans la console (développement).
import nodemailer from 'nodemailer';
import { COLLECTIONS, SLOTS, collectionOf, itemById, itemLabel } from '../shared/catalog';
import type { Item, ItemKind } from '../shared/catalog';
import { config } from './config';

const transport = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

const escape = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

function layout(title: string, body: string, cta?: { label: string; url: string }): string {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#0b0c1a;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#e8e6f5">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0c1a;padding:32px 12px"><tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#15162b;border:1px solid #2a2a4a;border-radius:16px;padding:36px">
  <tr><td style="font-family:Georgia,serif;font-size:26px;letter-spacing:2px;color:#f3c969;padding-bottom:18px">✦ ${escape(config.appName)}</td></tr>
  <tr><td style="font-size:20px;font-weight:600;padding-bottom:12px;color:#ffffff">${escape(title)}</td></tr>
  <tr><td style="font-size:15px;line-height:1.6;color:#c9c6e0">${body}</td></tr>
  ${cta ? `<tr><td style="padding:26px 0 8px"><a href="${cta.url}" style="display:inline-block;background:#f3c969;color:#1a1408;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:10px">${escape(cta.label)}</a></td></tr>
  <tr><td style="font-size:12px;color:#8a87a8;padding-top:10px">Si le bouton ne fonctionne pas, copiez ce lien : <br><span style="color:#b9b5ff">${cta.url}</span></td></tr>` : ''}
  <tr><td style="font-size:12px;color:#6e6b8c;padding-top:28px;border-top:1px solid #2a2a4a;margin-top:20px">Vous recevez cet e-mail car une action a été effectuée sur votre compte ${escape(config.appName)}.</td></tr>
  </table></td></tr></table></body></html>`;
}

async function send(to: string, subject: string, html: string, text: string) {
  if (!transport) {
    console.log(`\n[e-mail non envoyé : SMTP non configuré]\nÀ : ${to}\nObjet : ${subject}\n${text}\n`);
    return;
  }
  try {
    await transport.sendMail({ from: config.smtp.from, to, subject, html, text });
  } catch (e) {
    console.error('Échec de l’envoi d’e-mail :', e);
  }
}

export function sendVerification(to: string, username: string, token: string) {
  const url = `${config.publicUrl}/verifier/${token}`;
  return send(
    to,
    `Confirmez votre adresse e-mail – ${config.appName}`,
    layout(`Bienvenue, ${username} !`, 'Votre grimoire est prêt. Confirmez votre adresse e-mail pour sécuriser votre compte et vos achats.', { label: 'Confirmer mon e-mail', url }),
    `Bienvenue ${username} ! Confirmez votre adresse : ${url}`,
  );
}

export function sendPasswordReset(to: string, username: string, token: string) {
  const url = `${config.publicUrl}/reinitialiser/${token}`;
  return send(
    to,
    `Réinitialisation du mot de passe – ${config.appName}`,
    layout('Mot de passe oublié ?', `Bonjour ${escape(username)}, cliquez ci-dessous pour choisir un nouveau mot de passe. Ce lien expire dans une heure. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.`, { label: 'Choisir un nouveau mot de passe', url }),
    `Réinitialisez votre mot de passe (valable 1 h) : ${url}`,
  );
}

export interface PurchaseMail {
  /** Nom facturé du produit (« Collection Forge d’Inferno (pièces manquantes) »), ou « Votre sélection (n skins) ». */
  label: string;
  /** Montant facturé, déjà formaté (« 3,00 € »). */
  amount: string;
  /** Lignes des objets nouvellement livrés (purchaseItemLines : « Roi de braise », « Jardin de jade : roi, échiquier et sorts »). */
  items: readonly string[];
  /** Lignes des objets du produit que l'acheteur possédait déjà (collection complétée, pack), présentés à part. */
  alreadyOwned?: readonly string[];
  /** Ce qui a été livré a aussi été équipé (achat avec « Les équiper dès la livraison »). */
  equipped: boolean;
}

/** Au-delà de ce nombre d'objets, l'e-mail les regroupe (purchaseItemLines). */
const MAIL_GROUP_ABOVE = 4;
const SLOT_WORD: Record<ItemKind, { one: string; many: string }> = {
  king: { one: 'roi', many: 'rois' },
  board: { one: 'échiquier', many: 'échiquiers' },
  skin: { one: 'sorts', many: 'sorts' },
};
/** « a », « a et b », « a, b et c ». */
const joinFr = (words: readonly string[]) =>
  words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} et ${words[words.length - 1]}`;

/**
 * Lignes d'objets pour l'e-mail d'achat. Jusqu'à 4 objets : un libellé par objet (« Roi de braise », « Sorts Inferno »).
 * Au-delà, regroupés : une ligne par collection dont l'achat compte au moins deux pièces (« Jardin de jade : roi,
 * échiquier et sorts »), puis les autres par emplacement (« 7 sorts : Inferno, Néon 2084, … et Écarlate ») ; le Trésor
 * tient en 7 lignes, le Grimoire des sorts en une. Objets inconnus ignorés. Exportée pour les tests.
 */
export function purchaseItemLines(ids: readonly string[]): string[] {
  const order = (i: Item) => SLOTS.indexOf(i.kind);
  const items = ids.map(itemById).filter((i): i is Item => !!i);
  if (items.length <= MAIL_GROUP_ABOVE) return items.map(itemLabel);
  const lines: string[] = [];
  const rest: Item[] = items.filter(i => !collectionOf(i.id));
  for (const c of COLLECTIONS) {
    const of = items.filter(i => collectionOf(i.id) === c).sort((a, b) => order(a) - order(b));
    if (of.length >= 2) lines.push(`${c.name} : ${joinFr(of.map(i => SLOT_WORD[i.kind].one))}`);
    else rest.push(...of);
  }
  rest.sort((a, b) => items.indexOf(a) - items.indexOf(b));
  for (const kind of SLOTS) {
    const of = rest.filter(i => i.kind === kind);
    if (of.length === 1) lines.push(itemLabel(of[0]));
    else if (of.length > 1) lines.push(`${of.length} ${SLOT_WORD[kind].many} : ${joinFr(of.map(i => i.name))}`);
  }
  return lines;
}

/** Qui voit quoi : le roi et les sorts se voient en partie ; l'échiquier, chacun garde le sien. */
const WHO_SEES = 'Votre roi et vos sorts : vos adversaires les voient. Votre échiquier : il vous suit dans toutes vos parties.';

/** E-mail de confirmation d'achat (objet, HTML, texte), sans l'envoyer. Exportée pour les tests et les aperçus. */
export function purchaseConfirmationMail(m: PurchaseMail): { subject: string; html: string; text: string } {
  const url = `${config.publicUrl}/boutique`;
  const already = m.alreadyOwned ?? [];
  const intro = m.items.length ? 'Disponible dès maintenant dans votre collection :' : 'Tout ce contenu était déjà dans votre collection.';
  const list = m.items.length
    ? `<ul style="margin:10px 0 16px;padding-left:20px;color:#ffffff">${m.items.map(i => `<li style="padding:2px 0">${escape(i)}</li>`).join('')}</ul>`
    : '<br><br>';
  const owned = m.items.length && already.length ? `Déjà dans votre collection : ${already.join(' · ')}.` : '';
  const next = m.equipped
    ? 'C’est déjà équipé : tout est prêt pour votre prochaine partie.'
    : 'Équipez vos nouveautés depuis la boutique ou votre compte.';
  return {
    subject: `Merci pour votre achat – ${config.appName}`,
    html: layout(
      'Achat confirmé ✨',
      `<b style="color:#ffffff">${escape(m.label)}</b> · ${escape(m.amount)}<br>${escape(intro)}${list}` +
        (owned ? `<span style="color:#8a87a8">${escape(owned)}</span><br><br>` : '') +
        `${escape(next)}<br><br><span style="color:#8a87a8">${escape(WHO_SEES)}</span>`,
      { label: m.equipped ? 'Voir ma panoplie' : 'Équiper mes nouveautés', url },
    ),
    text: [
      `Achat confirmé : ${m.label} · ${m.amount}`,
      intro,
      ...m.items.map(i => `- ${i}`),
      ...(owned ? [owned] : []),
      next,
      WHO_SEES,
      url,
    ].join('\n'),
  };
}

export function sendPurchaseConfirmation(to: string, m: PurchaseMail) {
  const { subject, html, text } = purchaseConfirmationMail(m);
  return send(to, subject, html, text);
}
