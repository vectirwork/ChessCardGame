// Règles du jeu et grimoire des pouvoirs (route /cartes), au langage de l'Odyssée.
// Les règles des cartes viennent de src/shared/cards.ts (règle exacte, durée, rareté, famille) : la page suit le
// moteur sans recopier les textes. Le Duel (ancien catalogue) n'est pas présenté. Styles : Rules.css (préfixe rg-).
// Les phrases chiffrées (cartes par main et par tour, durée du choix, contraintes du tirage, nombre de pouvoirs, frise
// de la Trêve) sont tirées des règles des nouvelles parties (GAME_RULES, DEAL) et de CARDS, une fois, au chargement.
// La marque vient de __SM__.marque (BRAND.name figé au build) et la règle du coup remplacé est écrite ici comme
// cardEndsTurn (rulesCore.ts) : importer BRAND ou le noyau des règles ajouterait des morceaux à la page et au paquet
// principal (table de préchargement).
import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { CARDS, CATALOGS, FAMILY_LABEL, RARITY_LABEL, cardsOf } from '../../shared/cards';
import type { CardDef, Catalog, Family } from '../../shared/cards';
import { DEAL, GAME_RULES } from '../../shared/config/rules';
import { cap, enLettres, liste, ordinal, pluriel } from '../../shared/text/fr';
import {
  cartesChacun, cartesDePouvoir, cartesDuCatalogue, constitutionMains, dureeChoix, dureeEffet, limitesMain, pouvoirs, premierApres,
  prochainTour, regle50, repetition, sortAuPlus, sortParTour,
} from '../../shared/text/regles';
import { SpellCard } from '../components/SpellCard';
import { CardScene, scenePaired } from '../components/CardScene';
import { PageHead, PlacePage, useTitle } from './PageScene';
import './Rules.css';

/** Le jeu décrit : règles des nouvelles parties. */
const R = GAME_RULES;
/** Pouvoirs présentés : le catalogue par défaut, sans les cartes retirées du jeu. */
const POWERS = cardsOf('climats').filter(id => !CARDS[id].retired);
const DEFS = POWERS.map(id => CARDS[id]);
const N = POWERS.length;
const famCount = (['climat', 'terrain', 'evenement'] as const).filter(f => DEFS.some(d => d.family === f)).length;

/** Nom d'une carte avec son article : « le Mur de glace », « la Faille », « l’Ère glaciaire ». */
function withArticle(def: CardDef): string {
  return /^[aeiouyàâéèêëîïôûùœ]/i.test(def.name) ? `l’${def.name}` : `${def.genre === 'f' ? 'la' : 'le'} ${def.name}`;
}
/** « Le Mur de glace et la Faille » (en tête de phrase). */
const names = (defs: CardDef[]) => cap(liste(defs.map(withArticle)));

const TERRAINS = DEFS.filter(d => d.family === 'terrain');
const RITUALS = DEFS.filter(d => d.ritual);
const PERMANENTS = DEFS.filter(d => d.permanent);

/** « Entre humains, avec pendule » : où une carte est proposée, si elle ne l'est pas partout. */
function restriction(def: CardDef): string | null {
  if (def.humanOnly && def.timedOnly) return 'Entre humains, avec pendule';
  if (def.humanOnly) return 'Entre humains';
  if (def.timedOnly) return 'Avec pendule';
  return null;
}

