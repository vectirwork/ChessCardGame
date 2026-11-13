// Choix des cartes (src/client/game/CardDraft.tsx) : phrases et décisions pures (src/client/game/draftText.ts).
// Au réglage par défaut (3 cartes parmi les Pouvoirs), chaque phrase est celle d'avant au caractère près ; pour 1 et
// 5 cartes, les accords suivent.
import { describe, expect, it } from 'vitest';
import { CARDS, cardsOf } from '../src/shared/cards';
import { RULES_V1 } from '../src/shared/config/rules';
import type { Rules } from '../src/shared/config/rules';
import * as T from '../src/client/game/draftText';

const POUVOIRS = cardsOf('climats');
const SANS_SABLIER = POUVOIRS.filter(id => id !== 'hourglass');

describe('choix des cartes : textes identiques au défaut (3 cartes)', () => {
  it('titres, notes, bouton, attente', () => {
    expect(T.titreChoix(3)).toEqual({ avant: 'Choisissez vos ', em: 'trois', apres: ' cartes.' });
    expect(T.titreSpectateur(3)).toEqual({ avant: 'Les joueurs choisissent leurs ', em: 'cartes', apres: '.' });
    expect(T.dejaComplet(3)).toBe('Vous avez déjà trois cartes : retirez-en une pour en prendre une autre.');
    expect(T.choixComplet(3)).toBe('Trois cartes choisies : validez-les quand vous êtes prêt.');
    expect([3, 2, 1].map(T.encore)).toEqual(['Encore trois cartes', 'Encore deux cartes', 'Encore une carte']);
    expect(T.attenteAdversaire(3)).toBe('Vos cartes sont choisies. En attente de votre adversaire…');
    expect(T.cartesChoisies(3)).toBe('cartes choisies');
    expect(T.sesCartes(3)).toBe('ses cartes');
    expect(T.vosCartesLabel(3)).toBe('Vos cartes');
    expect(T.cartesDe(3, "d'Alice")).toBe("Cartes d'Alice");
    expect(T.noteRevelation(3)).toBe('Le temps était écoulé : vos cartes manquantes ont été tirées au hasard.');
  });
  it('sous-titre : spectateur, contre l’IA, entre joueurs', () => {
    const base = { n: 3, oppLabel: 'IA Sorcier', excluded: '' };
    expect(T.sousTitre({ ...base, spectator: true, vsBot: false, pool: 8 })).toBe(
      'Chacun prend trois cartes parmi ces huit pouvoirs. Les mains seront révélées quand les deux auront choisi.',
    );
    const bot = T.excludedNote(POUVOIRS, SANS_SABLIER, { vsBot: true, timed: true });
    expect(bot).toBe(' Le Sablier fou n’est pas proposé contre l’IA.');
    expect(T.sousTitre({ ...base, spectator: false, vsBot: true, pool: 7, excluded: bot })).toBe(
      'Sept pouvoirs, les mêmes pour vous deux. Lisez leur règle, prenez-en trois : IA Sorcier a choisi les siennes en secret, et les deux mains seront révélées dès votre choix. Le Sablier fou n’est pas proposé contre l’IA.',
    );
    expect(T.sousTitre({ ...base, spectator: false, vsBot: false, pool: 8 })).toBe(
      'Huit pouvoirs, les mêmes pour vous deux. Lisez leur règle, prenez-en trois : votre choix reste secret jusqu’à ce que votre adversaire ait choisi aussi, puis les deux mains sont visibles de tous.',
    );
  });
  it('cartes absentes de la réserve : dites, avec leur raison', () => {
    expect(T.excludedNote(POUVOIRS, POUVOIRS, { vsBot: false, timed: true })).toBe('');
    expect(T.excludedNote(POUVOIRS, SANS_SABLIER, { vsBot: false, timed: false })).toBe(' Le Sablier fou n’est pas proposé dans une partie sans pendule.');
    expect(T.excludedNote(POUVOIRS, SANS_SABLIER, { vsBot: true, timed: false })).toBe(' Le Sablier fou n’est pas proposé contre l’IA.');
    // Une carte absente sans raison connue (suspendue) n'est pas annoncée
    expect(T.excludedNote(POUVOIRS, SANS_SABLIER, { vsBot: false, timed: true })).toBe('');
  });
  it('expiration selon la sélection', () => {
    expect(T.expiration(0, 3)).toBe('Temps écoulé : vos cartes manquantes sont tirées au hasard…');
    expect(T.expiration(1, 3)).toBe('Temps écoulé : vos cartes manquantes sont tirées au hasard…');
    expect(T.expiration(2, 3)).toBe('Temps écoulé : votre carte manquante est tirée au hasard…');
    expect(T.expiration(3, 3)).toBe('Temps écoulé : vos cartes sont gardées…');
  });
});

