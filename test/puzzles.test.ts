import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { analyse } from '../src/shared/bot';
import { CARDS, CardId, cardsOf } from '../src/shared/cards';
import type { CardTuning } from '../src/shared/config/rules';
import { Color, isCapture, sqIndex } from '../src/shared/chess';
import { GAME_RULES, RULES_V1 } from '../src/shared/config/rules';
import { GameState, cardOptions, legalMovesOf, playCard, playMove, sideInCheck } from '../src/shared/game';
import { material, uciOf, validateFen } from '../src/shared/pgn';
import {
  ALL_PUZZLES, PUZZLES, Puzzle, PuzzleAction, THEME_LABEL, THEME_PLURAL, applyAction, dailyPuzzle, dayNumber, goalOf, hand, parseAction,
  puzzleById, puzzleStart, puzzlesFor, sameAction, solverOf, stepOptions,
} from '../src/shared/puzzles';
// Réglages V1 (lot 9e) : hors du défaut, les problèmes « au défaut » sont relus avec la configuration V1, et le contenu
// masqué par `requires` se cherche dans ALL_PUZZLES (test/helpers/v1.ts).
import { configDuJourV1, defaireConfig, equilibrageV1, reglagesV1, relireAvecConfigV1 } from './helpers/v1';

/** Tout le contenu est vérifié, même ce que les règles du moment masquent. */
const cardPuzzles = ALL_PUZZLES.filter(p => p.themes.includes('cartes'));
/** Un problème, même masqué par les règles du moment (écrit pour RULES_V1, il se joue avec elles). */
const probleme = (id: string) => ALL_PUZZLES.find(p => p.id === id);

/** Toutes les cartes jouables par `c`, avec toutes leurs cibles. */
function allCardPlays(s: GameState, c: Color): (PuzzleAction & { kind: 'card' })[] {
  const out: (PuzzleAction & { kind: 'card' })[] = [];
  s.hands[c].forEach((h, index) => {
    if (h.used) return;
    const need = CARDS[h.card].targets;
    const walk = (partial: number[]) => {
      if (partial.length === need) {
        if (playCard(s, c, index, partial, '').ok) out.push({ kind: 'card', card: h.card, targets: partial });
        return;
      }
      for (const t of cardOptions(s, c, index, partial)) walk([...partial, t]);
    };
    walk([]);
  });
  return out;
}

/** Suites de 1 à `k` cartes jouables par `c` dans le même tour, avec l'état obtenu. */
function cardSequences(s: GameState, c: Color, k: number): { plays: (PuzzleAction & { kind: 'card' })[]; after: GameState }[] {
  const out: { plays: (PuzzleAction & { kind: 'card' })[]; after: GameState }[] = [];
  const walk = (st: GameState, plays: (PuzzleAction & { kind: 'card' })[]) => {
    if (plays.length >= k || st.pos.turn !== c) return;
    for (const play of allCardPlays(st, c)) {
      const after = applyAction(st, play);
      if (!after) continue;
      out.push({ plays: [...plays, play], after });
      walk(after, [...plays, play]);
    }
  };
  walk(s, []);
  return out;
}

/** Mat en au plus `n` coups du camp `me`, selon le moteur (qui ignore les cartes encore en main). */
function mateWithin(s: GameState, me: Color, n: number): boolean {
  if (s.result) return s.result.reason === 'checkmate' && s.result.winner === me;
  if (!legalMovesOf(s).length) return false;
  const plies = s.pos.turn === me ? 2 * n - 1 : 2 * n;
  const a = analyse(s, plies + 1, 60_000);
  const sign = me === 'w' ? 1 : -1;
  return a.mate !== null && a.mate * sign > 0 && a.mate * sign <= n;
}

/** Joue la ligne principale (première réponse acceptée de chaque étape) et renvoie les états successifs. */
function playLine(p: Puzzle) {
  let s = puzzleStart(p);
  const states = [s];
  const solver = solverOf(p);
  for (const [i, step] of p.solution.entries()) {
    const opts = stepOptions(step);
    expect(opts.length, `${p.id} étape ${i}`).toBeGreaterThan(0);
    // Toutes les réponses acceptées doivent être légales
    for (const o of opts) expect(applyAction(s, o), `${p.id} : ${step} illégal`).not.toBeNull();
    const isSolver = s.pos.turn === solver;
    if (opts[0].kind === 'card') expect(isSolver, `${p.id} : carte jouée par le solveur`).toBe(true);
    s = applyAction(s, opts[0])!;
    states.push(s);
  }
  return states;
}

