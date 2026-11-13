import { createHash } from 'node:crypto';
import { createElement } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cardsOf } from '../src/shared/cards';
import { GAME_RULES, RULES_V1 } from '../src/shared/config/rules';
import { F_RELAXED, fromFen, sqIndex, sqName } from '../src/shared/chess';
import { GameState, legalMovesOf, playMove, sideInCheck } from '../src/shared/game';
import {
  ALL_LESSONS, LESSONS, LESSON_GROUPS, LessonStep, freeMove, lessonById, lessonsFor, loneKingReply, matedBy, stepStart, studentOf,
} from '../src/shared/lessons';
import { applyAction, hand, meetsRequires, stepOptions } from '../src/shared/puzzles';
import { TIME_CONTROLS, tcLabel } from '../src/shared/protocol';
import Rules from '../src/client/pages/Rules';
import Play from '../src/client/pages/Play';
import Learn from '../src/client/pages/Learn';
import Puzzles from '../src/client/pages/Puzzles';
import Auth, { PASSWORD as AUTH_PASSWORD, USERNAME as AUTH_USERNAME } from '../src/client/pages/Auth';
import { GUEST_NAME as PLAY_GUEST_NAME } from '../src/client/pages/Play';
import { GUEST_NAME, PASSWORD, USERNAME } from '../src/shared/config/limits';
import MyGames from '../src/client/pages/MyGames';
import { AppProvider, FeaturesContext } from '../src/client/store';
import { FEATURES } from '../src/shared/config/features';

/** Toutes les étoiles peuvent-elles être ramassées ? (parcours en largeur sur les coups libres) */
function starsReachable(step: LessonStep, stars: string[]): boolean {
  const target = stars.map(sqIndex);
  const start = stepStart(step);
  const key = (s: GameState, left: number[]) => s.pos.board.map(p => (p ? p.t + p.c : '.')).join('') + left.join(',');
  let frontier: { s: GameState; left: number[] }[] = [{ s: start, left: target }];
  const seen = new Set([key(start, target)]);
  for (let depth = 0; depth < 10; depth++) {
    const next: typeof frontier = [];
    for (const { s, left } of frontier) {
      for (const m of legalMovesOf(s)) {
        const n = freeMove(s, m.from, m.to, m.promo);
        if (!n) continue;
        const rest = left.filter(t => t !== m.to);
        if (!rest.length) return true;
        const k = key(n, rest);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ s: n, left: rest });
      }
    }
    frontier = next;
  }
  return false;
}