describe('choix des cartes : accords pour 1 et 5 cartes', () => {
  it('une carte', () => {
    expect(T.titreChoix(1)).toEqual({ avant: 'Choisissez votre ', em: 'carte', apres: '.' });
    expect(T.titreSpectateur(1)).toEqual({ avant: 'Les joueurs choisissent leur ', em: 'carte', apres: '.' });
    expect(T.dejaComplet(1)).toBe('Vous avez déjà votre carte : retirez-la pour en prendre une autre.');
    expect(T.choixComplet(1)).toBe('Carte choisie : validez-la quand vous êtes prêt.');
    expect(T.attenteAdversaire(1)).toBe('Votre carte est choisie. En attente de votre adversaire…');
    expect(T.sesCartes(1)).toBe('sa carte');
    expect(T.vosCartesLabel(1)).toBe('Votre carte');
    expect(T.cartesDe(1, 'de Bruno')).toBe('Carte de Bruno');
    expect(T.noteRevelation(1)).toBe('Le temps était écoulé : votre carte a été tirée au hasard.');
    expect(T.expiration(0, 1)).toBe('Temps écoulé : votre carte est tirée au hasard…');
    expect(T.expiration(1, 1)).toBe('Temps écoulé : votre carte est gardée…');
    expect(T.sousTitre({ spectator: true, vsBot: false, n: 1, pool: 8, oppLabel: '', excluded: '' })).toBe(
      'Chacun prend une carte parmi ces huit pouvoirs. Les mains seront révélées quand les deux auront choisi.',
    );
    expect(T.sousTitre({ spectator: false, vsBot: true, n: 1, pool: 7, oppLabel: 'IA Apprenti', excluded: '' })).toBe(
      'Sept pouvoirs, les mêmes pour vous deux. Lisez leur règle, prenez-en une : IA Apprenti a choisi la sienne en secret, et les deux mains seront révélées dès votre choix.',
    );
  });
  it('cinq cartes', () => {
    expect(T.titreChoix(5)).toEqual({ avant: 'Choisissez vos ', em: 'cinq', apres: ' cartes.' });
    expect(T.dejaComplet(5)).toBe('Vous avez déjà cinq cartes : retirez-en une pour en prendre une autre.');
    expect(T.choixComplet(5)).toBe('Cinq cartes choisies : validez-les quand vous êtes prêt.');
    expect(T.sousTitre({ spectator: false, vsBot: false, n: 5, pool: 8, oppLabel: '', excluded: '' })).toMatch(/^Huit pouvoirs, .*prenez-en cinq : votre choix/);
    expect(T.expiration(3, 5)).toBe('Temps écoulé : vos cartes manquantes sont tirées au hasard…');
  });
});