describe('problèmes', () => {
  it('au moins 40 problèmes classiques et 6 problèmes à cartes, identifiants uniques', () => {
    const classic = ALL_PUZZLES.filter(p => !p.themes.includes('cartes'));
    expect(classic.length).toBeGreaterThanOrEqual(40);
    expect(cardPuzzles.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ALL_PUZZLES.map(p => p.id)).size).toBe(ALL_PUZZLES.length);
    for (const p of ALL_PUZZLES) {
      expect(p.id).toMatch(/^[a-z0-9-]+$/);
      expect(validateFen(p.fen), p.id).toBeNull();
      expect(p.hint.length).toBeGreaterThan(10);
      expect(p.moral.length).toBeGreaterThan(10);
      expect(goalOf(p)).toMatch(/\.$/);
      if (PUZZLES.includes(p)) expect(puzzleById(p.id)).toBe(p);
    }
  });

  it('chaque solution est légale, le solveur termine la ligne', () => {
    for (const p of ALL_PUZZLES) {
      const states = playLine(p);
      const last = states[states.length - 2];
      // La dernière étape est jouée par le camp qui résout
      expect(last.pos.turn, p.id).toBe(solverOf(p));
    }
  });

  it('les mats annoncés sont des mats, et le moteur les confirme', () => {
    for (const p of ALL_PUZZLES.filter(x => x.mate)) {
      const states = playLine(p);
      const end = states[states.length - 1];
      expect(end.result, p.id).toMatchObject({ reason: 'checkmate', winner: solverOf(p) });
      if (p.hands || p.effects) continue; // problèmes à cartes : voir plus bas
      const start = puzzleStart(p);
      const a = analyse(start, 2 * p.mate!, 60_000);
      const sign = solverOf(p) === 'w' ? 1 : -1;
      expect(a.mate, `${p.id} : mat en ${p.mate}`).toBe(p.mate! * sign);
      // Le coup clé de la solution mate aussi vite que celui du moteur
      const key = stepOptions(p.solution[0]).map(o => (o.kind === 'move' ? uciOf(o) : ''));
      if (p.mate === 1) expect(key, p.id).toContain(uciOf(a.best!));
    }
  }, 240_000);

  it('les problèmes tactiques gagnent du matériel, et le moteur trouve le coup clé', () => {
    for (const p of ALL_PUZZLES.filter(x => !x.mate && !x.hands && !x.effects)) {
      const states = playLine(p);
      const me = solverOf(p);
      const other = me === 'w' ? 'b' : 'w';
      const m0 = material(states[0]);
      const m1 = material(states[states.length - 1]);
      const gain = (m1[me] - m1[other]) - (m0[me] - m0[other]);
      expect(gain, `${p.id} : gain de matériel`).toBeGreaterThanOrEqual(2);
      const a = analyse(states[0], 4, 20_000);
      expect(stepOptions(p.solution[0]).map(o => (o.kind === 'move' ? uciOf(o) : '')), p.id).toContain(uciOf(a.best!));
    }
  }, 120_000);

});

