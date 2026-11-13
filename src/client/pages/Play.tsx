// Page Jouer (/jouer), au style Odyssée : quatre portes (IA, ami, partie amicale, partie classée), les options de la
// porte choisie (niveau, cartes, cadence, couleur, pseudo) et les parties en cours à reprendre.
// La partie elle-même s'ouvre sur /partie/:id, dans la coque immersive de l'accueil ; avec cartes, elle commence par
// le choix des cartes de chaque joueur (décision D5, src/client/game/CardDraft.tsx). Le mode miroir n'existe plus.
// Niveaux de l'IA (BOT_LEVELS), cadences (TIME_CONTROLS, DEFAULT_QUICK), pseudo d'invité (GUEST_NAME) et textes
// chiffrés viennent des réglages ; une porte dont la fonction est coupée (useFeature) n'est pas proposée.
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CATALOGS, DEFAULT_CATALOG } from '../../shared/cards';
import type { Catalog } from '../../shared/cards';
import { BOT_LEVELS, BOT_PROFILES, DEFAULT_BOT_LEVEL } from '../../shared/bot';
import type { BotLevel } from '../../shared/bot';
import { DEAL, GAME_RULES } from '../../shared/config/rules';
import type { FeatureKey } from '../../shared/config/features';
import type { RulesContext } from '../../shared/config/rules';
import { DEFAULT_QUICK, OFFERED_CONTROLS, QUICK_CONTROLS, TIME_CONTROLS, tcLabel } from '../../shared/protocol';
import type { GameMode } from '../../shared/protocol';
import { rulesFor } from '../../shared/rulesCore';
import { cap, mmss, pluriel, romain } from '../../shared/text/fr';
import { catalogLabel, modeLabel } from '../../shared/text/libelles';
import { cartesDePouvoir, constitutionMains, dureeChoix, niveauxIA, nomsNiveaux, vosCartes } from '../../shared/text/regles';
import { api, errMsg } from '../api';
import { Spinner } from '../components/Layout';
import { emitAck, getSocket } from '../socket';
import { getGuestName, setGuestName, useApp, useFeature } from '../store';
import '../styles/game.css';

type Mode = 'bot' | 'invite' | 'friendly' | 'ranked';
/** Fonction du site qui ouvre chaque porte (avec newGames, la création de parties). */
const DOOR_FEATURE: Record<Mode, FeatureKey> = { bot: 'botGames', invite: 'invites', friendly: 'friendlyQueue', ranked: 'ranked' };
/** Contexte des règles des parties de chaque porte (RULES_BY_CONTEXT). */
const DOOR_CONTEXT: Record<Mode, RulesContext> = { bot: 'ia', invite: 'invitation', friendly: 'amicale', ranked: 'classee' };

interface MyGame {
  id: string;
  status: string;
  mode: string;
  opponent: string | null;
  tc: string;
  rated?: boolean;
  catalog?: Catalog;
  createdAt?: number;
}

const DOORS: { mode: Mode; title: string; badge: string; text: string }[] = [
  {
    mode: 'bot',
    title: "Contre l'IA",
    badge: niveauxIA(BOT_LEVELS.length),
    text: `${nomsNiveaux(BOT_LEVELS.map(l => BOT_PROFILES[l].name))} : une IA qui calcule et garde ses sorts pour le bon moment.`,
  },
  { mode: 'invite', title: 'Défier un ami', badge: 'Sans compte', text: 'Créez la partie, envoyez le lien : votre ami la rejoint en un clic, sur mobile comme sur ordinateur.' },
  { mode: 'friendly', title: 'Partie amicale', badge: 'Ouverte à tous', text: 'Un adversaire humain, au hasard, sans classement. Aucun compte nécessaire.' },
  { mode: 'ranked', title: 'Partie classée', badge: 'Elo', text: 'Un adversaire de votre niveau, et votre classement qui évolue. Un compte gratuit suffit.' },
];