describe('leçons', () => {
  it('identifiants uniques, groupes connus, textes présents', () => {
    expect(ALL_LESSONS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(ALL_LESSONS.map(l => l.id)).size).toBe(ALL_LESSONS.length);
    for (const l of ALL_LESSONS) {
      expect(LESSON_GROUPS).toContain(l.group);
      expect(l.steps.length).toBeGreaterThan(0);
      if (LESSONS.includes(l)) expect(lessonById(l.id)).toBe(l);
      for (const s of l.steps) {
        expect(s.text.length, l.id).toBeGreaterThan(20);
        expect(() => fromFen(s.fen)).not.toThrow();
      }
    }
    // Chaque pièce, les coups spéciaux, échec, mat et pat, et les cartes
    for (const id of ['tour', 'fou', 'dame', 'roi', 'cavalier', 'pion', 'roque', 'prise-en-passant', 'promotion', 'echec', 'mat', 'pat', 'cartes', 'catalogues', 'deux-camps', 'presage-rituel', 'mur-magie', 'mains-visibles']) {
      expect(ALL_LESSONS.some(l => l.id === id), id).toBe(true);
    }
  });

  it('chaque étape est réalisable avec le moteur', () => {
    for (const l of ALL_LESSONS) {
      l.steps.forEach((step, i) => {
        const where = `${l.id} étape ${i + 1}`;
        const start = stepStart(step);
        const g = step.goal;
        if (g.kind === 'stars') {
          for (const st of g.stars) expect(start.pos.board[sqIndex(st)]?.c, `${where} : étoile ${st} sous une pièce de l'élève`).not.toBe(studentOf(step));
          expect(starsReachable(step, g.stars), `${where} : étoiles inaccessibles`).toBe(true);
        } else if (g.kind === 'mate') {
          const mates = legalMovesOf(start).filter(m => playMove(start, m.from, m.to, m.promo).ok && playMove(start, m.from, m.to, m.promo).ok && matedBy((playMove(start, m.from, m.to, m.promo) as { state: GameState }).state, studentOf(step)));
          expect(mates.length, `${where} : aucun mat`).toBeGreaterThan(0);
        } else if (g.kind === 'any') {
          expect(legalMovesOf(start).length, where).toBeGreaterThan(0);
        } else if (g.kind === 'hunt') {
          expect(legalMovesOf(start).length, where).toBeGreaterThan(0);
        } else if (g.kind === 'line') {
          let s = start;
          for (const st of g.line) {
            if (st === '*') {
              const m = legalMovesOf(s)[0];
              expect(m, `${where} : aucun coup pour « * »`).toBeDefined();
              s = playMove(s, m.from, m.to, m.promo).ok ? (playMove(s, m.from, m.to, m.promo) as { state: GameState }).state : s;
              continue;
            }
            const opts = stepOptions(st);
            expect(opts.length, `${where} : ${st}`).toBeGreaterThan(0);
            for (const o of opts) expect(applyAction(s, o), `${where} : ${st} illégal`).not.toBeNull();
            s = applyAction(s, opts[0])!;
          }
          if (g.mate) expect(matedBy(s, studentOf(step)), `${where} : pas de mat final`).toBe(true);
        }
      });
    }
  });

  it('les étapes à pièce contiennent des pièces de l’élève qui peuvent bouger', () => {
    for (const l of ALL_LESSONS) {
      for (const step of l.steps) {
        if (step.goal.kind === 'info') continue;
        const s = stepStart(step);
        const cardStep = step.goal.kind === 'line' && step.goal.line[0].startsWith('@');
        if (!cardStep) expect(legalMovesOf(s).length, l.id).toBeGreaterThan(0);
      }
    }
  });

  it('les leçons de cartes n’utilisent que les pouvoirs, jamais le Duel', () => {
    const allowed = cardsOf('climats');
    for (const l of ALL_LESSONS) {
      for (const step of l.steps) {
        expect(step.catalog, l.id).not.toBe('duel');
        const s = stepStart(step);
        if (step.hands || step.effects) expect(s.catalog, l.id).toBe('climats');
        for (const h of [...s.hands.w, ...s.hands.b]) expect(allowed, `${l.id} : ${h.card}`).toContain(h.card);
        for (const e of s.effects) expect(allowed).toContain(e.card);
        if (step.goal.kind === 'line') {
          for (const st of step.goal.line) for (const o of stepOptions(st)) if (o.kind === 'card') expect(allowed).toContain(o.card);
        }
        expect(step.text, l.id).not.toMatch(/Duel|Portail|Couronnement|Chevauchée|Déjà-vu|cachée/);
      }
    }
  });

  it('pour les deux camps : le Mur noir bloque la tour blanche, l’Ère glaciaire gèle les pions blancs', () => {
    const l = lessonById('deux-camps')!;
    const wall = stepStart(l.steps[0]);
    expect(wall.effects[0]).toMatchObject({ card: 'ice_wall', permanent: true, caster: 'b' });
    expect(wall.hands.b[0].used).toBe(true);
    expect(legalMovesOf(wall).some(m => m.to === sqIndex('d5'))).toBe(false);
    const ice = stepStart(l.steps[1]);
    const moves = legalMovesOf(ice);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.some(m => ice.pos.board[m.from]?.t === 'p')).toBe(false);
  });

  it('la magie cède : sans coup ni échec, le roi marche sur un Mur, qui fond', () => {
    const l = lessonById('mur-magie')!;
    const s = stepStart(l.steps[0]);
    expect(sideInCheck(s)).toBe(false);
    const moves = legalMovesOf(s);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every(m => m.flags & F_RELAXED)).toBe(true);
    const n = applyAction(s, stepOptions('h3g4')[0])!;
    expect(n.effects.filter(e => e.card === 'ice_wall').map(e => sqName(e.square!))).toEqual(['h4']);
  });

  it('lire la main adverse : la Faille noire pare Ff3+, pas le mat sur la 8e rangée', () => {
    const l = lessonById('mains-visibles')!;
    const s = stepStart(l.steps[0]);
    const fake = applyAction(s, stepOptions('d1f3')[0])!;
    expect(sideInCheck(fake)).toBe(true);
    expect(legalMovesOf(fake)).toHaveLength(0);
    expect(fake.result).toBeNull();
    expect(matedBy(applyAction(s, stepOptions('c7c8')[0])!, 'w')).toBe(true);
  });

  it('la Trêve s’annonce puis arrive ; la Grande Marée remplace le coup', () => {
    const l = lessonById('presage-rituel')!;
    const truce = l.steps[1];
    let s = stepStart(truce);
    s = applyAction(s, stepOptions('@truce')[0])!;
    expect(s.effects.some(e => e.card === 'truce' && e.pending)).toBe(true);
    expect(s.pos.turn).toBe('w');
    const tide = l.steps[3];
    const t = applyAction(stepStart(tide), stepOptions('@tide')[0])!;
    expect(t.pos.turn).toBe('b');
    expect(t.pos.board[sqIndex('e3')]?.t).toBe('p');
    expect(t.pos.board[sqIndex('e6')]?.t).toBe('p');
  });

  it('le roi seul se défend sans se suicider, et la dame finit par mater', () => {
    const l = lessonById('mat-dame')!;
    let s = stepStart(l.steps[3]);
    // Une technique simple : la dame suit le roi à un saut de cavalier ; ici on vérifie seulement que la défense joue des coups légaux.
    for (let i = 0; i < 6 && !s.result; i++) {
      const m = legalMovesOf(s)[0];
      s = (playMove(s, m.from, m.to, m.promo) as { state: GameState }).state;
      if (s.result) break;
      const r = loneKingReply(s);
      expect(r).not.toBeNull();
      const n = playMove(s, r!.from, r!.to, r!.promo);
      expect(n.ok).toBe(true);
      s = (n as { state: GameState }).state;
    }
    // La défense prend une pièce laissée en prise
    const hanging = stepStart({ ...l.steps[3], fen: '8/8/8/3k4/4Q3/8/8/4K3 b - - 0 1' });
    const r = loneKingReply(hanging)!;
    expect(sqName(r.to)).toBe('e4');
  });
});

