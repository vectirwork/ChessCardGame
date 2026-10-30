// Règles du jeu et grimoire des huit pouvoirs (route /cartes), au langage de l'Odyssée.
// Les règles des cartes viennent de src/shared/cards.ts (règle exacte, durée, rareté, famille) : la page suit le
// moteur sans recopier les textes. Le Duel (ancien catalogue) n'est pas présenté. Styles : Rules.css (préfixe rg-).
import { Link } from 'react-router-dom';
import type { CSSProperties, ReactNode } from 'react';
import { CARDS, CATALOGS, RARITY_LABEL, cardsOf } from '../../shared/cards';
import type { CardDef, Catalog, Family } from '../../shared/cards';
import { SpellCard } from '../components/SpellCard';
import { PageHead, PlacePage, useTitle } from './PageScene';
import './Rules.css';

const POWERS = cardsOf('climats');

const ESSENTIALS: { title: string; text: ReactNode }[] = [
  {
    title: 'Les échecs, tels quels',
    text: 'Toutes les règles officielles s’appliquent : roque, prise en passant, promotion, pat, triple répétition, règle des 50 coups. On gagne par mat, au temps ou par abandon.',
  },
  {
    title: 'Trois cartes chacun, à découvert',
    text: 'Elles sont tirées au hasard en début de partie : les plus rares sortent moins souvent, et une main compte au plus une Légendaire et deux Climats. Les deux mains restent visibles de tous jusqu’à la fin ; une carte jouée reste à sa place, grisée.',
  },
  {
    title: 'Un sort par tour, avant votre coup',
    text: 'À votre tour, vous pouvez lancer une carte, puis vous jouez votre coup. Chaque carte ne sert qu’une fois. Seule exception : un Rituel remplace votre coup.',
  },
  {
    title: 'Chaque pouvoir touche les deux camps',
    text: 'Aucun sort ne vise l’adversaire : il change une règle, des cases ou le plateau pour tout le monde. Tout l’art est de choisir le moment où ce monde nouveau vous sert davantage.',
  },
  {
    title: 'Pas d’échec par magie',
    text: 'Une carte ne met jamais le roi adverse en échec : c’est votre coup qui le fait. Après votre carte, il doit vous rester un coup légal. Sans coup légal, vous devez jouer une carte qui vous en redonne un, s’il en existe une.',
  },
  {
    title: 'La magie cède',
    text: 'Si les effets vous laissent sans aucun coup alors que vous n’êtes pas en échec, vous jouez ce coup comme s’ils n’existaient pas pour vos pièces. Si votre pièce s’arrête sur un Mur ou une Faille, la case redevient normale. Personne ne passe son tour.',
  },
];

const TEMPO: { key: string; family: string; text: string }[] = [
  {
    key: 'Présage',
    family: 'Climats',
    text: 'Le sort est annoncé avant votre coup et arrive au début de votre tour suivant. En attendant, il est affiché pour tous : l’adversaire a toujours un coup pour s’y préparer.',
  },
  {
    key: 'Tout de suite',
    family: 'Terrains',
    text: 'Le Mur de glace et la Faille agissent dès le lancement, avant votre coup : vous jouez déjà sur le terrain transformé.',
  },
  {
    key: 'Rituel',
    family: 'Événement',
    text: 'La Grande Marée est votre coup : elle termine votre tour, et l’adversaire profite le premier de la nouvelle position.',
  },
  {
    key: 'Durée en coups',
    family: 'Tous les effets',
    text: 'Un coup, c’est le coup d’un seul joueur : « 4 coups (2 chacun) ». Le compte part de l’arrivée de l’effet et le plateau affiche les coups restants. Le Mur de glace, lui, reste jusqu’à la fin de la partie.',
  },
];

type Phase = 'pre' | 'on' | 'off';
const TIMELINE: { who: 'Vous' | 'Adversaire'; act: string; state: string; phase: Phase }[] = [
  { who: 'Vous', act: 'Vous lancez la Trêve, puis vous jouez.', state: 'Annoncée', phase: 'pre' },
  { who: 'Adversaire', act: 'Il répond : il la voit venir.', state: 'Arrive au coup suivant', phase: 'pre' },
  { who: 'Vous', act: 'Elle arrive : vous jouez sans capturer.', state: '1er coup sur 3', phase: 'on' },
  { who: 'Adversaire', act: 'Il joue sans capturer.', state: '2e coup sur 3', phase: 'on' },
  { who: 'Vous', act: 'Vous jouez sans capturer.', state: '3e coup sur 3', phase: 'on' },
  { who: 'Adversaire', act: 'Il peut capturer le premier.', state: 'Terminée', phase: 'off' },
];