describe('choix des cartes : décisions', () => {
  it('note de la révélation : le serveur fait foi (filled), sinon l’heuristique d’avant', () => {
    const jamais = () => false;
    const toujours = () => true;
    // Sélection complète, pas de validation : le serveur ne tire rien → pas de note (défaut 8 corrigé)
    expect(T.revealNote('w', { auto: ['w'], filled: [] }, toujours)).toBe(false);
    // Sélection incomplète : le serveur a tiré des cartes → note
    expect(T.revealNote('w', { auto: ['w'], filled: ['w'] }, jamais)).toBe(true);
    // Validation trop tardive : le serveur a complété au hasard → note, même si l'onglet avait validé (défaut 9)
    expect(T.revealNote('b', { auto: ['b'], filled: ['b'] }, jamais)).toBe(true);
    // L'adversaire seulement
    expect(T.revealNote('w', { auto: ['b'], filled: ['b'] }, toujours)).toBe(false);
    // Ancien serveur (sans filled) ou événement manqué : l'heuristique
    expect(T.revealNote('w', { auto: ['w'] }, toujours)).toBe(true);
    expect(T.revealNote('w', null, jamais)).toBe(false);
    expect(T.revealNote('w', undefined, toujours)).toBe(true);
    // Spectateur : jamais
    expect(T.revealNote(null, { auto: ['w'], filled: ['w'] }, toujours)).toBe(false);
  });
  it('verrou 500 ms avant l’échéance', () => {
    expect(T.DRAFT_LOCK_MS).toBe(500);
    expect(T.draftClosing(10_000, 9_499)).toBe(false);
    expect(T.draftClosing(10_000, 9_500)).toBe(true);
    expect(T.draftClosing(10_000, 12_000)).toBe(true);
  });
  it('colonnes de la réserve : 4 pour 7 ou 8 cartes (rien à imposer), de 2 à 5 sinon', () => {
    expect(T.gridColumns(8)).toBeNull();
    expect(T.gridColumns(7)).toBeNull();
    expect([1, 2, 3, 4, 5, 6, 9, 10, 12].map(T.poolColumns)).toEqual([2, 2, 2, 2, 3, 3, 5, 5, 5]);
    expect(T.gridColumns(9)).toBe(5);
    expect(T.gridColumns(5)).toBe(3);
  });
  it('raccourcis : touches 1 à 9, pour les 9 premières cartes', () => {
    expect(T.shortcutCount(8)).toBe(8);
    expect(T.shortcutCount(12)).toBe(9);
    expect(T.shortcutIndex('1', 8)).toBe(0);
    expect(T.shortcutIndex('8', 8)).toBe(7);
    expect(T.shortcutIndex('9', 8)).toBeNull();
    expect(T.shortcutIndex('9', 12)).toBe(8);
    expect(T.shortcutIndex('0', 12)).toBeNull();
    expect(T.shortcutIndex('a', 12)).toBeNull();
  });
  it('donne de la révélation : k·n + i (0 à 5 pour deux mains de 3, comme avant)', () => {
    expect([0, 1].flatMap(k => [0, 1, 2].map(i => T.dealOrder(k, 3, i)))).toEqual([0, 1, 2, 3, 4, 5]);
    expect([0, 1].flatMap(k => [0, 1, 2, 3, 4].map(i => T.dealOrder(k, 5, i)))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('choix des cartes : tuiles selon les règles de la partie (rulesOf(view.state))', () => {
  const tuile = (r: Rules) => Object.fromEntries(POUVOIRS.map(id => [id, { ...T.tilePills(CARDS[id], r), meta: T.cardMeta(CARDS[id], r) }]));
  it('au défaut (RULES_V1) : pastilles, moment et durée d’avant, au caractère près', () => {
    const plus = 'En plus de votre coup';
    const next = { when: 'Au prochain tour', next: true, turn: plus, replace: false };
    const now = { when: 'Immédiat', next: false, turn: plus, replace: false };
    expect(tuile(RULES_V1)).toEqual({
      hourglass: { ...next, meta: 'Climat · 6 coups' },
      truce: { ...next, meta: 'Climat · 3 coups' },
      blood_moon: { ...next, meta: 'Climat · 3 coups' },
      ice_age: { ...next, meta: 'Climat · 4 coups' },
      blast: { ...next, meta: 'Climat · 4 coups' },
      ice_wall: { ...now, meta: 'Terrain · Permanent · toute la partie' },
      rift: { ...now, meta: 'Terrain · 4 coups' },
      tide: { ...now, turn: 'Remplace votre coup', replace: true, meta: 'Événement · instantané' },
    });
    // Sans règles : celles du jour (cardMeta d'avant, lue dans CARDS)
    for (const id of POUVOIRS) expect(T.cardMeta(CARDS[id])).toBe(T.cardMeta(CARDS[id], RULES_V1));
  });
  it('carte à la place du coup, Présages à 4 demi-coups, Trêve en 4 coups : la tuile suit la partie, pas le jour', () => {
    const r: Rules = { ...RULES_V1, cardEndsTurn: true, presageDelay: 4, tuning: { ...RULES_V1.tuning, truce: { coups: 4 } } };
    const t = tuile(r);
    for (const id of POUVOIRS) {
      expect(t[id].turn, id).toBe('Remplace votre coup');
      expect(t[id].replace, id).toBe(true);
      expect(t[id].when, id).toBe(CARDS[id].presage ? 'Dans deux tours' : 'Immédiat');
    }
    expect(t.truce.meta).toBe('Climat · 4 coups');
    expect(t.blood_moon.meta).toBe('Climat · 3 coups');
  });
});