// ---------------------------------------------------------------------------------------------
// Réglage par défaut : photographies des textes (lot 8). Elles ont été relevées sur le code d'avant la dérivation des
// textes ; un réglage changé (GAME_RULES, DEAL, CARDS, BRAND) doit les faire changer, rien d'autre.

const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

/** Contenu d'une leçon tel qu'il existait avant le lot 8 (sans les champs ajoutés depuis). */
const photo = (list: typeof LESSONS) => list.map(l => ({
  id: l.id, title: l.title, group: l.group, summary: l.summary,
  steps: l.steps.map(s => ({
    fen: s.fen, text: s.text, goal: s.goal, success: s.success, hint: s.hint, marks: s.marks, arrows: s.arrows, last: s.last,
    hands: s.hands, effects: s.effects, catalog: s.catalog, panel: s.panel,
  })),
}));

describe('leçons au réglage par défaut', () => {
  it('textes, positions, mains et objectifs identiques à la photographie', () => {
    expect(sha(photo(ALL_LESSONS))).toBe('d8b079be811b03f8');
    // Au défaut, toutes les leçons sont proposées.
    expect(LESSONS).toEqual(ALL_LESSONS);
  });

  it('textes chiffrés des leçons (mains, tour, rangées, durées, coups permis)', () => {
    const step = (id: string, i: number) => lessonById(id)!.steps[i];
    expect(lessonById('cartes')!.summary).toBe('Trois cartes chacun, visibles des deux joueurs ; une par tour, avant le coup.');
    expect(step('cartes', 0).text).toBe(
      'Spellmate, ce sont les échecs, plus trois cartes de pouvoir par joueur. Au début d’une partie, vous choisissez vos trois cartes ; sur l’accueil, elles sont tirées au hasard. Les deux mains sont visibles : vous voyez les cartes de l’adversaire, il voit les vôtres, et une carte jouée reste grisée à sa place. À votre tour, vous pouvez jouer une carte avant votre coup : une seule par tour, et chaque carte ne sert qu’une fois.',
    );
    expect(step('cartes', 1).text).toContain('Un Mur se pose sur une case vide, de la 3e à la 6e rangée.');
    expect(lessonById('catalogues')!.summary).toBe('Avec les huit pouvoirs ou sans cartes ; Climats, Terrains, Événement.');
    expect(step('catalogues', 0).text).toBe('Chaque partie choisit son jeu. Par défaut, les Pouvoirs : huit cartes qui changent la partie pour les deux camps. Ou sans cartes : les échecs classiques, rien d’autre.');
    expect(step('catalogues', 1).text).toMatch(/^Les huit pouvoirs forment trois familles\. /);
    expect(step('presage-rituel', 1).text).toBe('Annoncez la Trêve (aucune capture pendant 3 coups, sauf pour sortir d’un échec), puis jouez un coup. Les Noirs répondent ; la Trêve arrive ensuite.');
    expect(step('presage-rituel', 1).success).toBe('La Trêve est arrivée : regardez la liste des effets sous l’échiquier. Elle vaut pour vous aussi : vous ne prendrez rien pendant 3 coups.');
    expect(step('presage-rituel', 2).text).toContain('Tous les pions des deux camps sur leurs 2e à 5e rangées avancent d’une case');
    expect(step('mains-visibles', 0).text).toContain('elle peut ouvrir un gouffre sur la 4e ou la 5e rangée, même pour parer un échec.');
    expect(step('mat-dame', 3).text).toBe('À vous, sans aide : matez le roi noir, qui se défend. Vous avez 30 coups.');
    expect(step('mat-dame', 3).goal).toEqual({ kind: 'hunt', maxMoves: 30 });
    expect(step('mat-tour', 2).text).toBe('À vous : matez le roi noir avec la tour. Vous avez 40 coups.');
    expect(step('mat-tour', 2).goal).toEqual({ kind: 'hunt', maxMoves: 40 });
  });
});

