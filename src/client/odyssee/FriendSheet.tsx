// Porte « Défier un ami » de l'accueil (Seuil) : sa feuille, chargée à la demande. Elle seule lit les cadences
// (protocol.ts) et le pseudo d'invité : hors du code du premier affichage de l'accueil. L'accueil la précharge au repos
// (OdysseeHome, avec le code des démonstrations) : elle est prête bien avant que le visiteur n'arrive au Seuil.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CATALOGS, offeredCatalog } from '../../shared/cards';
import type { Catalog } from '../../shared/cards';
import { DEFAULT_QUICK, TIME_CONTROLS } from '../../shared/protocol';
import { api, errMsg } from '../api';
import { getGuestName, setGuestName } from '../store';
import { Sheet } from './parts';

/**
 * Pseudo d'invité : GUEST_NAME (src/shared/config/limits.ts), figé au build (__SM__.pseudoInvite, vite.config.ts).
 * L'importer ferait de limits.ts un morceau de plus, partagé avec la page de partie et Jouer.
 */
const GUEST = __SM__.pseudoInvite;
const GUEST_FULL = new RegExp(GUEST.motif, GUEST.drapeaux);

/** Cadences proposées par « Défier un ami » (TIME_CONTROLS.invite), et celle choisie à l'ouverture : DEFAULT_QUICK si
 *  elle en fait partie, sinon la première (une cadence que le visiteur ne voit pas ne part jamais). */
export const INVITE_TCS = TIME_CONTROLS.filter(t => t.invite && !t.archived);
export const INVITE_TC0 = INVITE_TCS.some(t => t.id === DEFAULT_QUICK) ? DEFAULT_QUICK : INVITE_TCS[0]?.id ?? DEFAULT_QUICK;

/**
 * Porte « Défier un ami » : créer une invitation (vraie partie sur le serveur) et partir vers /partie/:id. Cadences
 * proposées : INVITE_TCS, INVITE_TC0 à l'ouverture ; pseudo d'invité : GUEST_NAME.
 */
export default function FriendSheet({ onClose, catalog: initial, signedIn, kicker }: { onClose: () => void; catalog: string; signedIn: boolean; kicker: string }) {
  const navigate = useNavigate();
  const [name, setName] = useState(getGuestName());
  const [tc, setTc] = useState(INVITE_TC0);
  // Jeu proposé : « Pouvoirs » (par défaut) ou « Sans cartes » ; le Duel n'est plus proposé.
  const [catalog, setCatalog] = useState<Catalog>(() => offeredCatalog(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = signedIn || GUEST_FULL.test(name.trim());
  const create = async () => {
    setError(null);
    if (!valid) {
      setError(GUEST.invalide);
      return;
    }
    setBusy(true);
    try {
      if (!signedIn) setGuestName(name.trim());
      const r = await api<{ id: string }>('/games', { body: { mode: 'invite', tc, color: 'random', catalog, name: signedIn ? undefined : name.trim() } });
      navigate(`/partie/${r.id}`);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };
  return (
    <Sheet
      kicker={kicker}
      title="Défier un ami"
      onClose={onClose}
      actions={
        <button type="button" className="btn-gold sm" onClick={() => void create()} disabled={busy}>
          {busy ? 'Création…' : "Créer l'invitation"}
        </button>
      }
    >
      <p>Créez la partie, puis envoyez le lien. Votre ami la rejoint en un clic, sans compte, sur mobile comme sur ordinateur.</p>
      <form
        className="o-form"
        onSubmit={e => {
          e.preventDefault();
          void create();
        }}
      >
        {!signedIn && (
          <label className="field">
            <span className="label">Votre pseudo</span>
            <input className="input" maxLength={GUEST.max} value={name} onChange={e => setName(e.target.value)} placeholder="Ex. : Fou du roi" autoComplete="nickname" />
          </label>
        )}
        <div className="field">
          <span className="label">Jeu</span>
          <div className="segmented">
            {CATALOGS.map(c => (
              <button key={c.id} type="button" className={catalog === c.id ? 'on' : ''} aria-pressed={catalog === c.id} title={c.description} onClick={() => setCatalog(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Cadence</span>
          <div className="segmented">
            {INVITE_TCS.map(({ id, short: label }) => (
              <button key={id} type="button" className={tc === id ? 'on' : ''} onClick={() => setTc(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="form-error">{error}</div>}
      </form>
      <p className="o-sheet-note">
        Plus d'options (couleur, cadence) : <Link to="/jouer?mode=invite">page Jouer</Link>.
      </p>
    </Sheet>
  );
}
