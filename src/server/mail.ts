// Envoi des e-mails. Sans SMTP configuré, les messages sont affichés dans la console (développement).
import nodemailer from 'nodemailer';
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

export function sendPurchaseConfirmation(to: string, productName: string, amount: string) {
  const url = `${config.publicUrl}/boutique`;
  return send(
    to,
    `Merci pour votre achat – ${config.appName}`,
    layout('Achat confirmé ✨', `Votre achat <b>${escape(productName)}</b> (${escape(amount)}) est disponible dès maintenant dans votre collection. Équipez-le depuis la boutique pour que vos adversaires le voient en partie.`, { label: 'Équiper mes nouveautés', url }),
    `Achat confirmé : ${productName} (${amount}). ${url}`,
  );
}
