// Page d'accueil : démonstration en direct, cartes, skins, FAQ.
import { Suspense, lazy, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { CARD_IDS } from '../../shared/cards';
import { ITEMS } from '../../shared/catalog';
import { Modal, Spinner } from '../components/Layout';
import { SpellCard } from '../components/SpellCard';
import { api } from '../api';

const DemoBoard = lazy(() => import('../components/DemoBoard').then(m => ({ default: m.DemoBoard })));

export function Home() {
  const [caption, setCaption] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [stats, setStats] = useState<{ players: number; games: number } | null>(null);
  useEffect(() => {
    api<{ players: number; games: number }>('/stats').then(setStats).catch(() => undefined);
  }, []);
  const skins = ITEMS.filter(i => i.kind === 'skin');

  return (
    <div className="home">
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">✦ Les échecs, version magique</span>
            <h1 className="hero-title display">
              Les échecs ont désormais <span className="gradient-text">des pouvoirs.</span>
            </h1>
            <p className="hero-sub">
              Une vraie partie d’échecs… avec trois cartes de pouvoir dans ta manche. Gèle la dame adverse, fais tomber la foudre sur un pion,
              annule le dernier coup de ton rival. Chaque sort se déclenche dans une explosion d’effets 3D.
            </p>
            <div className="row wrap" style={{ gap: 12 }}>
              <Link to="/jouer" className="btn btn-primary btn-lg">Jouer gratuitement</Link>
              <Link to="/jouer?mode=invite" className="btn btn-arcane btn-lg">Défier un ami</Link>
            </div>
            <div className="hero-points">
              <span>✓ Sans inscription pour jouer avec un ami</span>
              <span>✓ IA à 3 niveaux</span>
              <span>✓ Zéro pay-to-win</span>
            </div>
            {stats && stats.games >= 100 && (
              <div className="hero-stats">
                <div><b>{stats.players.toLocaleString('fr-FR')}</b><span>joueurs</span></div>
                <div><b>{stats.games.toLocaleString('fr-FR')}</b><span>parties jouées</span></div>
              </div>
            )}
          </div>
          <div className="hero-board">
            <div className="hero-glow" />
            <div className="hero-fan" aria-hidden="true">
              <SpellCard id="lightning" size="hand" tilt={false} />
              <SpellCard id="rewind" size="hand" tilt={false} />
              <SpellCard id="ice_wall" size="hand" tilt={false} />
            </div>
            <div className="hero-board-inner">
              <Suspense fallback={<div className="board-skeleton"><Spinner /></div>}>
                <DemoBoard onCaption={setCaption} />
              </Suspense>
            </div>
            <div className="hero-caption" aria-live="polite">{caption || 'Démonstration en direct'}</div>
          </div>
        </div>
      </section>

      <section className="container section">
        <div className="steps">
          {[
            ['♟', 'Une vraie partie d’échecs', 'Toutes les règles classiques : roque, prise en passant, promotion, pendule. Votre talent reste votre meilleure arme.'],
            ['🂠', 'Trois cartes de pouvoir', 'Chaque joueur reçoit trois sorts au hasard, cachés à l’adversaire. Utilisez-les au bon moment : ils ne servent qu’une fois.'],
            ['✦', 'Un sort par tour', 'Avant votre coup, lancez une carte. Elle ne remplace pas votre coup : elle le prépare. Et parfois, elle vous sauve du mat.'],
          ].map(([icon, title, text]) => (
            <div key={title} className="step panel panel-pad">
              <div className="step-icon">{icon}</div>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section cards-section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Le grimoire</span>
            <h2 className="section-title">11 cartes, 11 façons de renverser la partie</h2>
            <p className="muted">Survolez une carte pour l’examiner de plus près.</p>
          </div>
        </div>
        <div className="card-river">
          {CARD_IDS.map(id => (
            <SpellCard key={id} id={id} />
          ))}
        </div>
        <div className="center" style={{ marginTop: 26 }}>
          <Link to="/cartes" className="btn">Lire toutes les règles</Link>
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <span className="eyebrow">Skins d’animation</span>
          <h2 className="section-title">Vos sorts, votre style</h2>
          <p className="muted">Votre adversaire voit vos effets avec votre skin. Faites-lui de l’effet.</p>
        </div>
        <div className="skin-grid">
          {skins.map(s => (
            <button key={s.id} className="skin-tile" style={{ '--p': s.skin!.primary, '--s': s.skin!.secondary } as CSSProperties} onClick={() => setPreview(s.id)}>
              <div className="skin-orb" />
              <div className="skin-name">{s.name}</div>
              <div className="skin-desc">{s.description}</div>
              <span className="skin-cta">{s.free ? 'Offert · voir' : 'Voir en action'} ▸</span>
            </button>
          ))}
        </div>
      </section>

      <section className="container section">
        <div className="grid-3">
          <div className="feature panel panel-pad">
            <div className="feature-icon">🔗</div>
            <h3>Un lien, une partie</h3>
            <p className="muted">Créez une partie, envoyez le lien. Votre ami joue en un clic, sans compte, sur ordinateur ou mobile.</p>
            <Link to="/jouer?mode=invite">Inviter un ami →</Link>
          </div>
          <div className="feature panel panel-pad">
            <div className="feature-icon">🤖</div>
            <h3>Une IA qui joue aussi ses cartes</h3>
            <p className="muted">Apprenti, Sorcier ou Archimage : entraînez-vous contre une IA qui calcule et sait garder ses sorts pour le bon moment.</p>
            <Link to="/jouer?mode=bot">Affronter l’IA →</Link>
          </div>
          <div className="feature panel panel-pad">
            <div className="feature-icon">🏆</div>
            <h3>Parties classées</h3>
            <p className="muted">Créez un compte pour jouer en classé, grimper au classement Elo et garder l’historique de vos parties.</p>
            <Link to="/classement">Voir le classement →</Link>
          </div>
        </div>
      </section>

      <section className="container section">
        <div className="fair panel panel-pad">
          <div>
            <span className="eyebrow">Promesse</span>
            <h2 className="section-title" style={{ marginTop: 8 }}>Gratuit. Juste. Pour toujours.</h2>
            <p className="muted" style={{ maxWidth: 640 }}>
              Toutes les cartes, tous les modes de jeu et le classement sont gratuits. La boutique ne vend que de l’apparence :
              des skins d’animation et des plateaux. Aucun achat ne donne d’avantage en partie.
            </p>
          </div>
          <Link to="/boutique" className="btn btn-primary btn-lg">Découvrir la boutique</Link>
        </div>
      </section>

      <section className="container narrow section">
        <div className="section-head">
          <h2 className="section-title">Questions fréquentes</h2>
        </div>
        <div className="faq">
          {[
            ['Faut-il un compte pour jouer ?', 'Non. Vous pouvez jouer contre l’IA ou rejoindre une invitation sans compte, avec un simple pseudo. Un compte gratuit permet de jouer en classé, de garder votre historique et d’acheter des skins.'],
            ['Quand peut-on jouer une carte ?', 'À votre tour, avant votre coup, une carte au maximum par tour. La carte ne remplace pas votre coup. Elle ne peut pas mettre le roi adverse en échec directement, et vous devez toujours avoir un coup légal ensuite.'],
            ['Les cartes peuvent-elles empêcher un mat ?', 'Oui ! Si vous n’avez plus aucun coup légal mais qu’une carte peut vous sauver (geler la pièce qui donne échec, dresser un mur de glace…), la partie continue : jouez-la.'],
            ['Est-ce que les skins donnent un avantage ?', 'Jamais. Les skins changent uniquement l’apparence des effets et du plateau.'],
            ['Sur quels appareils peut-on jouer ?', 'Sur tout navigateur récent : ordinateur, tablette et mobile. Rien à installer.'],
          ].map(([q, a]) => (
            <details key={q} className="faq-item">
              <summary>{q}</summary>
              <p className="muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="container section">
        <div className="final-cta">
          <h2 className="display">Prêt à lancer votre premier sort ?</h2>
          <p className="muted">Une partie dure de 5 à 20 minutes. La première commence maintenant.</p>
          <Link to="/jouer" className="btn btn-primary btn-lg">Jouer maintenant</Link>
        </div>
      </section>

      {preview && (
        <Modal onClose={() => setPreview(null)} wide>
          <SkinPreview skin={preview} />
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <Link to="/boutique" className="btn btn-primary">Voir dans la boutique</Link>
            <button className="btn btn-ghost" onClick={() => setPreview(null)}>Fermer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function SkinPreview({ skin, theme }: { skin?: string; theme?: string }) {
  const [caption, setCaption] = useState('');
  const item = ITEMS.find(i => i.id === (skin ?? theme));
  return (
    <div>
      <h2>{item?.name}</h2>
      <p className="muted" style={{ marginTop: -4 }}>{item?.description}</p>
      <div className="preview-board">
        <Suspense fallback={<div className="board-skeleton"><Spinner /></div>}>
          <DemoBoard mode="preview" skin={skin ?? 'skin:arcane'} theme={theme} onCaption={setCaption} />
        </Suspense>
      </div>
      <div className="hero-caption" style={{ position: 'static', marginTop: 12 }}>{caption || 'Préparation du sort…'}</div>
    </div>
  );
}
