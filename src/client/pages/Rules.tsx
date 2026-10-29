// Règles du jeu et encyclopédie des cartes.
import { Link } from 'react-router-dom';
import { CARD_IDS, CARDS } from '../../shared/cards';
import { SpellCard } from '../components/SpellCard';

export default function Rules() {
  return (
    <div className="container page">
      <span className="eyebrow">Le grimoire</span>
      <h1 className="page-title">Règles et cartes</h1>
      <p className="page-sub">Spellmate, ce sont les échecs que vous connaissez, plus une poignée de sorts. Voici tout ce qu’il faut savoir.</p>

      <div className="rules-grid">
        <div className="panel panel-pad prose">
          <h2 style={{ marginTop: 0 }}>Les règles en 6 points</h2>
          <ol className="rules-list">
            <li><b>Une partie d’échecs normale.</b> Toutes les règles officielles s’appliquent : roque, prise en passant, promotion, pat, triple répétition, règle des 50 coups.</li>
            <li><b>Trois cartes chacun.</b> En début de partie, chaque joueur reçoit trois cartes différentes tirées au hasard. Celles de l’adversaire restent cachées jusqu’à ce qu’il les joue. En mode miroir, les deux joueurs ont la même main.</li>
            <li><b>Une carte par tour, avant le coup.</b> À votre tour, vous pouvez lancer une carte, puis vous jouez votre coup normalement. Chaque carte ne sert qu’une fois.</li>
            <li><b>Pas d’échec par magie.</b> Une carte ne peut pas mettre le roi adverse en échec directement (sauf en préparant votre coup), et vous devez toujours avoir un coup légal après l’avoir jouée.</li>
            <li><b>Les cartes peuvent sauver du mat.</b> Si vous n’avez plus de coup légal mais qu’une carte change la situation, la partie continue : vous devez la jouer. Sinon, c’est mat ou pat.</li>
            <li><b>Durée des effets.</b> La plupart des effets durent un nombre de coups de l’adversaire, affiché par des pastilles. Un effet qui disparaît ne peut jamais laisser votre roi en échec après votre propre coup.</li>
          </ol>
          <h3>Bon à savoir</h3>
          <ul>
            <li>Les pièces gelées ne protègent plus les autres pièces : le roi adverse peut s’en approcher.</li>
            <li>Le Mur de glace bloque aussi le roque si une case du trajet est gelée.</li>
            <li>Après un Retour arrière, l’adversaire rejoue sans pouvoir refaire le même coup ; il garde le temps qu’il avait dépensé.</li>
            <li>En pendule, la partie démarre après le premier coup de chaque joueur. Sans coup dans les 45 secondes, elle est annulée.</li>
          </ul>
          <div className="row" style={{ marginTop: 24 }}>
            <Link to="/jouer?mode=bot" className="btn btn-primary">S’entraîner contre l’IA</Link>
          </div>
        </div>
        <div className="rules-cards">
          {CARD_IDS.map(id => (
            <div key={id} className="rule-card panel">
              <SpellCard id={id} size="mini" tilt={false} />
              <div>
                <h3>{CARDS[id].name}</h3>
                <p className="muted">{CARDS[id].description}</p>
                <div className="row" style={{ gap: 6 }}>
                  <span className="badge">{CARDS[id].duration}</span>
                  {CARDS[id].timedOnly && <span className="badge cyan">Parties avec pendule</span>}
                  {CARDS[id].targets > 0 && <span className="badge">{CARDS[id].targets === 2 ? '2 cibles' : '1 cible'}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