describe('problèmes à cartes', () => {
  it('seulement les pouvoirs, en mains de RULES_V1.cardsPerPlayer cartes au plus, catalogue Pouvoirs', () => {
    const allowed = cardsOf('climats');
    for (const p of cardPuzzles) {
      const s = puzzleStart(p);
      expect(s.catalog, p.id).toBe('climats');
      // Joués avec les règles de leurs solutions : aucune règle écrite dans la partie (RULES_V1)
      expect(s.rules, p.id).toBeUndefined();
      for (const c of ['w', 'b'] as Color[]) {
        expect(s.hands[c].length, p.id).toBeLessThanOrEqual(Math.min(RULES_V1.cardsPerPlayer, GAME_RULES.cardsPerPlayer));
        for (const h of s.hands[c]) expect(allowed, `${p.id} : ${h.card}`).toContain(h.card);
      }
      for (const e of p.effects ?? []) expect(allowed).toContain(e.card);
      for (const step of p.solution) for (const o of stepOptions(step)) if (o.kind === 'card') expect(allowed).toContain(o.card);
    }
    // Chaque famille est représentée, et au moins six pouvoirs différents servent
    const used = new Set<CardId>();
    for (const p of cardPuzzles) {
      for (const e of p.effects ?? []) used.add(e.card);
      for (const step of p.solution) for (const o of stepOptions(step)) if (o.kind === 'card') used.add(o.card);
    }
    expect(used.size).toBeGreaterThanOrEqual(6);
    expect(new Set([...used].map(id => CARDS[id].family))).toEqual(new Set(['climat', 'terrain', 'evenement']));
  });

  it('la carte est nécessaire et seule la solution convient, jusqu’à 2 cartes par tour (mat confirmé par le moteur)', () => {
    for (const p of cardPuzzles.filter(x => x.mate && stepOptions(x.solution[0])[0].kind === 'card')) {
      // Cartes par tour à essayer : au moins 2 (et celles des nouvelles parties si elles en permettent plus), sauf pour
      // un problème qui déclare n'être unique qu'à une carte par tour (requires.cardsPerTurn : 1, masqué au-delà). Un
      // problème qui ne déclare rien reste donc proposé avec 2 cartes par tour, et doit y rester unique.
      const k = p.requires?.cardsPerTurn ?? Math.max(2, GAME_RULES.cardsPerTurn);
      const start = puzzleStart(p, { ...RULES_V1, cardsPerTurn: k });
      const me = solverOf(p);
      const n = p.mate!;
      // Sans carte : pas de mat aussi rapide
      expect(mateWithin(start, me, n), `${p.id} : mat sans carte`).toBe(false);
      // Chaque suite de 1 à k cartes jouables (toutes cibles) : elle mène au mat en n seulement si sa première carte est
      // acceptée par la solution ; une carte seule y mène si et seulement si la solution l'accepte.
      const accepted = stepOptions(p.solution[0]);
      const seqs = cardSequences(start, me, k);
      expect(seqs.length, p.id).toBeGreaterThan(0);
      for (const { plays, after } of seqs) {
        // Un Rituel tient lieu de coup : il reste n − 1 coups
        const works = after.pos.turn === me ? mateWithin(after, me, n) : mateWithin(after, me, n - 1);
        const first = accepted.some(o => sameAction(o, plays[0]));
        const where = `${p.id} : ${plays.map(x => `@${x.card} ${x.targets.join(',')}`).join(' puis ')}`;
        if (plays.length === 1) expect(works, where).toBe(first);
        else if (works) expect(first, where).toBe(true);
      }
    }
  }, 240_000);

  it('un pouvoir déjà en jeu : il est nécessaire, et le moteur trouve la solution', () => {
    for (const p of cardPuzzles.filter(x => x.effects?.length)) {
      const start = puzzleStart(p);
      const me = solverOf(p);
      const bare = { ...start, effects: [] };
      expect(start.effects.length, p.id).toBe(p.effects!.length);
      // La carte du lanceur est marquée comme jouée
      for (const e of p.effects!) expect(start.hands[e.by].some(h => h.card === e.card && h.used), p.id).toBe(true);
      const key = stepOptions(p.solution[0]).map(o => (o.kind === 'move' ? uciOf(o) : ''));
      if (p.mate) {
        expect(mateWithin(start, me, p.mate), `${p.id} : mat avec le pouvoir`).toBe(true);
        expect(mateWithin(bare, me, p.mate), `${p.id} : mat sans le pouvoir`).toBe(false);
        // Le seul premier coup qui mate aussi vite
        for (const m of legalMovesOf(start)) {
          const r = playMove(start, m.from, m.to, m.promo);
          if (!r.ok) continue;
          expect(mateWithin(r.state, me, p.mate - 1) || r.state.result?.reason === 'checkmate', `${p.id} : ${uciOf(m)}`).toBe(key.includes(uciOf(m)));
        }
      } else {
        const a = analyse(start, 4, 20_000);
        expect(key, p.id).toContain(uciOf(a.best!));
        const b = analyse(bare, 4, 20_000);
        expect(key, `${p.id} : sans le pouvoir, le moteur jouerait autre chose`).not.toContain(uciOf(b.best!));
      }
    }
  }, 120_000);

  it('le Mur qui sauve : en échec sans coup, la partie continue ; le Mur rend un coup', () => {
    const p = probleme('carte-mur-sauve')!;
    const start = puzzleStart(p);
    expect(sideInCheck(start)).toBe(true);
    expect(legalMovesOf(start)).toHaveLength(0);
    expect(start.result).toBeNull();
    for (const o of stepOptions(p.solution[0])) {
      const s = applyAction(start, o)!;
      expect(sideInCheck(s)).toBe(false);
      expect(legalMovesOf(s).length).toBeGreaterThan(0);
      // Un Mur en g2 (2e rangée) n'est pas permis
      expect(applyAction(start, { kind: 'card', card: 'ice_wall', targets: [sqIndex('g2')] })).toBeNull();
    }
  });

  it('la Lune retournée : les deux camps doivent prendre', () => {
    const p = probleme('carte-lune')!;
    const start = puzzleStart(p);
    expect(legalMovesOf(start).every(isCapture)).toBe(true);
    const s = applyAction(start, stepOptions('b3d5')[0])!;
    expect(legalMovesOf(s).map(uciOf)).toEqual(['d8d5']);
  });

  it('la Déflagration : prendre avec le pion gagne du matériel, Dxa4 perd la dame', () => {
    const p = probleme('carte-deflagration')!;
    const start = puzzleStart(p);
    const gain = (s: GameState) => { const m = material(s); return m.w - m.b; };
    const good = applyAction(start, stepOptions('e4d5')[0])!;
    expect(good.pos.board[sqIndex('d5')]).toBeNull();
    expect(gain(good) - gain(start)).toBeGreaterThanOrEqual(2);
    const bad = applyAction(start, stepOptions('d1a4')[0])!;
    expect(bad.pos.board[sqIndex('a4')]).toBeNull();
    expect(gain(bad) - gain(start)).toBeLessThan(0);
  });

  it('lisez sa main : le Mur noir pare Fc3+, pas Df8#', () => {
    const p = probleme('carte-main-visible')!;
    const start = puzzleStart(p);
    const fake = applyAction(start, stepOptions('e1c3')[0])!;
    expect(sideInCheck(fake)).toBe(true);
    expect(legalMovesOf(fake)).toHaveLength(0);
    expect(fake.result).toBeNull(); // les Noirs doivent jouer leur Mur
    expect(allCardPlays(fake, 'b').length).toBeGreaterThan(0);
    const real = applyAction(start, stepOptions('f7f8')[0])!;
    expect(real.result).toMatchObject({ reason: 'checkmate', winner: 'w' });
  });

  it('la Faille : n’importe quelle case de la rangée désigne la même Faille', () => {
    const a = parseAction('@rift:a5')!;
    expect(sameAction(a, parseAction('@rift:h5')!)).toBe(true);
    expect(sameAction(a, parseAction('@rift:a4')!)).toBe(false);
  });

});

