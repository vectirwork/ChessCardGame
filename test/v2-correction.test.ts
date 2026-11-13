// Corrections finales de la passe V2 (recette QA et relecture) : ce qui se vérifie sans navigateur. Le glisser à la
// souris enchaîné se vérifie dans un vrai navigateur : node test/glisser.mjs <url>.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARDS, CARD_IDS } from '../src/shared/cards';
import { RULES_V1 } from '../src/shared/config/rules';
import { createGame, playCard, playMove } from '../src/shared/game';
import { cardEndsTurn } from '../src/shared/rulesCore';
import { cardTiming, endsTurn, ruleBody, turnEffect } from '../src/client/components/SpellCard';
import { emoteTimers } from '../src/client/game/emotes';
import { deNom } from '../src/client/game/names';
import { firstMoveShown } from '../src/client/game/overlays';
import { firstMoveNumber, formatClock, moveLines, tcLabel, tcLong } from '../src/client/game/parts';
import { castMessage, castThisTurn, castsThisTurn, handNotes } from '../src/client/odyssee/shell/cards';
import { powerLeft, powerTiming } from '../src/client/odyssee/shell/powers';
import { DESKTOP_OPP_ROOM, MOBILE_BOARD_TOP, desktopHandRight, gameLayout, oppCardWidth } from '../src/client/odyssee/shell/layout';
import { LESSONS } from '../src/shared/lessons';
import type { Effect } from '../src/shared/game';

