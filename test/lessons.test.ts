import { createHash } from 'node:crypto';
import { createElement } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { cardsOf } from '../src/shared/cards';
import { F_RELAXED, fromFen, sqIndex, sqName } from '../src/shared/chess';
import { GameState, legalMovesOf, playMove, sideInCheck } from '../src/shared/game';
import {
  LESSONS, LESSON_GROUPS, LessonStep, freeMove, lessonById, loneKingReply, matedBy, stepStart, studentOf,
} from '../src/shared/lessons';
import { applyAction, stepOptions } from '../src/shared/puzzles';
import { TIME_CONTROLS, tcLabel } from '../src/shared/protocol';
import Rules from '../src/client/pages/Rules';
import Play from '../src/client/pages/Play';
import Learn from '../src/client/pages/Learn';
import Puzzles from '../src/client/pages/Puzzles';
import Auth from '../src/client/pages/Auth';
import { AppProvider } from '../src/client/store';

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
    expect(LESSONS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(LESSONS.map(l => l.id)).size).toBe(LESSONS.length);
    for (const l of LESSONS) {
      expect(LESSON_GROUPS).toContain(l.group);
      expect(l.steps.length).toBeGreaterThan(0);
      expect(lessonById(l.id)).toBe(l);
      for (const s of l.steps) {
        expect(s.text.length, l.id).toBeGreaterThan(20);
        expect(() => fromFen(s.fen)).not.toThrow();
      }
    }
    // Chaque pièce, les coups spéciaux, échec, mat et pat, et les cartes
    for (const id of ['tour', 'fou', 'dame', 'roi', 'cavalier', 'pion', 'roque', 'prise-en-passant', 'promotion', 'echec', 'mat', 'pat', 'cartes', 'catalogues', 'deux-camps', 'presage-rituel', 'mur-magie', 'mains-visibles']) {
      expect(lessonById(id), id).toBeDefined();
    }
  });

  it('chaque étape est réalisable avec le moteur', () => {
    for (const l of LESSONS) {
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
    for (const l of LESSONS) {
      for (const step of l.steps) {
        if (step.goal.kind === 'info') continue;
        const s = stepStart(step);
        const cardStep = step.goal.kind === 'line' && step.goal.line[0].startsWith('@');
        if (!cardStep) expect(legalMovesOf(s).length, l.id).toBeGreaterThan(0);
      }
    }
  });

  it('les leçons de cartes n’utilisent que les huit pouvoirs, jamais le Duel', () => {
    const allowed = cardsOf('climats');
    for (const l of LESSONS) {
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
    expect(sha(photo(LESSONS))).toBe('d8b079be811b03f8');
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