describe('problème du jour et notation', () => {
  it('problème du jour : déterministe, et toute la liste passe avant une répétition', () => {
    const d = new Date(2026, 9, 30, 8);
    expect(dailyPuzzle(d).id).toBe(dailyPuzzle(new Date(2026, 9, 30, 23, 59)).id);
    const seen = new Set<string>();
    for (let i = 0; i < PUZZLES.length; i++) seen.add(dailyPuzzle(new Date(2026, 0, 1 + i)).id);
    expect(seen.size).toBe(PUZZLES.length);
  });

  it('ajouter un problème ne change pas le problème du jour (il entre au calendrier le lendemain de son ajout)', () => {
    const today = new Date(2026, 10, 13, 12);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const added: Puzzle = { ...PUZZLES[0], id: 'nouveau', since: iso(today) };
    const list = [...PUZZLES, added];
    // Le jour de l'ajout (déploiement à midi), et toute la journée : même problème du jour
    for (const h of [0, 12, 23]) expect(dailyPuzzle(new Date(2026, 10, 13, h), list).id).toBe(dailyPuzzle(new Date(2026, 10, 13, h)).id);
    // Dès le lendemain, il fait partie du calendrier, qui parcourt alors toute la liste
    const seen = new Set<string>();
    for (let i = 1; i <= list.length; i++) seen.add(dailyPuzzle(new Date(2026, 10, 13 + i, 12), list).id);
    expect(seen.size).toBe(list.length);
    expect(dayNumber(new Date(2026, 10, 14))).toBe(dayNumber(new Date(2026, 10, 13)) + 1);
  });

  it('requires masque ce qui contredit les règles des nouvelles parties ; filtres tirés des thèmes', () => {
    const ids = (r: Parameters<typeof puzzlesFor>[0]) => puzzlesFor(r).map(p => p.id);
    expect(PUZZLES).toEqual(puzzlesFor(GAME_RULES));
    expect(ids(RULES_V1)).toEqual(ALL_PUZZLES.map(p => p.id));
    expect(ids({ ...RULES_V1, handsVisible: false })).not.toContain('carte-main-visible');
    expect(ids({ ...RULES_V1, cardEndsTurn: true })).not.toContain('carte-mur-sauve');
    expect(ids({ ...RULES_V1, cardEndsTurn: true })).toContain('carte-maree');
    // Deux cartes par tour : seuls les problèmes uniques à une carte seulement sont masqués (unicité vérifiée plus haut)
    const two = ids({ ...RULES_V1, cardsPerTurn: 2 });
    for (const id of ['carte-mur-enferme', 'carte-faille', 'carte-maree']) expect(two).not.toContain(id);
    for (const id of ['carte-mur-sauve', 'carte-ere-glaciaire', 'carte-lune', 'carte-deflagration', 'carte-main-visible']) expect(two).toContain(id);
    // Délai du Présage : l'Ère glaciaire « arrive au début de votre tour suivant »
    expect(ids({ ...RULES_V1, presageDelay: 4 })).not.toContain('carte-ere-glaciaire');
    expect(ids({ ...RULES_V1, presageDelay: 4 })).toContain('carte-maree');
    expect(Object.keys(THEME_PLURAL)).toEqual(Object.keys(THEME_LABEL));
  });

  it('requires.tuning : une carte rééquilibrée dans CARDS masque les problèmes qui citent ou exploitent son équilibrage V1', () => {
    const ids = (id: CardId, t: CardTuning) => puzzlesFor({ ...RULES_V1, tuning: { ...RULES_V1.tuning, [id]: t } }).map(p => p.id);
    // Au défaut, l'équilibrage de CARDS est celui de RULES_V1 (GAME_RULES n'a pas de tuning : celui de CARDS).
    // Hors du défaut, les règles V1 avec leur équilibrage ne masquent rien non plus.
    expect(puzzlesFor(reglagesV1() && equilibrageV1() ? GAME_RULES : RULES_V1)).toEqual(ALL_PUZZLES);
    const wall = ids('ice_wall', { ranks: [3, 4] });
    for (const id of ['carte-mur-sauve', 'carte-mur-enferme', 'carte-main-visible']) expect(wall).not.toContain(id);
    expect(wall).toContain('carte-faille');
    expect(ids('rift', { coups: 4, ranks: [2, 3] })).not.toContain('carte-faille');
    expect(ids('ice_age', { coups: 2 })).not.toContain('carte-ere-glaciaire');
    expect(ids('tide', { ranks: [1, 2, 3] })).not.toContain('carte-maree');
    expect(ids('hourglass', { coups: 6, clockRate: 3 })).toEqual(ALL_PUZZLES.map(p => p.id));
  });

  it('toute carte jouée dans une solution est déclarée dans requires.tuning', () => {
    for (const p of ALL_PUZZLES) {
      for (const step of p.solution) for (const o of stepOptions(step)) {
        if (o.kind === 'card') expect(p.requires?.tuning, `${p.id} : ${o.card} jouée, à déclarer dans requires.tuning`).toContain(o.card);
      }
    }
  });

  it('la carte de la solution est en tête de la main : chaque solution reste jouable avec 1 ou 2 cartes par joueur', () => {
    for (const n of [1, 2]) {
      for (const p of cardPuzzles) {
        const cut: Puzzle = { ...p, hands: p.hands && { w: p.hands.w && hand(p.hands.w, n), b: p.hands.b && hand(p.hands.b, n) } };
        let s = puzzleStart(cut);
        for (const step of p.solution) {
          const next = applyAction(s, stepOptions(step)[0]);
          expect(next, `${p.id}, ${n} carte(s) par main : ${step}`).not.toBeNull();
          s = next!;
        }
        if (p.mate) expect(s.result, `${p.id}, ${n} carte(s) par main`).toMatchObject({ reason: 'checkmate', winner: solverOf(p) });
      }
    }
  });

  it('problème du jour : les 49 premiers problèmes, dans cet ordre et sans date ; tout autre porte `since` (AAAA-MM-JJ)', () => {
    // Le calendrier du problème du jour tourne sur la liste : retirer, déplacer ou ajouter sans date un problème change
    // le problème du jour le jour même du déploiement, puis presque tous les jours suivants. Un problème ajouté porte
    // donc `since` (sa date d'ajout) : il n'entre au calendrier que le lendemain. Il peut se ranger n'importe où.
    const original = [
      'couloir', 'etouffe', 'anastasie', 'berger', 'epaulettes', 'arabe', 'mat-du-sot', 'boden', 'couloir-noir', 'escalier', 'baiser',
      'greco', 'legs-de-philidor', 'anastasie-2', 'couloir-2', 'legal', 'boden-2', 'opera', 'tour-tempo', 'tour-coin', 'dame-approche',
      'philidor-3', 'anastasie-3', 'tour-3', 'dame-3', 'fourchette-c7', 'fourchette-e7', 'fourchette-pion', 'fourchette-dame',
      'fourchette-f6', 'fourchette-noire', 'clouage-b5', 'clouage-f4', 'clouage-d4', 'clouage-e1', 'enfilade-tour', 'enfilade-fou',
      'enfilade-colonne', 'surcharge', 'decouverte-d6', 'decouverte-h7', 'carte-mur-sauve', 'carte-mur-enferme', 'carte-faille',
      'carte-ere-glaciaire', 'carte-maree', 'carte-lune', 'carte-deflagration', 'carte-main-visible',
    ];
    expect(ALL_PUZZLES.filter(p => !p.since).map(p => p.id), 'problèmes sans `since` : les 49 d’origine, dans leur ordre (ajoutez `since` aux nouveaux)').toEqual(original);
    for (const p of ALL_PUZZLES.filter(x => x.since)) {
      expect(p.since, `${p.id} : since au format AAAA-MM-JJ`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const [y, m, d] = p.since!.split('-').map(Number);
      expect(new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10), `${p.id} : since, date réelle`).toBe(p.since);
    }
  });

  it('lit les étapes : coups, promotions, cartes et alternatives', () => {
    expect(parseAction('e7e8n')).toMatchObject({ kind: 'move', promo: 'n' });
    expect(parseAction('@ice_wall:f3')).toMatchObject({ kind: 'card', card: 'ice_wall', targets: [21] });
    expect(parseAction('@coronation:a7')).toBeNull(); // carte retirée
    expect(parseAction('@inconnue:a1')).toBeNull();
    expect(stepOptions('e2e4|d2d4')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------
// Réglage par défaut : photographies (lot 8), relevées sur le code d'avant la dérivation des textes.

const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

/** Contenu d'un problème tel qu'il existait avant le lot 8 (sans les champs ajoutés depuis). */
const photo = (list: Puzzle[]) => list.map(p => ({
  id: p.id, title: p.title, themes: p.themes, level: p.level, fen: p.fen, solution: p.solution, mate: p.mate, goal: p.goal,
  hint: p.hint, moral: p.moral, hands: p.hands, effects: p.effects,
}));

/**
 * Problèmes « au réglage par défaut » : ceux du jour si la configuration du jour est celle de V1 (modules déjà
 * chargés, comme avant), sinon le module relu avec la configuration V1. Les photographies du défaut d'avant la passe
 * restent ainsi vérifiées à l'identique, quel que soit le réglage du jour.
 */
async function problemesV1() {
  if (configDuJourV1()) return { ALL_PUZZLES, PUZZLES, puzzleById, dailyPuzzle };
  relireAvecConfigV1();
  return import('../src/shared/puzzles');
}

describe('problèmes au réglage par défaut', () => {
  afterEach(() => defaireConfig());

  it('textes, positions, solutions et mains identiques à la photographie', async () => {
    const { ALL_PUZZLES, PUZZLES } = await problemesV1();
    expect(sha(photo(ALL_PUZZLES))).toBe('b98dd400d90d3790');
    expect(PUZZLES).toEqual(ALL_PUZZLES);
  });

  it('textes chiffrés des problèmes à cartes (rangées du Mur)', async () => {
    const { puzzleById } = await problemesV1();
    expect(puzzleById('carte-mur-sauve')!.hint).toBe('Un Mur se pose entre la 3e et la 6e rangée : une seule case de la diagonale convient.');
    expect(puzzleById('carte-main-visible')!.moral).toBe('Les mains sont visibles : un échec à distance qui traverse les rangées 3 à 6 se pare d’un Mur. Sur la 8e rangée, aucun Mur ne peut se poser.');
  });

  it('problème du jour : même calendrier qu’avant le lot 8', async () => {
    const { dailyPuzzle } = await problemesV1();
    const days: string[] = [];
    for (let i = 0; i < 120; i++) days.push(dailyPuzzle(new Date(2026, 0, 1 + i, 12)).id);
    expect(days.slice(0, 6)).toEqual(['philidor-3', 'fourchette-f6', 'enfilade-colonne', 'carte-maree', 'epaulettes', 'legs-de-philidor']);
    expect(sha(days)).toBe('1dbebfb31f6b60a5');
    expect(dailyPuzzle(new Date(2026, 10, 13, 12)).id).toBe('etouffe');
  });
});