const FAMILIES: { id: Exclude<Family, 'duel'>; title: string; when: string; text: string }[] = [
  {
    id: 'climat',
    title: 'Climats',
    when: 'Présage',
    text: 'Une règle change sur tout le plateau. Un seul Climat à la fois : le nouveau remplace l’ancien à son arrivée, et on ne peut pas en annoncer un tant qu’un autre est annoncé.',
  },
  {
    id: 'terrain',
    title: 'Terrains',
    when: 'Tout de suite',
    text: 'Des cases changent pour les deux camps. Les Terrains se cumulent, jamais sur la même case ; une seule Faille à la fois.',
  },
  {
    id: 'evenement',
    title: 'Événement',
    when: 'Rituel',
    text: 'Il agit une fois, à la place de votre coup, et ne laisse aucun effet derrière lui.',
  },
];

const FORMULA_POINTS: Partial<Record<Catalog, string[]>> = {
  climats: [
    'Trois cartes chacun, tirées parmi les huit pouvoirs.',
    'Les deux mains visibles, du premier au dernier coup.',
    'Un sort par tour au plus, toujours facultatif.',
  ],
  aucune: ['Les règles officielles, sans aucune carte.', 'Pour s’échauffer, travailler une ouverture ou jouer à l’ancienne.'],
};

const DETAILS: ReactNode[] = [
  'Le roi est hors d’atteinte des pouvoirs : aucun effet ne le déplace, ne le gèle ni ne le détruit.',
  'Votre roi doit être à l’abri après votre coup, avec les effets tels qu’ils seront alors : l’arrivée d’un Climat ou la fermeture d’une Faille comptent déjà. Celui qui répond à un Présage se prépare donc au monde qui arrive.',
  'Un Climat ne sauve jamais du mat : il arrive trop tard. Le Mur de glace, la Faille ou la Grande Marée le peuvent.',
  'Le Sablier fou n’est distribué qu’entre humains, dans les parties avec pendule.',
  'Les animations des sorts ne vous coûtent pas de temps à la pendule.',
  <>
    Mode miroir : sur la page <Link to="/jouer">Jouer</Link>, vous pouvez recevoir tous les deux les mêmes trois cartes.
  </>,
];

function arrival(def: CardDef) {
  if (def.presage) return 'Votre prochain tour';
  if (def.ritual) return 'À la place du coup';
  return 'Tout de suite';
}

function SectionHead({ id, n, kicker, title, lede }: { id: string; n: string; kicker: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <div className="rg-sh">
      <p className="rg-sk">
        <span className="rg-sn">{n}</span>
        {kicker}
      </p>
      <h2 className="rg-st" id={id}>
        {title}
      </h2>
      {lede && <p className="rg-sl">{lede}</p>}
    </div>
  );
}

function Power({ def }: { def: CardDef }) {
  return (
    <article className="rg-power" style={{ '--h': def.hue } as CSSProperties} aria-labelledby={`rg-${def.id}`}>
      <div className="rg-pcard">
        <SpellCard id={def.id} size="hand" />
      </div>
      <header className="rg-phead">
        <h4 className="rg-pname" id={`rg-${def.id}`}>
          {def.name}
        </h4>
        <p className="rg-ptag">{def.tagline}</p>
      </header>
      <p className="rg-prule">{def.description}</p>
      <dl className="rg-pmeta">
        <div>
          <dt>Arrivée</dt>
          <dd>{arrival(def)}</dd>
        </div>
        <div>
          <dt>Durée</dt>
          <dd>{def.duration}</dd>
        </div>
        <div>
          <dt>Rareté</dt>
          <dd>{RARITY_LABEL[def.rarity]}</dd>
        </div>
      </dl>
      {def.humanOnly && <p className="rg-pnote">Entre humains, avec pendule</p>}
    </article>
  );
}

