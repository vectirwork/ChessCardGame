// Corrections finales de la passe V2 (recette QA et relecture) : ce qui se vérifie sans navigateur. Le glisser à la
// souris enchaîné se vérifie dans un vrai navigateur : node test/glisser.mjs <url>.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deNom } from '../src/client/game/names';
import { powerLeft, powerTiming } from '../src/client/odyssee/shell/powers';
import { DESKTOP_OPP_ROOM, MOBILE_BOARD_TOP, OPP_FAN_SPAN, desktopHandRight, gameLayout } from '../src/client/odyssee/shell/layout';
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
  /** Largeur d'une carte adverse, comme GameShell.oppCardWidth. */
  const oppCard = (vw: number, vh: number) => {
    const l = gameLayout(vw, vh);
    return Math.floor(Math.max(44, Math.min(76, (vw - (l.x + l.G / 2) - 34 - 20 - 8) / OPP_FAN_SPAN)));
  };
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