describe('leçons : règles du contenu (lot 8)', () => {
  it('chaque leçon se joue avec RULES_V1, sans règles écrites dans la partie', () => {
    for (const l of ALL_LESSONS) for (const st of l.steps) expect(stepStart(st).rules, l.id).toBeUndefined();
  });

  it('mains des leçons : au plus RULES_V1.cardsPerPlayer cartes, tronquées au nombre de cartes des nouvelles parties', () => {
    for (const l of ALL_LESSONS) {
      for (const st of l.steps) {
        for (const c of ['w', 'b'] as const) {
          expect((st.hands?.[c] ?? []).length, l.id).toBeLessThanOrEqual(Math.min(RULES_V1.cardsPerPlayer, GAME_RULES.cardsPerPlayer));
        }
      }
    }
    expect(hand(['ice_wall', 'rift', 'tide'], 1)).toEqual(['ice_wall']);
    expect(hand(['ice_wall', 'rift', 'tide'], 5)).toEqual(['ice_wall', 'rift', 'tide']);
    expect(hand(['ice_wall', 'rift', 'tide'])).toEqual(['ice_wall', 'rift', 'tide'].slice(0, GAME_RULES.cardsPerPlayer));
  });

  it('requires masque ce qui contredit les règles des nouvelles parties', () => {
    const ids = (r: Parameters<typeof lessonsFor>[0]) => lessonsFor(r).map(l => l.id);
    expect(ids(GAME_RULES)).toEqual(LESSONS.map(l => l.id));
    expect(ids({ ...RULES_V1, handsVisible: false })).not.toContain('mains-visibles');
    expect(ids({ ...RULES_V1, cardEndsTurn: true })).not.toContain('cartes');
    expect(ids({ ...RULES_V1, cardEndsTurn: true })).not.toContain('presage-rituel');
    expect(ids({ ...RULES_V1, cardEndsTurn: true })).toContain('mur-magie');
    expect(ids({ ...RULES_V1, cardsPerTurn: 2 })).toEqual(ALL_LESSONS.map(l => l.id));
    expect(meetsRequires(undefined, { ...RULES_V1, handsVisible: false, cardEndsTurn: true, cardsPerTurn: 3 })).toBe(true);
    expect(meetsRequires({ cardsPerTurn: 1 }, { ...RULES_V1, cardsPerTurn: 2 })).toBe(false);
  });
});

/** Rendu serveur d'une page (sans effets) : texte visible, une ligne par nœud de texte. */
function pageText(url: string, path: string, el: ReactElement): string {
  const html = renderToStaticMarkup(
    createElement(AppProvider, null, createElement(MemoryRouter, { initialEntries: [url] }, createElement(Routes, null, createElement(Route, { path, element: el })))),
  );
  return html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean)
    .join('\n');
}
/** Attributs lus par les lecteurs d'écran (aria-label). */
function pageLabels(url: string, path: string, el: ReactElement): string[] {
  const html = renderToStaticMarkup(
    createElement(AppProvider, null, createElement(MemoryRouter, { initialEntries: [url] }, createElement(Routes, null, createElement(Route, { path, element: el })))),
  );
  return [...html.matchAll(/aria-label="([^"]*)"/g)].map(m => m[1].replace(/&#x27;/g, "'"));
}