const CLIENT = path.resolve(__dirname, '../src/client');
const css = (file: string) => readFileSync(path.join(CLIENT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** Corps de la première règle dont le sélecteur est exactement `selector`. */
const rule = (file: string, selector: string) => css(file).split(`${selector} {`)[1]?.split('}')[0] ?? '';

describe('glisser une pièce à la souris (D4)', () => {
  it('l’échiquier ne sélectionne pas de texte et ne lance pas de glisser-déposer natif', () => {
    expect(rule('styles/board.css', '.board-wrap')).toMatch(/(^|\s)user-select:\s*none/);
    expect(rule('styles/board.css', '.board-wrap *')).toMatch(/-webkit-user-drag:\s*none/);
    const board = readFileSync(path.join(CLIENT, 'components/Board.tsx'), 'utf8');
    expect(board).toMatch(/onDragStart=\{e => e\.preventDefault\(\)\}/);
    expect(board).toMatch(/e\.pointerType === 'mouse'\) \{\s*\/\/[^\n]*\n(\s*\/\/[^\n]*\n)*\s*e\.preventDefault\(\)/);
  });
});

describe('noms dans les phrases', () => {
  it('élide devant une voyelle ou un h, contracte les articles', () => {
    expect(deNom('Alice')).toBe("d'Alice");
    expect(deNom('Élodie')).toBe("d'Élodie");
    expect(deNom('Hugo')).toBe("d'Hugo");
    expect(deNom('Bruno')).toBe('de Bruno');
    expect(deNom('Yann')).toBe('de Yann');
    expect(deNom('IA Sorcier')).toBe("de l'IA Sorcier");
    expect(deNom('Les Blancs')).toBe('des Blancs');
    expect(deNom("L'Oracle")).toBe("de l'Oracle");
    expect(`Cartes ${deNom('Alice')}`).toBe("Cartes d'Alice");
  });
});

describe('pouvoirs en cours', () => {
  const base = { id: 1, card: 'ice_wall', caster: 'w', countsOn: 'w', remaining: 0, total: 0, global: true } as unknown as Effect;
  it('un Mur de glace permanent dure toute la partie, pas « encore 0 coup »', () => {
    expect(powerLeft({ ...base, permanent: true })).toBe('toute la partie');
    expect(powerLeft({ ...base, card: 'truce', remaining: 3 } as Effect)).toBe('encore 3 coups');
    expect(powerLeft({ ...base, card: 'truce', remaining: 1 } as Effect)).toBe('encore 1 coup');
    expect(powerLeft({ ...base, card: 'blast', pending: true, delay: 1 } as Effect)).toBe('à venir');
  });
  it('dit qui a lancé le pouvoir et quand un pouvoir annoncé arrive', () => {
    const blast = { ...base, card: 'blast', remaining: 4, total: 4 } as Effect;
    expect(powerTiming(blast, 'w')).toBe('Votre sort');
    expect(powerTiming(blast, 'b', { w: 'Alice' })).toBe("Sort d'Alice");
    expect(powerTiming(blast, 'b', { w: "L'Oracle" })).toBe("Sort de l'Oracle");
    expect(powerTiming(blast, null)).toBe('Sort des Blancs');
    expect(powerTiming({ ...blast, pending: true, delay: 2 }, 'w')).toBe('Vous · annoncé, arrive au début de votre prochain tour');
    expect(powerTiming({ ...blast, pending: true, delay: 2 }, 'b', { w: "L'Oracle" })).toBe("L'Oracle · annoncé, arrive après votre prochain coup");
    expect(powerTiming({ ...blast, pending: true, delay: 1 }, 'b', { w: "L'Oracle" })).toBe("L'Oracle · annoncé, arrive après votre coup");
    expect(powerTiming({ ...blast, pending: true, delay: 1 }, null)).toBe('Les Blancs · annoncé, arrive au début de leur prochain tour');
  });
});

describe('main adverse sur ordinateur (D3)', () => {
  /** Largeur d'une carte adverse (layout.ts, celle de GameShell). */
  const oppCard = (vw: number, vh: number) => oppCardWidth(gameLayout(vw, vh), vw);
  for (const [vw, vh] of [[1280, 720], [1366, 768], [1440, 900], [1536, 864], [1920, 1080]] as const) {
    it(`${vw} × ${vh} : cartes adverses d'au moins 64 px, échiquier entre les deux mains`, () => {
      expect(oppCard(vw, vh)).toBeGreaterThanOrEqual(64);
      const l = gameLayout(vw, vh);
      expect(l.x - l.G / 2).toBeGreaterThanOrEqual(Math.max(400, vw * 0.3) - 0.5);
      // La main du joueur (en bas à gauche, jusqu'à ~432 px) ne touche pas l'échiquier
      expect(l.x - l.G / 2).toBeGreaterThanOrEqual(desktopHandRight(vw) - 0.5);
      // L'échiquier ne rapetisse jamais de plus de 5 %
      const left = Math.max(400, vw * 0.3);
      expect(l.G).toBeGreaterThanOrEqual(0.95 * Math.min(vh - 150, vw - left - Math.max(150, vw * 0.11)) - 0.5);
      expect(vw - (l.x + l.G / 2)).toBeGreaterThanOrEqual(DESKTOP_OPP_ROOM - 0.5);
    });
  }
  it('le nom d’une carte adverse ne se coupe jamais au milieu d’un mot', () => {
    expect(rule('styles/cards.css', '.sc-hand .sc-name')).toMatch(/word-break:\s*keep-all/);
    expect(rule('styles/cards.css', '.sc-hand .sc-name')).not.toMatch(/overflow-wrap:\s*anywhere/);
  });
});

describe('coque mobile : la bande des cartes adverses ne touche ni le nom ni l’échiquier', () => {
  it('bande à 56 px, échiquier (cadre de 10 px compris) à partir de 108 px', () => {
    expect(rule('odyssee/shell/shell.css', '.gs.is-mobile .gs-opp-strip')).toMatch(/top:\s*56px/);
    expect(MOBILE_BOARD_TOP - 10).toBeGreaterThanOrEqual(56 + 52);
    expect(gameLayout(390, 844).G).toBe(374); // téléphone courant : échiquier sur toute la largeur, comme avant
  });
});

describe('leçon « Jouer une carte » : le geste réel', () => {
  it('la consigne et l’indice passent par « Lancer ce sort »', () => {
    const step = LESSONS.find(l => l.id === 'cartes')!.steps[1];
    expect(step.text).toContain('« Lancer ce sort »');
    expect(step.hint).toContain('« Lancer ce sort »');
    expect(step.text).not.toMatch(/choisissez la carte, puis la case/);
  });
});

describe('partie en direct de l’accueil : pays de l’adversaire', () => {
  it('fuseau horaire → pays, et la bonne préposition en français', async () => {
    const { countryOfTimezone } = await import('../src/server/timezones');
    const { fromCountry } = await import('../src/client/odyssee/country');
    expect(countryOfTimezone('Europe/Paris')).toBe('FR');
    expect(countryOfTimezone('Asia/Calcutta')).toBe('IN');
    expect(countryOfTimezone('UTC')).toBeNull();
    expect(fromCountry('FR')).toBe('depuis la France');
    expect(fromCountry('CA')).toBe('depuis le Canada');
    expect(fromCountry('US')).toBe('depuis les États-Unis');
    expect(fromCountry('ES')).toBe('depuis l’Espagne');
    expect(fromCountry('IL')).toBe('depuis Israël');
    expect(fromCountry('MX')).toBe('depuis le Mexique');
    expect(fromCountry(null)).toBeNull();
  });
});

describe('émotes : une minuterie par camp (défaut 10)', () => {
  afterEach(() => vi.useRealTimers());
  it('la seconde émote reste affichée tout son temps, la minuterie de la première est annulée', () => {
    vi.useFakeTimers();
    const shown: Record<string, { text: string; key: number } | null> = { w: null, b: null };
    const t = emoteTimers((c, e) => (shown[c] = e), 2800);
    t.show('w', 'Salut !');
    const k1 = shown.w!.key;
    vi.advanceTimersByTime(2000);
    t.show('w', 'Bien joué !');
    expect(shown.w).toEqual({ text: 'Bien joué !', key: k1 + 1 });
    vi.advanceTimersByTime(800); // la minuterie de la première aurait effacé la seconde ici
    expect(shown.w?.text).toBe('Bien joué !');
    vi.advanceTimersByTime(1999);
    expect(shown.w?.text).toBe('Bien joué !');
    vi.advanceTimersByTime(1);
    expect(shown.w).toBeNull();
  });
  it('les deux camps sont indépendants ; clear() annule tout (revanche, départ)', () => {
    vi.useFakeTimers();
    const shown: Record<string, { text: string; key: number } | null> = { w: null, b: null };
    const t = emoteTimers((c, e) => (shown[c] = e), 2800);
    t.show('w', 'Salut !');
    vi.advanceTimersByTime(1000);
    t.show('b', 'Merci !');
    vi.advanceTimersByTime(1800);
    expect(shown).toEqual({ w: null, b: { text: 'Merci !', key: 2 } });
    t.clear();
    vi.advanceTimersByTime(10_000);
    expect(shown.b?.text).toBe('Merci !');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('cartes : pastilles et moment selon les règles de la partie', () => {
  it('endsTurn (SpellCard) suit cardEndsTurn (rulesCore) pour toutes les cartes', () => {
    for (const id of CARD_IDS) {
      for (const r of [{ cardEndsTurn: false }, { cardEndsTurn: true }]) expect(endsTurn(CARDS[id], r)).toBe(cardEndsTurn(CARDS[id], r));
    }
  });
  it('au défaut, les libellés d’avant', () => {
    expect(turnEffect(CARDS.tide).label).toBe('Remplace votre coup');
    expect(turnEffect(CARDS.blast, 'opponent').label).toBe('En plus de son coup');
    expect(cardTiming(CARDS.blast)).toBe('Présage : annoncée maintenant, elle arrive au début de votre prochain tour. Vous jouez votre coup juste après l’annonce.');
    expect(cardTiming(CARDS.blast, 'opponent')).toBe('Présage : annoncée, elle arrive au début du tour suivant de votre adversaire.');
    expect(cardTiming(CARDS.tide)).toBe('Rituel : la carte remplace votre coup.');
    expect(cardTiming(CARDS.ice_wall)).toBe('Effet immédiat sur la case choisie, puis vous jouez votre coup.');
    expect(cardTiming(CARDS.ice_wall, 'opponent', RULES_V1)).toBe('Effet immédiat sur la case choisie, puis il joue son coup.');
    expect(ruleBody(CARDS.blast)).toBe(CARDS.blast.description.replace(/^Annoncée?, (?:il|elle) arrive au début de votre prochain tour\.\s*/u, ''));
    expect(ruleBody(CARDS.blast)).not.toMatch(/^Annonc/);
  });
  it('carte à la place du coup, Présages à 4 demi-coups', () => {
    const r = { cardEndsTurn: true, presageDelay: 4 };
    expect(turnEffect(CARDS.ice_wall, 'self', r).label).toBe('Remplace votre coup');
    expect(cardTiming(CARDS.ice_wall, 'self', r)).toBe('Effet immédiat sur la case choisie, à la place de votre coup.');
    expect(cardTiming(CARDS.blast, 'self', r)).toBe('Présage : annoncée maintenant, elle arrive au début de votre deuxième tour à venir. L’annonce remplace votre coup.');
    expect(cardTiming(CARDS.blast, 'opponent', r)).toBe('Présage : annoncée, elle arrive au début de son deuxième tour à venir. L’annonce remplace son coup.');
  });
});

describe('coque : main, refus et message après un lancement', () => {
  const s0 = createGame({ w: ['ice_wall', 'blast', 'tide'], b: ['truce', 'rift', 'blood_moon'] }, true, 'climats');
  it('message après un lancement : identique au défaut', () => {
    expect(castMessage('ice_wall')).toBe('Sort lancé. Jouez maintenant votre coup.');
    expect(castMessage('blast')).toBe('Annoncé : arrive au début de votre prochain tour. Jouez maintenant votre coup.');
    expect(castMessage('ice_wall', { cardEndsTurn: false, presageDelay: 2 }, 1)).toBe('Sort lancé. Un autre sort, ou jouez votre coup.');
  });
  it('carte lancée ce tour : castsThisTurn (liste) et castThisTurn (accueil) concordent', () => {
    expect(castsThisTurn(s0, 'w')).toEqual([]);
    const r = playCard(s0, 'w', 1, [], 'skin:arcane');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(castsThisTurn(r.state, 'w')).toEqual(['blast']);
    expect(castThisTurn(r.state, 'w')).toBe('blast');
    expect(castsThisTurn(r.state, 'b')).toEqual([]);
    // Pourquoi les autres cartes ne se jouent plus : le budget du tour
    const notes = handNotes(r.state, 'w', true, [false, false, false]);
    expect(notes).toEqual([
      'Un seul sort par tour : vous en avez déjà lancé un.',
      null,
      'Un seul sort par tour : vous en avez déjà lancé un.',
    ]);
    // Au tour adverse
    const m = playMove(r.state, 12, 28);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(handNotes(m.state, 'w', false, [false, false, false])[0]).toBe('Jouable à votre tour, avant votre coup.');
    expect(castsThisTurn(m.state, 'w')).toEqual([]);
  });
});

describe('partie : pendules, cadences, numérotation, délai du premier coup', () => {
  it('formatClock : dixièmes, minutes, heures', () => {
    expect(formatClock(9_400)).toBe('9,4');
    expect(formatClock(10_000)).toBe('0:10');
    expect(formatClock(600_000)).toBe('10:00');
    expect(formatClock(899_001)).toBe('15:00');
    expect(formatClock(3_605_000)).toBe('1:00:05');
  });
  it('cadences : libellés d’avant, sans arrondi hors liste', () => {
    const c = (initial: number, increment: number) => ({ initial, increment, w: 0, b: 0, running: null, serverNow: 0, rate: { w: 1, b: 1 } });
    expect(tcLabel(c(180, 2))).toBe('3 + 2');
    expect(tcLabel(null)).toBe('Sans limite');
    expect(tcLabel(c(420, 3))).toBe('7 + 3');
    expect(tcLabel(c(90, 0))).toBe('1,5 + 0');
    expect(tcLong(c(600, 5))).toBe('10 min + 5 s par coup');
    expect(tcLong(c(300, 0))).toBe('5 min');
    expect(tcLong(null)).toBe('sans limite de temps');
    expect(tcLong(c(30, 0))).toBe('30 s');
  });
  it('numérotation depuis la position de départ', () => {
    expect(firstMoveNumber(RULES_V1)).toBe(1);
    expect(firstMoveNumber({ startFen: '4k3/8/8/8/8/8/8/4K3 b - - 0 12' })).toBe(12);
    const log = [
      { k: 'move', c: 'b', san: 'e5' },
      { k: 'move', c: 'w', san: 'd4' },
    ] as unknown as Parameters<typeof moveLines>[0];
    expect(moveLines(log, 12).map(l => (l.k === 'pair' ? l.n : 0))).toEqual([12, 13]);
    expect(moveLines(log).map(l => (l.k === 'pair' ? l.n : 0))).toEqual([1, 2]);
  });
  it('délai du premier coup : seuil d’affichage de 120 s, ou le délai entier s’il est plus long', () => {
    expect(firstMoveShown()).toBe(120);
    expect(firstMoveShown(45_000)).toBe(120);
    expect(firstMoveShown(180_000)).toBe(180);
  });
});