export default function Rules() {
  useTitle('Règles et cartes');
  return (
    <PlacePage place="observatoire" className="rg">
      <PageHead
        place="Le Grimoire"
        aside="Règles et cartes"
        title={
          <>
            Les échecs, <em>et huit pouvoirs</em>
          </>
        }
        lede="Spellmate, ce sont les échecs que vous connaissez, plus trois cartes de pouvoir chacun. Les deux mains sont visibles, et chaque pouvoir change la partie pour les deux camps."
      >
        <nav className="rg-toc" aria-label="Sur cette page">
          <a href="#essentiel">L’essentiel</a>
          <a href="#temps">Le temps des sorts</a>
          <a href="#pouvoirs">Les huit pouvoirs</a>
          <a href="#formules">Deux formules</a>
        </nav>
      </PageHead>

      <section id="essentiel" className="rg-sec" aria-labelledby="rg-essentiel">
        <SectionHead id="rg-essentiel" n="I" kicker="L’essentiel" title="Six règles, rien de plus" />
        <ol className="rg-rules">
          {ESSENTIALS.map((r, i) => (
            <li key={r.title}>
              <span className="rg-rn" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="rg-rt">{r.title}</h3>
              <p>{r.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="temps" className="rg-sec" aria-labelledby="rg-temps">
        <SectionHead
          id="rg-temps"
          n="II"
          kicker="Le temps des sorts"
          title={
            <>
              Présage, Rituel <em>et durée</em>
            </>
          }
          lede="Un pouvoir ne frappe jamais par surprise : le ciel s’annonce, la terre agit tout de suite, l’événement prend la place du coup."
        />
        <div className="rg-tempo">
          {TEMPO.map(t => (
            <div key={t.key} className="rg-tk">
              <p className="rg-tkk">{t.key}</p>
              <p className="rg-tkf">{t.family}</p>
              <p className="rg-tkt">{t.text}</p>
            </div>
          ))}
        </div>
        <figure className="rg-tl">
          <figcaption>
            <b>Exemple : la Trêve</b>, un Climat de 3 coups (vous, lui, vous). Aucune capture n’est permise pendant ces trois coups,
            sauf pour sortir d’un échec.
          </figcaption>
          <ol>
            {TIMELINE.map((s, i) => (
              <li key={i} className={`rg-step ${s.phase} ${s.who === 'Vous' ? 'me' : 'them'}`}>
                <span className="rg-who">
                  <i aria-hidden="true" />
                  {s.who}
                </span>
                <span className="rg-act">{s.act}</span>
                <span className="rg-bar" aria-hidden="true" />
                <span className="rg-state">{s.state}</span>
              </li>
            ))}
          </ol>
        </figure>
      </section>

      <section id="pouvoirs" className="rg-sec" aria-labelledby="rg-pouvoirs">
        <SectionHead
          id="rg-pouvoirs"
          n="III"
          kicker="Les huit pouvoirs"
          title={
            <>
              Trois familles, <em>huit cartes</em>
            </>
          }
          lede="Voici la règle exacte de chaque carte, telle que la partie l’applique."
        />
        {FAMILIES.map(f => {
          const ids = POWERS.filter(id => CARDS[id].family === f.id);
          if (!ids.length) return null;
          return (
            <div key={f.id} className={`rg-fam fam-${f.id}`}>
              <div className="rg-fhead">
                <div>
                  <h3 className="rg-fname">{f.title}</h3>
                  <span className="rg-fwhen">{f.when}</span>
                </div>
                <p>{f.text}</p>
              </div>
              <div className="rg-powers">
                {ids.map(id => (
                  <Power key={id} def={CARDS[id]} />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section id="formules" className="rg-sec" aria-labelledby="rg-formules">
        <SectionHead
          id="rg-formules"
          n="IV"
          kicker="Deux formules"
          title={
            <>
              Avec les pouvoirs, <em>ou sans</em>
            </>
          }
          lede="La formule se choisit avant la partie, dans les options de l’accueil ou sur la page Jouer."
        />
        <div className="rg-formulas">
          {CATALOGS.map((c, i) => (
            <div key={c.id} className={`rg-formula ${i === 0 ? 'main' : ''}`}>
              <div className="rg-ftop">
                <h3>{c.label}</h3>
                {i === 0 && <span className="badge gold">Par défaut</span>}
              </div>
              <p className="rg-fdesc">{c.description}</p>
              {FORMULA_POINTS[c.id] && (
                <ul>
                  {FORMULA_POINTS[c.id]!.map(p => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <div className="rg-details">
          <h3>Précisions</h3>
          <ul>
            {DETAILS.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>

        <div className="rg-cta">
          <Link to="/" className="btn btn-primary btn-lg">
            Jouer une partie
          </Link>
          <Link to="/apprendre" className="btn btn-ghost">
            Apprendre pas à pas
          </Link>
        </div>
      </section>
    </PlacePage>
  );
}