/** « Le Sablier fou n’est proposé qu’entre humains, dans les parties avec pendule. », une phrase par condition. */
function restrictedCards(defs: CardDef[]): string[] {
  const groups = new Map<string, CardDef[]>();
  for (const d of defs.filter(x => x.humanOnly || x.timedOnly)) {
    const k = `${!!d.humanOnly}${!!d.timedOnly}`;
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  return [...groups.values()].map(g => {
    const fem = g.every(d => d.genre === 'f');
    const verb = g.length > 1 ? `ne sont proposé${fem ? 'es' : 's'}` : `n’est proposé${fem ? 'e' : ''}`;
    const where = g[0].humanOnly && g[0].timedOnly ? 'qu’entre humains, dans les parties avec pendule' : g[0].humanOnly ? 'qu’entre humains' : 'que dans les parties avec pendule';
    return `${names(g)} ${verb} ${where}.`;
  });
}

const n = R.cardsPerPlayer;
/** Contraintes du tirage qui jouent dans la réserve des pouvoirs (limitesMain : au plus N Climats par main). */
const LIMITS = limitesMain(DEFS);

const ESSENTIALS: { title: string; text: ReactNode }[] = [
  {
    title: 'Les échecs, tels quels',
    text: `Toutes les règles officielles s’appliquent : roque, prise en passant, promotion, pat, ${repetition(R)}, ${regle50(R)}. On gagne par mat, au temps ou par abandon.`,
  },
  {
    title: `${cartesChacun(R, true)}, à découvert`,
    text: DEAL.draft
      ? `Au début d’une partie, ${constitutionMains(R)}. Votre choix reste secret jusqu’à ce que votre adversaire ait choisi, puis les deux mains restent visibles de tous jusqu’à la fin ; une carte jouée reste à sa place, grisée.`
      : `Au début d’une partie, ${constitutionMains(R)}. Les deux mains restent visibles de tous jusqu’à la fin ; une carte jouée reste à sa place, grisée.`,
  },
  {
    title: R.cardEndsTurn ? sortParTour(R, true) : `${sortParTour(R, true)}, avant votre coup`,
    text: R.cardEndsTurn
      ? 'À votre tour, vous pouvez lancer une carte à la place de votre coup. Chaque carte ne sert qu’une fois.'
      : `À votre tour, vous pouvez lancer ${R.cardsPerTurn === 1 ? 'une carte' : `jusqu’à ${enLettres(R.cardsPerTurn, 'f')} cartes`}, puis vous jouez votre coup. Chaque carte ne sert qu’une fois.${RITUALS.length ? ' Seule exception : un Rituel remplace votre coup.' : ''}`,
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

/** Coups de l'adversaire entre l'annonce d'un Présage et son arrivée (un au délai de 2 demi-coups). */
const replies = Math.max(1, Math.round(R.presageDelay / 2));

const TEMPO: { key: string; family: string; text: string }[] = [
  {
    key: 'Présage',
    family: 'Climats',
    text: `Le sort est annoncé avant votre coup et arrive au début de ${R.presageDelay === 2 ? 'votre tour suivant' : prochainTour(R.presageDelay)}. En attendant, il est affiché pour tous : l’adversaire a toujours ${enLettres(replies)} ${pluriel(replies, 'coup')} pour s’y préparer.`,
  },
  ...(TERRAINS.length
    ? [{
        key: 'Tout de suite',
        family: 'Terrains',
        text: R.cardEndsTurn
          ? `${names(TERRAINS)} ${TERRAINS.length > 1 ? 'agissent' : 'agit'} dès le lancement, à la place de votre coup : l’adversaire joue déjà sur le terrain transformé.`
          : `${names(TERRAINS)} ${TERRAINS.length > 1 ? 'agissent' : 'agit'} dès le lancement, avant votre coup : vous jouez déjà sur le terrain transformé.`,
      }]
    : []),
  ...(RITUALS.length
    ? [{
        key: 'Rituel',
        family: 'Événement',
        text: RITUALS.length === 1
          ? `${names(RITUALS)} est votre coup : ${RITUALS[0].genre === 'f' ? 'elle' : 'il'} termine votre tour, et l’adversaire profite le premier de la nouvelle position.`
          : `Un Rituel (${liste(RITUALS.map(withArticle))}) est votre coup : il termine votre tour, et l’adversaire profite le premier de la nouvelle position.`,
      }]
    : []),
  {
    key: 'Durée en coups',
    family: 'Tous les effets',
    text: `Un coup, c’est le coup d’un seul joueur : « ${dureeEffet(4)} ». Le compte part de l’arrivée de l’effet et le plateau affiche les coups restants.${
      PERMANENTS.length === 1
        ? ` ${names(PERMANENTS)}, ${PERMANENTS[0].genre === 'f' ? 'elle' : 'lui'}, reste jusqu’à la fin de la partie.`
        : PERMANENTS.length > 1 ? ` ${names(PERMANENTS)} restent jusqu’à la fin de la partie.` : ''
    }`,
  },
];

// Frise de la Trêve : l'annonce (délai du Présage), les coups de l'effet, puis la reprise des captures.
type Phase = 'pre' | 'on' | 'off';
const TRUCE = CARDS.truce;
const TRUCE_COUPS = TRUCE.coups ?? 0;
const she = TRUCE.genre === 'f' ? 'Elle' : 'Il';
const TIMELINE: { who: 'Vous' | 'Adversaire'; act: string; state: string; phase: Phase }[] = [
  ...Array.from({ length: R.presageDelay }, (_, i) => {
    const me = i % 2 === 0;
    const act = i === 0 ? `Vous lancez ${withArticle(TRUCE)}, puis vous jouez.` : me ? 'Vous jouez.' : i === 1 ? `Il répond : il ${TRUCE.genre === 'f' ? 'la' : 'le'} voit venir.` : 'Il joue.';
    return { who: me ? 'Vous' : 'Adversaire', act, state: i === R.presageDelay - 1 ? 'Arrive au coup suivant' : 'Annoncée', phase: 'pre' } as const;
  }),
  ...Array.from({ length: TRUCE_COUPS }, (_, i) => {
    const me = i % 2 === 0;
    const act = i === 0 ? `${she} arrive : vous jouez sans capturer.` : me ? 'Vous jouez sans capturer.' : 'Il joue sans capturer.';
    return { who: me ? 'Vous' : 'Adversaire', act, state: `${ordinal(i + 1)} coup sur ${TRUCE_COUPS}`, phase: 'on' } as const;
  }),
  premierApres(TRUCE_COUPS) === 'vous'
    ? { who: 'Vous', act: 'Vous pouvez capturer le premier.', state: 'Terminée', phase: 'off' }
    : { who: 'Adversaire', act: 'Il peut capturer le premier.', state: 'Terminée', phase: 'off' },
];
/** Colonnes d'une grille de Rules.css, posées seulement si elles diffèrent de la valeur de la feuille. */
const cols = (count: number, css: number): CSSProperties | undefined => (count === css ? undefined : ({ '--n': count } as CSSProperties));

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
    DEAL.draft
      ? `${cartesChacun(R, true)}, ${pluriel(n, ['choisie', 'choisies'])} parmi les ${pouvoirs(N)} au début de la partie.`
      : `${cartesChacun(R, true)}, ${pluriel(n, ['tirée', 'tirées'])} au hasard parmi les ${pouvoirs(N)}.`,
    'Les deux mains visibles, du premier au dernier coup.',
    sortAuPlus(R),
  ],
  aucune: ['Les règles officielles, sans aucune carte.', 'Pour s’échauffer, travailler une ouverture ou jouer à l’ancienne.'],
};

const DETAILS: ReactNode[] = [
  'Le roi est hors d’atteinte des pouvoirs : aucun effet ne le déplace, ne le gèle ni ne le détruit.',
  'Votre roi doit être à l’abri après votre coup, avec les effets tels qu’ils seront alors : l’arrivée d’un Climat ou la fermeture d’une Faille comptent déjà. Celui qui répond à un Présage se prépare donc au monde qui arrive.',
  'Un Climat ne sauve jamais du mat : il arrive trop tard. Le Mur de glace, la Faille ou la Grande Marée le peuvent.',
  ...restrictedCards(DEFS),
  DEAL.draft
    ? `Le choix des cartes dure ${dureeChoix()} : ${n === 1 ? 'une carte' : `${enLettres(n, 'f')} cartes différentes`} parmi les ${pouvoirs(N)}, ${DEAL.limitsInDraft && LIMITS ? `avec ${LIMITS}` : 'sans autre contrainte'}. Si le temps s’écoule, ${n === 1 ? 'elle est tirée' : 'celles qui vous manquent sont tirées'} au hasard. Sur l’accueil, le tirage favorise les cartes les moins rares${LIMITS ? `, avec ${LIMITS}` : ''}.`
    : `Les cartes sont tirées au hasard : le tirage favorise les cartes les moins rares${LIMITS ? `, avec ${LIMITS}` : ''}.`,
  'Les animations des sorts ne vous coûtent pas de temps à la pendule.',
  'Pré-coups : pendant que votre adversaire réfléchit, jouez déjà vos coups suivants, autant que vous voulez. Ils apparaissent en fantômes numérotés et se jouent d’eux-mêmes, dans l’ordre ; si l’un n’est plus possible, tous s’annulent. Clic droit (ou toucher une case vide) pour les annuler. Les cartes, elles, ne se préparent pas.',
  <>
    {`Pour choisir ${DEAL.draft ? 'vos cartes et votre adversaire' : 'votre adversaire'}, passez par la page `}
    <Link to="/jouer">Jouer</Link>.
  </>,
];

/** Arrivée d'un pouvoir : « Au prochain tour (annoncée) » (délai du Présage), « Immédiate ». */
const PRESAGE_ARRIVAL = `${prochainTour(R.presageDelay).replace(/^votre /, 'Au ')} (annoncée)`;
function arrival(def: CardDef) {
  return def.presage ? PRESAGE_ARRIVAL : 'Immédiate';
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
  // La scène du pouvoir est une image fixe ; elle s'anime quand la souris passe sur sa fiche (ou au toucher)
  const [hover, setHover] = useState(false);
  const paired = scenePaired(def.id);
  return (
    <article
      className="rg-power"
      style={{ '--h': def.hue } as CSSProperties}
      aria-labelledby={`rg-${def.id}`}
      onPointerEnter={e => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={e => e.pointerType === 'mouse' && setHover(false)}
    >
      <div className="rg-pcard">
        <SpellCard id={def.id} size="hand" />
      </div>
      <header className="rg-phead">
        <h4 className="rg-pname" id={`rg-${def.id}`}>
          {def.name}
        </h4>
        <p className="rg-ptag">{def.tagline}</p>
      </header>
      <div className="rg-prule">
        {!paired && (
          <div className="rg-pscene">
            <CardScene id={def.id} play="hover" active={hover} />
          </div>
        )}
        {def.description}
        {paired && (
          <div className="rg-pscene is-pair">
            <CardScene id={def.id} play="hover" active={hover} labels />
          </div>
        )}
      </div>
      <dl className="rg-pmeta">
        <div>
          <dt>Arrivée</dt>
          <dd>{arrival(def)}</dd>
        </div>
        <div>
          <dt>Votre coup</dt>
          <dd>{def.ritual || R.cardEndsTurn ? 'Remplacé par la carte' : 'Joué en plus'}</dd>
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
      {restriction(def) && <p className="rg-pnote">{restriction(def)}</p>}
    </article>
  );
}

/** « Deux formules » : les catalogues proposés. */
const FORMULAS = `${cap(enLettres(CATALOGS.length, 'f'))} ${pluriel(CATALOGS.length, 'formule')}`;

export default function Rules() {
  useTitle('Règles et cartes');
  return (
    <PlacePage place="observatoire" className="rg">
      <PageHead
        place="Le Grimoire"
        aside="Règles et cartes"
        title={
          <>
            Les échecs, <em>{`et ${pouvoirs(N)}`}</em>
          </>
        }
        lede={`${__SM__.marque}, ce sont les échecs que vous connaissez, plus ${cartesDePouvoir(R)} chacun. Les deux mains sont visibles, et chaque pouvoir change la partie pour les deux camps.`}
      >
        <nav className="rg-toc" aria-label="Sur cette page">
          <a href="#essentiel">L’essentiel</a>
          <a href="#temps">Le temps des sorts</a>
          <a href="#pouvoirs">{`Les ${pouvoirs(N)}`}</a>
          <a href="#formules">{FORMULAS}</a>
        </nav>
      </PageHead>

      <section id="essentiel" className="rg-sec" aria-labelledby="rg-essentiel">
        <SectionHead id="rg-essentiel" n="I" kicker="L’essentiel" title={`${cap(enLettres(ESSENTIALS.length, 'f'))} ${pluriel(ESSENTIALS.length, 'règle')}, rien de plus`} />
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
        <div className="rg-tempo" style={cols(TEMPO.length, 4)}>
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
            <b>{`Exemple : ${withArticle(TRUCE)}`}</b>
            {`, un ${FAMILY_LABEL[TRUCE.family]} de ${dureeEffet(TRUCE_COUPS)}. Aucune capture n’est permise pendant ${TRUCE_COUPS === 1 ? 'ce coup' : `ces ${enLettres(TRUCE_COUPS)} coups`}, sauf pour sortir d’un échec.`}
          </figcaption>
          <ol style={cols(TIMELINE.length, 6)}>
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
          kicker={`Les ${pouvoirs(N)}`}
          title={
            <>
              {`${cap(enLettres(famCount, 'f'))} ${pluriel(famCount, 'famille')}, `}
              <em>{cartesDuCatalogue(N)}</em>
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
          kicker={FORMULAS}
          title={
            <>
              Avec les pouvoirs, <em>ou sans</em>
            </>
          }
          lede="La formule se choisit avant la partie, dans les options de l’accueil ou sur la page Jouer."
        />
        <div className="rg-formulas" style={cols(CATALOGS.length, 2)}>
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