/** En-tête du panneau de chaque porte ; le surtitre porte le numéro de la porte (« Porte I · contre l'IA »). */
const HEADS: Record<Mode, { kicker: string; title: ReactNode; text: string }> = {
  bot: { kicker: "contre l'IA", title: <>Affronter <em>l'Oracle</em>.</>, text: 'Elle commence dès que vous êtes prêt. Vous pouvez la quitter et la reprendre.' },
  invite: { kicker: 'entre amis', title: <>Défier un <em>ami</em>.</>, text: 'Vous recevez un lien à envoyer. La partie commence dès qu’il l’ouvre.' },
  friendly: { kicker: 'file amicale', title: <>Un adversaire <em>au hasard</em>.</>, text: 'Le premier joueur disponible, à la même cadence et avec les mêmes règles de cartes.' },
  ranked: { kicker: 'classement Elo', title: <>Partie <em>classée</em>.</>, text: 'Adversaire de votre niveau ; la tolérance s’élargit avec l’attente.' },
};

/**
 * Pseudo d'invité : mêmes bornes, caractères et message que GUEST_NAME (src/shared/config/limits.ts), vérifiés égaux par
 * test/lessons.test.ts. Importer GUEST_NAME ici ferait de config/limits.ts un morceau à part (il est aussi lu par la
 * partie) et allongerait la table de préchargement du paquet principal (+19 o compressés mesurés).
 */
export const GUEST_NAME = {
  full: /^[\p{L}\p{N} _.-]{2,20}$/u,
  max: 20,
  invalidDetail: 'Choisissez un pseudo de 2 à 20 caractères (lettres, chiffres, espaces, . _ -).',
} as const;

/** Comportement de chaque niveau de l'IA face aux cartes (un niveau ajouté à BOT_LEVELS exige sa description). */
const LEVEL_TEXT: Record<BotLevel, string> = {
  1: 'Joue vite, lance ses sorts au hasard.',
  2: 'Calcule, protège ses pièces, garde une carte pour la fin.',
  3: 'Calcule en profondeur et punit chaque sort gaspillé.',
};

/** Chapeau de la page : le jeu des nouvelles parties. */
const LEDE = `Les échecs, plus ${cartesDePouvoir(GAME_RULES)} chacun, ${
  DEAL.draft ? 'que vous choisissez' : `${pluriel(GAME_RULES.cardsPerPlayer, ['tirée', 'tirées'])} au hasard`
} au début de la partie. Une IA, un ami, ou le premier joueur venu : la partie s’ouvre en plein écran.`;

/** Aide sous le choix des cartes, aux règles de la porte choisie. */
function handHelp(mode: Mode): string {
  const r = rulesFor(DOOR_CONTEXT[mode]);
  if (!DEAL.draft) return `${cap(constitutionMains(r))} au début de la partie.`;
  return `Vous choisirez ${vosCartes(r)} au début de la partie, en ${dureeChoix()} : votre choix reste secret jusqu’à ce que votre adversaire ait choisi aussi.`;
}

function parseMode(v: string | null): Mode {
  if (v === 'invite' || v === 'bot' || v === 'friendly' || v === 'ranked') return v;
  if (v === 'quick') return 'ranked';
  if (v === 'amicale') return 'friendly';
  return 'bot';
}

const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="btn-arrow">
    <path d="M5 12 H19 M13 6 L19 12 L13 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const catName = (c: Catalog) => catalogLabel(c, CATALOGS);

export default function Play() {
  const [params, setParams] = useSearchParams();
  const [wanted, setModeState] = useState<Mode>(() => parseMode(params.get('mode')));
  const [tc, setTc] = useState(DEFAULT_QUICK);
  const [color, setColor] = useState<'w' | 'random' | 'b'>('random');
  const [level, setLevel] = useState<BotLevel>(DEFAULT_BOT_LEVEL);
  const [catalog, setCatalog] = useState<Catalog>(DEFAULT_CATALOG);
  const [name, setName] = useState(getGuestName());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MyGame[]>([]);
  const [queue, setQueue] = useState<{ tc: string; since: number; players: number } | null>(null);
  const { me } = useApp();
  const navigate = useNavigate();
  // Portes ouvertes (fonctions du site), numérotées dans l'ordre ; une porte fermée demandée dans l'adresse laisse la
  // place à la première porte ouverte.
  const newGames = useFeature('newGames');
  const open: Record<Mode, boolean> = {
    bot: useFeature(DOOR_FEATURE.bot),
    invite: useFeature(DOOR_FEATURE.invite),
    friendly: useFeature(DOOR_FEATURE.friendly),
    ranked: useFeature(DOOR_FEATURE.ranked),
  };
  const doors = newGames ? DOORS.filter(d => open[d.mode]) : [];
  const numOf = (m: Mode) => romain(doors.findIndex(d => d.mode === m) + 1);
  const mode: Mode = doors.some(d => d.mode === wanted) ? wanted : (doors[0]?.mode ?? wanted);
  const closed = !doors.length;

  const setMode = (m: Mode) => {
    if (m !== mode && queue) {
      getSocket().emit('queue:leave');
      setQueue(null);
    }
    setModeState(m);
    setError(null);
    const next = new URLSearchParams(params);
    next.set('mode', m);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const m = parseMode(params.get('mode'));
    setModeState(cur => (params.get('mode') ? m : cur));
  }, [params]);

  useEffect(() => {
    api<{ games: MyGame[] }>('/games/mine')
      .then(r => setMine(r.games))
      .catch(() => undefined);
  }, []);

  // La partie s'ouvre vite : on charge son code au repos
  useEffect(() => {
    const t = setTimeout(() => void import('./GameRoute').catch(() => undefined), 1200);
    return () => clearTimeout(t);
  }, []);

  // Catalogue choisi qui ne serait plus proposé (catalogues modifiés) : le premier proposé
  useEffect(() => {
    if (!CATALOGS.some(c => c.id === catalog)) setCatalog(CATALOGS[0]?.id ?? DEFAULT_CATALOG);
  }, [catalog]);

  const quick = mode === 'friendly' || mode === 'ranked';
  useEffect(() => {
    if (quick && !QUICK_CONTROLS.includes(tc)) setTc(DEFAULT_QUICK);
  }, [quick, tc]);

  useEffect(() => {
    const s = getSocket();
    const onMatched = (p: { gameId: string }) => navigate(`/partie/${p.gameId}`);
    const onStatus = (p: { waiting: boolean; tc: string | null; since: number | null; players: number }) =>
      setQueue(p.waiting && p.tc ? { tc: p.tc, since: p.since ?? Date.now(), players: p.players ?? 0 } : null);
    s.on('queue:matched', onMatched);
    s.on('queue:status', onStatus);
    return () => {
      s.off('queue:matched', onMatched);
      s.off('queue:status', onStatus);
      s.emit('queue:leave');
    };
  }, [navigate]);

  const needsName = !me && (mode === 'bot' || mode === 'invite');
  const guestOk = !needsName || GUEST_NAME.full.test(name.trim());

  const start = async () => {
    setError(null);
    if (quick) {
      if (mode === 'ranked' && !me) return;
      setBusy(true);
      try {
        const guest = !me && GUEST_NAME.full.test(name.trim()) ? name.trim() : undefined;
        if (guest) setGuestName(guest);
        const r = await emitAck('queue:join', { tc, rated: mode === 'ranked', name: guest, catalog });
        if (!r.ok) setError(r.error ?? 'Impossible de rejoindre la file.');
        else setQueue(q => q ?? { tc, since: Date.now(), players: 0 });
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!guestOk) {
      setError(GUEST_NAME.invalidDetail);
      return;
    }
    setBusy(true);
    try {
      if (!me) setGuestName(name.trim());
      const r = await api<{ id: string }>('/games', {
        body: { mode, tc, color, level, catalog, name: me ? undefined : name.trim() },
      });
      navigate(`/partie/${r.id}`);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  const cancelQueue = () => {
    getSocket().emit('queue:leave');
    setQueue(null);
  };

  const tcs = TIME_CONTROLS.filter(t => (quick ? QUICK_CONTROLS : OFFERED_CONTROLS).includes(t.id));
  const head = HEADS[mode];
  const ctaMain = mode === 'bot' ? 'Commencer la partie' : mode === 'invite' ? 'Créer le lien' : 'Trouver un adversaire';
  const ctaSub =
    mode === 'bot'
      ? `Contre le ${BOT_PROFILES[level].name} · ${tcLabel(tc)}`
      : mode === 'invite'
        ? `${catName(catalog)} · ${tcLabel(tc)}`
        : `${mode === 'ranked' ? 'Classée' : 'Amicale'} · ${tcLabel(tc)} · ${catName(catalog)}`;

  return (
    <div className="pl container">
      <div className="pl-sky" aria-hidden="true" />
      <div className="pl-grid">
        <div className="pl-left">
          <header className="pl-head">
            <p className="kicker">Jouer · le Seuil</p>
            <h1 className="title-xl">
              Choisissez votre <em>adversaire</em>.
            </h1>
            <p className="lede">{LEDE}</p>
          </header>

          <ul className="pl-doors" aria-label="Type de partie">
            {doors.map(d => (
              <li key={d.mode}>
                <button type="button" className="pl-door" aria-pressed={mode === d.mode} onClick={() => setMode(d.mode)}>
                  <span className="pl-num">{numOf(d.mode)}</span>
                  <span className="pl-door-t">
                    {d.title}
                    <span className="badge gold">{d.badge}</span>
                  </span>
                  <span className="pl-door-d">{d.text}</span>
                  <svg className="pl-arrow" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path d="M5 12 H19 M13 6 L19 12 L13 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          <p className="pl-instant">
            <span>
              Sans rien choisir : <Link to="/">la partie immédiate de l’accueil</Link>.
            </span>
            <span>
              <Link to="/cartes">Les cartes et leurs règles</Link>
            </span>
          </p>
        </div>

        <section className="panel pl-panel" aria-live="polite">
          {closed ? (
            // Toutes les portes fermées (maintenance, ou chaque fonction coupée)
            <div className="pl-panel-head">
              <h2>Pas de nouvelle partie pour le moment.</h2>
              <p>Les parties en cours continuent. Revenez un peu plus tard.</p>
            </div>
          ) : (
            <div className="pl-panel-head">
              <p className="kicker">{`Porte ${numOf(mode)} · ${head.kicker}`}</p>
              <h2>{head.title}</h2>
              <p>{head.text}</p>
            </div>
          )}

          {closed ? null : mode === 'ranked' && !me ? (
            <div className="pl-signin">
              <p className="muted" style={{ margin: 0 }}>
                Les parties classées demandent un compte : c’est gratuit et cela prend vingt secondes. Votre classement Elo et votre historique vous attendent.
              </p>
              <div className="row">
                <Link to="/inscription" className="btn-gold sm">
                  Créer un compte
                </Link>
                <Link to="/connexion?retour=/jouer?mode=ranked" className="btn-line">
                  Se connecter
                </Link>
              </div>
              {open.friendly && (
                <p className="pl-help" style={{ margin: 0 }}>
                  Sans compte, la <button type="button" className="btn-line" style={{ padding: 0, fontSize: 'inherit' }} onClick={() => setMode('friendly')}>partie amicale</button> vous trouve aussi un adversaire humain.
                </p>
              )}
            </div>
          ) : queue ? (
            <QueueWaiting tc={queue.tc} since={queue.since} players={queue.players} ranked={mode === 'ranked'} catalog={catalog} onCancel={cancelQueue} />
          ) : (
            <form
              className="pl-form"
              onSubmit={e => {
                e.preventDefault();
                void start();
              }}
            >
              {mode === 'bot' && (
                <fieldset className="pl-field">
                  <legend className="label">Niveau de l’IA</legend>
                  <div className="pl-levels" role="radiogroup" aria-label="Niveau de l’IA" style={{ '--n': BOT_LEVELS.length } as CSSProperties}>
                    {BOT_LEVELS.map(l => (
                      <button key={l} type="button" role="radio" aria-checked={level === l} className="pl-level" onClick={() => setLevel(l)}>
                        <b>{BOT_PROFILES[l].name}</b>
                        <small>{LEVEL_TEXT[l]}</small>
                        <span>≈ {BOT_PROFILES[l].rating} Elo</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              <fieldset className="pl-field">
                <legend className="label">Cartes</legend>
                <div className="pl-cats" role="radiogroup" aria-label="Cartes de la partie" style={{ '--n': CATALOGS.length } as CSSProperties}>
                  {CATALOGS.map(c => (
                    <button key={c.id} type="button" role="radio" aria-checked={catalog === c.id} className="pl-cat" onClick={() => setCatalog(c.id)}>
                      <b>{c.label}</b>
                      <small>{c.description}</small>
                    </button>
                  ))}
                </div>
                {catalog !== 'aucune' && <span className="pl-help">{handHelp(mode)}</span>}
              </fieldset>

              <fieldset className="pl-field">
                <legend className="label">Cadence</legend>
                <div className="segmented" role="radiogroup" aria-label="Cadence">
                  {tcs.map(t => (
                    <button key={t.id} type="button" role="radio" aria-checked={tc === t.id} className={tc === t.id ? 'on' : ''} onClick={() => setTc(t.id)}>
                      {t.label}
                      <small>{t.family}</small>
                    </button>
                  ))}
                </div>
                {tc === 'none' && catalog !== 'aucune' && <span className="pl-help">Sans pendule, les cartes liées au temps ne sont pas proposées.</span>}
              </fieldset>

              {!quick && (
                <fieldset className="pl-field">
                  <legend className="label">Votre couleur</legend>
                  <div className="segmented" role="radiogroup" aria-label="Votre couleur">
                    <button type="button" role="radio" aria-checked={color === 'w'} className={color === 'w' ? 'on' : ''} onClick={() => setColor('w')}>
                      Blancs
                    </button>
                    <button type="button" role="radio" aria-checked={color === 'random'} className={color === 'random' ? 'on' : ''} onClick={() => setColor('random')}>
                      Au hasard
                    </button>
                    <button type="button" role="radio" aria-checked={color === 'b'} className={color === 'b' ? 'on' : ''} onClick={() => setColor('b')}>
                      Noirs
                    </button>
                  </div>
                </fieldset>
              )}

              {!me && mode !== 'ranked' && (
                <div className="field">
                  <label htmlFor="pl-pseudo">{needsName ? 'Votre pseudo' : 'Votre pseudo (facultatif)'}</label>
                  <input id="pl-pseudo" className="input" maxLength={GUEST_NAME.max} value={name} onChange={e => setName(e.target.value)} placeholder="Ex. : Fou du roi" autoComplete="nickname" />
                  <span className="pl-help">
                    Pas de compte nécessaire. <Link to="/inscription">En créer un</Link> pour garder votre historique.
                  </span>
                </div>
              )}

              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <button type="submit" className="btn-gold pl-cta" disabled={busy || !guestOk}>
                <span className="btn-shine" />
                <span className="btn-main">{busy ? <Spinner /> : ctaMain}</span>
                <span className="btn-sub">{ctaSub}</span>
                <Arrow />
              </button>
            </form>
          )}
        </section>
      </div>

      {mine.length > 0 && (
        <section className="pl-mine" aria-labelledby="pl-mine-t">
          <p className="kicker">En cours</p>
          <h2 id="pl-mine-t">Vos parties en cours</h2>
          <ul className="pl-games">
            {mine.map(g => (
              <li key={g.id}>
                <Link to={`/partie/${g.id}`} className="pl-game">
                  <b>{g.status === 'waiting' ? 'Invitation en attente' : `Contre ${g.opponent ?? '…'}`}</b>
                  <small>
                    {modeLabel(g.mode as GameMode, !!g.rated)} · {tcLabel(g.tc)}
                    {g.catalog ? ` · ${catName(g.catalog)}` : ''}
                  </small>
                  <span className="pl-go">{g.status === 'waiting' ? 'Ouvrir' : 'Reprendre'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function QueueWaiting({ tc, since, players, ranked, catalog, onCancel }: { tc: string; since: number; players: number; ranked: boolean; catalog: Catalog; onCancel: () => void }) {
  const [, force] = useState(0);
  useEffect(() => {
    const i = setInterval(() => force(x => x + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  return (
    <div className="pl-queue" role="status">
      <div className="gp-orbit" aria-hidden="true">
        <span />
      </div>
      <h3>Recherche d’un adversaire…</h3>
      <p>
        {modeLabel('quick', ranked)} · {tcLabel(tc)} · {catName(catalog)} ·{' '}
        <span className="pl-time">{mmss(s)}</span>
      </p>
      <p className="pl-help">
        {ranked ? 'Nous cherchons un joueur de votre niveau ; la tolérance s’élargit avec l’attente.' : 'Le premier joueur disponible à cette cadence, avec les mêmes règles de cartes, vous rejoint.'}
        {players > 1 ? ` ${players} joueurs en file.` : ''}
      </p>
      <button type="button" className="btn-line" onClick={onCancel}>
        Annuler la recherche
      </button>
    </div>
  );
}