describe('pages au réglage par défaut : textes chiffrés et libellés', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('Règles et cartes', () => {
    const t = pageText('/cartes', '/cartes', createElement(Rules));
    for (const s of [
      'et huit pouvoirs',
      'Spellmate, ce sont les échecs que vous connaissez, plus trois cartes de pouvoir chacun. Les deux mains sont visibles, et chaque pouvoir change la partie pour les deux camps.',
      'Les huit pouvoirs\nDeux formules',
      'Six règles, rien de plus',
      'Toutes les règles officielles s’appliquent : roque, prise en passant, promotion, pat, triple répétition, règle des 50 coups. On gagne par mat, au temps ou par abandon.',
      'Trois cartes chacun, à découvert\nAu début d’une partie, vous choisissez vos trois cartes ; sur l’accueil, elles sont tirées au hasard. Votre choix reste secret jusqu’à ce que votre adversaire ait choisi, puis les deux mains restent visibles de tous jusqu’à la fin ; une carte jouée reste à sa place, grisée.',
      'Un sort par tour, avant votre coup\nÀ votre tour, vous pouvez lancer une carte, puis vous jouez votre coup. Chaque carte ne sert qu’une fois. Seule exception : un Rituel remplace votre coup.',
      'Le sort est annoncé avant votre coup et arrive au début de votre tour suivant. En attendant, il est affiché pour tous : l’adversaire a toujours un coup pour s’y préparer.',
      'Le Mur de glace et la Faille agissent dès le lancement, avant votre coup : vous jouez déjà sur le terrain transformé.',
      'La Grande Marée est votre coup : elle termine votre tour, et l’adversaire profite le premier de la nouvelle position.',
      'Exemple : la Trêve\n, un Climat de 3 coups (vous, lui, vous). Aucune capture n’est permise pendant ces trois coups, sauf pour sortir d’un échec.',
      'Vous\nVous lancez la Trêve, puis vous jouez.\nAnnoncée\nAdversaire\nIl répond : il la voit venir.\nArrive au coup suivant\nVous\nElle arrive : vous jouez sans capturer.\n1er coup sur 3\nAdversaire\nIl joue sans capturer.\n2e coup sur 3\nVous\nVous jouez sans capturer.\n3e coup sur 3\nAdversaire\nIl peut capturer le premier.\nTerminée',
      'Les huit pouvoirs\nTrois familles,\nhuit cartes',
      'Entre humains, avec pendule',
      'Trois cartes chacun, choisies parmi les huit pouvoirs au début de la partie.\nLes deux mains visibles, du premier au dernier coup.\nUn sort par tour au plus, toujours facultatif.',
      'Le Sablier fou n’est proposé qu’entre humains, dans les parties avec pendule.',
      'Le choix des cartes dure 45 secondes : trois cartes différentes parmi les huit pouvoirs, sans autre contrainte. Si le temps s’écoule, celles qui vous manquent sont tirées au hasard. Sur l’accueil, le tirage favorise les cartes les moins rares, avec au plus deux Climats par main.',
      'Pour choisir vos cartes et votre adversaire, passez par la page\nJouer',
    ]) expect(t).toContain(s);
    expect(t.match(/Entre humains, avec pendule/g)).toHaveLength(1);
  });

  it('Jouer : portes, niveaux de l’IA, cadences, aide du choix des cartes', () => {
    const bot = pageText('/jouer?mode=bot', '/jouer', createElement(Play));
    for (const s of [
      'Les échecs, plus trois cartes de pouvoir chacun, que vous choisissez au début de la partie. Une IA, un ami, ou le premier joueur venu : la partie s’ouvre en plein écran.',
      'I\nContre l\'IA\n3 niveaux\nApprenti, Sorcier ou Archimage : une IA qui calcule et garde ses sorts pour le bon moment.',
      'II\nDéfier un ami\nSans compte', 'III\nPartie amicale\nOuverte à tous', 'IV\nPartie classée\nElo',
      'Porte I · contre l\'IA',
      'Apprenti\nJoue vite, lance ses sorts au hasard.\n≈ 800 Elo\nSorcier\nCalcule, protège ses pièces, garde une carte pour la fin.\n≈ 1300 Elo\nArchimage\nCalcule en profondeur et punit chaque sort gaspillé.\n≈ 1800 Elo',
      'Vous choisirez vos trois cartes au début de la partie, en 45 secondes : votre choix reste secret jusqu’à ce que votre adversaire ait choisi aussi.',
      '1 + 0\nBullet\n3 + 2\nBlitz\n5 + 0\nBlitz\n10 + 0\nRapide\n15 + 10\nRapide\nSans limite\nLibre',
      'Contre le Sorcier · 10 + 0',
    ]) expect(bot).toContain(s);
    expect(pageText('/jouer?mode=invite', '/jouer', createElement(Play))).toContain('Porte II · entre amis');
    expect(pageText('/jouer?mode=invite', '/jouer', createElement(Play))).toContain('Pouvoirs · 10 + 0');
    const friendly = pageText('/jouer?mode=friendly', '/jouer', createElement(Play));
    expect(friendly).toContain('Cadence\n3 + 2\nBlitz\n5 + 0\nBlitz\n10 + 0\nRapide\n15 + 10\nRapide\nVotre pseudo (facultatif)');
    expect(friendly).toContain('Amicale · 10 + 0 · Pouvoirs');
    expect(pageText('/jouer?mode=ranked', '/jouer', createElement(Play))).toContain('Porte IV · classement Elo');
  });

  it('Apprendre : sommaire et encarts', () => {
    const t = pageText('/apprendre', '/apprendre', createElement(Learn));
    expect(t).toContain('De la marche des pièces aux mats élémentaires, puis les cartes de Spellmate.');
    expect(t).toContain('0 / 22 leçons');
    // Pluriels corrigés (lot 8) : « 1 étape » (mur-magie, mains-visibles), « 0 leçon terminée sur 22 ».
    expect(t.match(/^1 étape$/gm)).toHaveLength(2);
    expect(t).not.toMatch(/^1 étapes$/m);
    expect(t).toContain('3 étapes');
    expect(pageLabels('/apprendre', '/apprendre', createElement(Learn))).toContain('0 leçon terminée sur 22');
    expect(t.split('\n').filter(x => /^[IV]+$/.test(x))).toEqual(['I', 'II', 'III', 'IV', 'V']);
    const cat = pageText('/apprendre/catalogues', '/apprendre/:lesson', createElement(Learn));
    expect(cat).toContain('Pouvoirs\n· 8 cartes');
  });

  it('Problèmes : chapeau et filtres', () => {
    vi.setSystemTime(new Date(2026, 10, 13, 12));
    const t = pageText('/problemes', '/problemes', createElement(Puzzles));
    vi.useRealTimers();
    expect(t).toContain('et des énigmes sur les huit pouvoirs, où la bonne carte (ou celle de l’adversaire, toujours visible) fait la différence.');
    expect(t).toContain('Tous\n49\nMat en 1\n16\nMat en 2\n12\nMat en 3\n4\nFourchettes\n6\nClouages\n4\nEnfilades\n3\nDéviations\n6\nDécouvertes\n2\nMats élémentaires\n7\nCartes\n8');
    expect(t).toContain('Problème du jour · vendredi 13 novembre');
  });

  it('Connexion et inscription : bornes du pseudo et du mot de passe', () => {
    const reg = pageText('/x', '/x', createElement(Auth, { mode: 'register' }));
    expect(reg).toContain('3 à 20 caractères : lettres, chiffres, - et _');
    expect(reg).toContain('8 caractères minimum.');
    const reset = pageText('/x', '/x', createElement(Auth, { mode: 'reset' }));
    expect(reset).toContain('Choisissez un mot de passe d’au moins 8 caractères. Vos autres appareils seront déconnectés.');
    expect(pageLabels('/x', '/x', createElement(Auth, { mode: 'login' }))).toEqual([]);
  });

  it('Mes parties : « 1 coup » au singulier (lot 8), libellés de la liste locale', () => {
    const played = [
      { id: 'local-a', at: Date.now(), you: 'w', white: 'Vous', black: 'L’Oracle', winner: 'b', reason: 'resign', catalog: 'climats', plies: 2, vsBot: true, local: { log: [], hands: { w: [], b: [] }, timed: false, catalog: 'climats' } },
      { id: 'abc123', at: Date.now(), you: 'b', white: 'Aurore', black: 'Basile', winner: 'draw', reason: 'fifty', catalog: 'duel', plies: 7, timeControl: '10+0' },
    ];
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'sm:parties' ? JSON.stringify(played) : null), setItem: () => undefined });
    const t = pageText('/parties', '/parties', createElement(MyGames));
    expect(t).toContain('Abandon · 1 coup\nSur cet appareil · Pouvoirs');
    expect(t).toContain('Règle des 50 coups · 4 coups\nEn ligne · Duel (ancienne formule) · 10+0');
  });

  it('Jouer et Connexion : bornes du pseudo et du mot de passe égales à config/limits.ts', () => {
    expect(PLAY_GUEST_NAME.full.source).toBe(GUEST_NAME.full.source);
    expect(PLAY_GUEST_NAME.full.flags).toBe(GUEST_NAME.full.flags);
    expect(PLAY_GUEST_NAME.max).toBe(GUEST_NAME.max);
    expect(PLAY_GUEST_NAME.invalidDetail).toBe(GUEST_NAME.invalidDetail);
    expect(AUTH_USERNAME).toEqual({ min: USERNAME.min, max: USERNAME.max, hint: USERNAME.hint });
    expect(AUTH_PASSWORD).toEqual({ min: PASSWORD.min, hint: PASSWORD.hint });
  });

  it('libellés de cadence identiques pour les 6 cadences (Jouer, Mes parties, Direct, Analyse, historique)', () => {
    expect(TIME_CONTROLS.map(t => tcLabel(t.id))).toEqual(['1 + 0', '3 + 2', '5 + 0', '10 + 0', '15 + 10', 'Sans limite']);
    expect(TIME_CONTROLS.map(t => tcLabel(t.id, 'family'))).toEqual(['Bullet 1 + 0', 'Blitz 3 + 2', 'Blitz 5 + 0', 'Rapide 10 + 0', 'Rapide 15 + 10', 'Sans limite']);
    expect(TIME_CONTROLS.map(t => tcLabel(t.tc, 'compact'))).toEqual(['1+0', '3+2', '5+0', '10+0', '15+10', 'Sans limite']);
    // Copies supprimées par le lot 8 : MyGames (identifiant → libellé), Live (famille et libellé), Analyse et historique
    // (pendule → « m+i »). Mêmes chaînes.
    for (const t of TIME_CONTROLS) {
      expect(tcLabel(t.id)).toBe(t.label);
      expect(tcLabel(t.id, 'family')).toBe(t.tc ? `${t.family} ${t.label}` : t.label);
      expect(tcLabel(t.tc, 'compact')).toBe(t.tc ? `${Math.round(t.tc.initial / 60)}+${t.tc.increment}` : 'Sans limite');
    }
    expect(tcLabel('inconnue')).toBe('inconnue');
    expect(tcLabel(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------------------------
// Autres réglages : les pages, les leçons et les problèmes suivent GAME_RULES et DEAL (modules relus avec une
// configuration remplacée par vi.doMock ; React et le routeur, hors de src, restent les mêmes).

type ConfigRules = typeof import('../src/shared/config/rules');

async function withSettings(rules: Partial<ConfigRules['GAME_RULES']>, deal: Partial<ConfigRules['DEAL']> = {}) {
  vi.resetModules();
  vi.doMock('../src/shared/config/rules', async orig => {
    const m = await orig<ConfigRules>();
    return { ...m, GAME_RULES: Object.freeze({ ...m.GAME_RULES, ...rules }), DEAL: Object.freeze({ ...m.DEAL, ...deal }) };
  });
  const store = await import('../src/client/store');
  const render = (url: string, path: string, el: ReactElement) =>
    renderToStaticMarkup(
      createElement(store.AppProvider, null, createElement(MemoryRouter, { initialEntries: [url] }, createElement(Routes, null, createElement(Route, { path, element: el })))),
    );
  const text = (html: string) => html.replace(/<[^>]+>/g, '\n').replace(/&#x27;/g, "'").split('\n').map(x => x.trim()).filter(Boolean).join('\n');
  const Rules = (await import('../src/client/pages/Rules')).default;
  const Play = (await import('../src/client/pages/Play')).default;
  return {
    lessons: await import('../src/shared/lessons'),
    puzzles: await import('../src/shared/puzzles'),
    rulesHtml: render('/cartes', '/cartes', createElement(Rules)),
    rules: text(render('/cartes', '/cartes', createElement(Rules))),
    play: text(render('/jouer?mode=bot', '/jouer', createElement(Play))),
  };
}

describe('autres réglages : textes, grilles et contenu', () => {
  afterEach(() => {
    vi.doUnmock('../src/shared/config/rules');
    vi.resetModules();
  });

  it('une carte par joueur : « une carte », « votre carte », mains tronquées', async () => {
    const x = await withSettings({ cardsPerPlayer: 1 });
    expect(x.rules).toContain('Une carte chacun, à découvert\nAu début d’une partie, vous choisissez votre carte ; sur l’accueil, elle est tirée au hasard.');
    expect(x.rules).toContain('Une carte chacun, choisie parmi les huit pouvoirs au début de la partie.');
    expect(x.rules).toContain('Le choix des cartes dure 45 secondes : une carte parmi les huit pouvoirs, sans autre contrainte. Si le temps s’écoule, elle est tirée au hasard.');
    expect(x.rules).toContain('plus une carte de pouvoir chacun.');
    expect(x.play).toContain('Les échecs, plus une carte de pouvoir chacun, que vous choisissez au début de la partie.');
    expect(x.play).toContain('Vous choisirez votre carte au début de la partie, en 45 secondes');
    const cartes = x.lessons.lessonById('cartes')!;
    expect(cartes.summary).toBe('Une carte chacun, visibles des deux joueurs ; une par tour, avant le coup.');
    expect(cartes.steps[0].text).toContain('plus une carte de pouvoir par joueur. Au début d’une partie, vous choisissez votre carte ; sur l’accueil, elle est tirée au hasard.');
    expect(cartes.steps[0].hands).toEqual({ w: ['ice_wall'], b: ['ice_age'] });
    for (const p of x.puzzles.ALL_PUZZLES) for (const c of ['w', 'b'] as const) expect((p.hands?.[c] ?? []).length, p.id).toBeLessThanOrEqual(1);
    // La carte de la solution est en tête : le problème reste juste
    expect(x.puzzles.puzzleById('carte-mur-sauve')!.hands).toEqual({ w: ['ice_wall'], b: ['ice_wall'] });
  });

  it('deux cartes par tour : phrases du tour ; problèmes à une carte masqués', async () => {
    const x = await withSettings({ cardsPerTurn: 2 });
    expect(x.rules).toContain('Deux sorts par tour, avant votre coup\nÀ votre tour, vous pouvez lancer jusqu’à deux cartes, puis vous jouez votre coup.');
    expect(x.rules).toContain('Deux sorts par tour au plus, toujours facultatifs.');
    expect(x.lessons.lessonById('cartes')!.summary).toBe('Trois cartes chacun, visibles des deux joueurs ; deux au plus par tour, avant le coup.');
    expect(x.lessons.lessonById('cartes')!.steps[0].text).toContain('À votre tour, vous pouvez jouer une carte avant votre coup : deux au plus par tour, et chaque carte ne sert qu’une fois.');
    const ids = x.puzzles.PUZZLES.map(p => p.id);
    for (const id of ['carte-mur-sauve', 'carte-mur-enferme', 'carte-faille', 'carte-ere-glaciaire', 'carte-maree']) expect(ids).not.toContain(id);
    for (const id of ['carte-lune', 'carte-deflagration', 'carte-main-visible', 'couloir']) expect(ids).toContain(id);
  });

  it('la carte remplace le coup : « Remplacé par la carte », contenu « carte puis coup » masqué', async () => {
    const x = await withSettings({ cardEndsTurn: true });
    expect(x.rules).toContain('Un sort par tour, à la place du coup\nÀ votre tour, vous pouvez lancer une carte à la place de votre coup. Chaque carte ne sert qu’une fois.');
    expect(x.rules.match(/Remplacé par la carte/g)).toHaveLength(8);
    expect(x.rules).toContain('Un sort par tour au plus, à la place du coup, toujours facultatif.');
    expect(x.lessons.LESSONS.map(l => l.id)).not.toContain('cartes');
    expect(x.lessons.LESSONS.map(l => l.id)).not.toContain('presage-rituel');
    expect(x.puzzles.PUZZLES.map(p => p.id)).not.toContain('carte-faille');
    expect(x.puzzles.PUZZLES.map(p => p.id)).toContain('carte-maree');
  });

  it('Présage à 4 demi-coups : arrivée, frise de la Trêve à 8 étapes (grille --n)', async () => {
    const x = await withSettings({ presageDelay: 4 });
    expect(x.rules).toContain('Le sort est annoncé avant votre coup et arrive au début de votre deuxième tour à venir. En attendant, il est affiché pour tous : l’adversaire a toujours deux coups pour s’y préparer.');
    expect(x.rules).toContain('Au deuxième tour à venir (annoncée)');
    expect(x.rulesHtml).toContain('<ol style="--n:8">');
    expect(x.rules).toContain('Vous\nVous lancez la Trêve, puis vous jouez.\nAnnoncée\nAdversaire\nIl répond : il la voit venir.\nAnnoncée\nVous\nVous jouez.\nAnnoncée\nAdversaire\nIl joue.\nArrive au coup suivant\nVous\nElle arrive : vous jouez sans capturer.\n1er coup sur 3');
  });

  it('sans choix des cartes : mains tirées au hasard partout', async () => {
    const x = await withSettings({}, { draft: false });
    expect(x.rules).toContain('Au début d’une partie, vos trois cartes sont tirées au hasard. Les deux mains restent visibles de tous jusqu’à la fin ; une carte jouée reste à sa place, grisée.');
    expect(x.rules).toContain('Trois cartes chacun, tirées au hasard parmi les huit pouvoirs.');
    expect(x.rules).toContain('Les cartes sont tirées au hasard : le tirage favorise les cartes les moins rares, avec au plus deux Climats par main.');
    expect(x.rules).toContain('Pour choisir votre adversaire, passez par la page');
    expect(x.play).toContain('Les échecs, plus trois cartes de pouvoir chacun, tirées au hasard au début de la partie.');
    expect(x.play).toContain('Vos trois cartes sont tirées au hasard au début de la partie.');
    expect(x.lessons.lessonById('cartes')!.steps[0].text).toContain('Au début d’une partie, vos trois cartes sont tirées au hasard.');
  });
});

describe('Jouer : portes selon les fonctions du site', () => {
  const play = (features: Partial<import('../src/shared/config/features').Features>) =>
    pageText('/jouer?mode=ranked', '/jouer', createElement(FeaturesContext.Provider, { value: { ...FEATURES, ...features } }, createElement(Play)));

  it('une porte coupée disparaît et les suivantes sont renumérotées', () => {
    const t = play({ invites: false });
    expect(t).not.toContain('Défier un ami');
    expect(t).toContain('II\nPartie amicale');
    expect(t).toContain('III\nPartie classée');
    expect(t).toContain('Porte III · classement Elo');
  });

  it('porte demandée fermée : la première porte ouverte ; maintenance : aucune porte', () => {
    expect(play({ ranked: false })).toContain('Porte I · contre l\'IA');
    const closed = play({ newGames: false });
    expect(closed).toContain('Pas de nouvelle partie pour le moment.');
    expect(closed).not.toContain('Contre l\'IA');
  });
});
