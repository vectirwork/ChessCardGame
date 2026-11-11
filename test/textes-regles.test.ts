// Phrases de règles dérivées (src/shared/text/regles.ts) : avec les règles historiques (RULES_V1) et la mise en
// place de la conception (DEAL_V1 ci-dessous), chacune est la chaîne actuelle du site, copiée telle quelle
// (apostrophes comprises ; aucune de ces phrases n'a d'espace insécable : le site n'en écrit qu'une à la main,
// ailleurs, OdysseeHome.tsx:1426 « Essayez-les\u00a0: »). Ce test est la trace des textes.
// Les règles sont figées ici (RULES_V1, DEAL_V1), jamais lues dans GAME_RULES ou DEAL : changer un réglage ne fait pas
// échouer ce fichier. Que les réglages du jour valent encore ceux-là, c'est test/garde-fous/defauts.test.ts qui le dit.
// Chaque référence indique sa source (fichier:ligne au commit 7148547, avant la passe « polymorphe »).
import { describe, expect, it } from 'vitest';
import { CARDS, cardsOf } from '../src/shared/cards';
import { RULES_V1 } from '../src/shared/config/rules';
import type { DealSettings, GameRulesSettings } from '../src/shared/config/rules';
import { apostrophes, cap, enLettres } from '../src/shared/text/fr';
import {
  apresLancement, arriveePresage, cartesChacun, cartesDePouvoir, cartesDuCatalogue, cartesVisibles, consigneTour,
  constitutionMains, dejaLance, dureeChoix, dureeEffet, etendueRangees, limitesMain, mainLabel, momentCarte,
  niveauxIA, nomsNiveaux, parTour, pouvoirs, premierApres, prochainTour, rangees, refusBudget, regle50, repetition,
  sortAuPlus, sortParTour, sortsEnMain, vitesse, vosCartes, vosSorts,
} from '../src/shared/text/regles';

const R = RULES_V1;
/** Mise en place de la conception : choix des cartes en 45 s ; R9 : au plus 1 Légendaire et 2 Climats par main. */
const DEAL_V1: Pick<DealSettings, 'draft' | 'draftMs' | 'handLimits'> = {
  draft: true,
  draftMs: 45_000,
  handLimits: { maxPerRarity: { légendaire: 1 }, maxPerFamily: { climat: 2 } },
};
const avec = (p: Partial<GameRulesSettings>): GameRulesSettings => ({ ...RULES_V1, ...p });
const POOL = cardsOf('climats').map(id => CARDS[id]);
const T = RULES_V1.tuning;

describe('phrases au réglage par défaut : identiques au site', () => {
  const cas: [string, string, string][] = [
    // [source, obtenu, attendu]
    ['index.html:7 ; Layout.tsx:241 ; OdysseeHome.tsx:1202 ; Play.tsx:200 ; overlays.tsx:127', cartesDePouvoir(R), 'trois cartes de pouvoir'],
    ['Rules.tsx:22, 105 ; lessons.ts:430', cartesChacun(R, true), 'Trois cartes chacun'],
    ['data.ts:148', cartesVisibles(R), 'Trois cartes, visibles.'],
    ['Rules.tsx:25 ; Play.tsx:291 ; lessons.ts:435 ; data.ts:149', vosCartes(R), 'vos trois cartes'],
    ['OdysseeHome.tsx:1234, 1242', vosSorts(R, true), 'Vos trois sorts'],
    ['OdysseeHome.tsx:1334', sortsEnMain(R, true), 'Trois sorts'],
    ['OdysseeHome.tsx:1202 ; index.html:14', sortParTour(R), 'un sort par tour'],
    ['Rules.tsx:32 ; data.ts:153', sortParTour(R, true), 'Un sort par tour'],
    ['GameShell.tsx:593 ; GamePage.tsx:826', mainLabel(R), 'Votre main · un sort par tour'],
    ['Rules.tsx:107', sortAuPlus(R), 'Un sort par tour au plus, toujours facultatif.'],
    ['lessons.ts:430', parTour(R), 'une par tour'],
    ['lessons.ts:435', parTour(R, true), 'une seule par tour'],
    ['lessons.ts:430', momentCarte(R), 'avant le coup'],
    ['GamePage.tsx:576', consigneTour(R), 'Une seule carte par tour, toujours avant le coup.'],
    ['game.ts:660 ; OdysseeHome.tsx:1644, 1649', refusBudget(R), 'Une seule carte par tour.'],
    ['shell/cards.ts:18', dejaLance(R), 'Un seul sort par tour : vous en avez déjà lancé un.'],
    ['shell/cards.ts:47', apresLancement(R, false), 'Sort lancé. Jouez maintenant votre coup.'],
    ['shell/cards.ts:46', apresLancement(R, true), 'Annoncé : arrive au début de votre prochain tour. Jouez maintenant votre coup.'],
    ['Rules.tsx:117 ; Play.tsx:291', dureeChoix(DEAL_V1), '45 secondes'],
    ['Rules.tsx:25 ; lessons.ts:435', constitutionMains(R, DEAL_V1), 'vous choisissez vos trois cartes ; sur l’accueil, elles sont tirées au hasard'],
    ['data.ts:149', apostrophes(constitutionMains(R, DEAL_V1), 'droite'), "vous choisissez vos trois cartes ; sur l'accueil, elles sont tirées au hasard"],
    ['Rules.tsx:117', limitesMain(POOL, DEAL_V1.handLimits) ?? '', 'au plus deux Climats par main'],
    ['Rules.tsx:105, 117, 218, 284 ; lessons.ts:456, 464 ; Puzzles.tsx:110', pouvoirs(8), 'huit pouvoirs'],
    ['cards.ts:45', pouvoirs(8, true), 'Huit pouvoirs'],
    ['Rules.tsx:287 ; lessons.ts:460', cartesDuCatalogue(8), 'huit cartes'],
    ['Play.tsx:34 ; data.ts:169', niveauxIA(3), '3 niveaux'],
    ['Play.tsx:34 ; data.ts:170', nomsNiveaux(['Apprenti', 'Sorcier', 'Archimage']), 'Apprenti, Sorcier ou Archimage'],
    ['Layout.tsx:42', nomsNiveaux(['Apprenti', 'Sorcier', 'Archimage'], ','), 'Apprenti, Sorcier, Archimage'],
    ['game.ts:1156 (RESULT_TEXT)', regle50(R, true), 'Règle des 50 coups'],
    ['Rules.tsx:19', regle50(R), 'règle des 50 coups'],
    ['game.ts:1155 (RESULT_TEXT)', repetition(R, true), 'Triple répétition'],
    ['Rules.tsx:19', repetition(R), 'triple répétition'],
    ['parts.tsx:127 ; cardScenes.ts:220 ; cards.ts:122', vitesse(2), 'deux fois plus vite'],
    ['cardScenes.ts:219', vitesse(2, true), 'Deux fois plus vite'],
  ];
  for (const [source, obtenu, attendu] of cas) {
    it(`${attendu} (${source})`, () => expect(obtenu).toBe(attendu));
  }
});

describe('phrases complètes du site recomposées au défaut', () => {
  it('index.html:7 (meta description)', () => {
    expect(`Jouez aux échecs avec ${cartesDePouvoir(R)} qui changent la partie pour les deux camps : Trêve, Lune de sang, Mur de glace… Gratuit, en ligne, sans inscription, contre l’IA ou un ami.`).toBe(
      'Jouez aux échecs avec trois cartes de pouvoir qui changent la partie pour les deux camps : Trêve, Lune de sang, Mur de glace… Gratuit, en ligne, sans inscription, contre l’IA ou un ami.',
    );
  });
  it('index.html:14 (og:description)', () => {
    expect(`Une vraie partie d’échecs, ${cartesDePouvoir(R)} visibles des deux joueurs, ${sortParTour(R)}. Gratuit, en ligne, avec ou sans compte.`).toBe(
      'Une vraie partie d’échecs, trois cartes de pouvoir visibles des deux joueurs, un sort par tour. Gratuit, en ligne, avec ou sans compte.',
    );
  });
  it('Rules.tsx:117 (choix des cartes)', () => {
    const n = R.cardsPerPlayer;
    expect(
      `Le choix des cartes dure ${dureeChoix(DEAL_V1)} : ${enLettres(n, 'f')} cartes différentes parmi les ${pouvoirs(8)}, sans autre contrainte. Si le temps s’écoule, celles qui vous manquent sont tirées au hasard. Sur l’accueil, le tirage favorise les cartes les moins rares, avec ${limitesMain(POOL, DEAL_V1.handLimits)}.`,
    ).toBe(
      'Le choix des cartes dure 45 secondes : trois cartes différentes parmi les huit pouvoirs, sans autre contrainte. Si le temps s’écoule, celles qui vous manquent sont tirées au hasard. Sur l’accueil, le tirage favorise les cartes les moins rares, avec au plus deux Climats par main.',
    );
  });
  it('lessons.ts:430 (résumé de la leçon)', () => {
    expect(`${cartesChacun(R, true)}, visibles des deux joueurs ; ${parTour(R)}, ${momentCarte(R)}.`).toBe(
      'Trois cartes chacun, visibles des deux joueurs ; une par tour, avant le coup.',
    );
  });
  it('OdysseeHome.tsx:1202 (accroche de l’accueil)', () => {
    expect(`Une vraie partie d'échecs, ${cartesDePouvoir(R)}, ${sortParTour(R)}.`).toBe("Une vraie partie d'échecs, trois cartes de pouvoir, un sort par tour.");
  });
  it('Play.tsx:291 (aide du choix des cartes)', () => {
    expect(`Vous choisirez ${vosCartes(R)} au début de la partie, en ${dureeChoix(DEAL_V1)}`).toBe(
      'Vous choisirez vos trois cartes au début de la partie, en 45 secondes',
    );
  });
});

describe('textes des cartes : gabarits égaux aux textes actuels (cards.ts)', () => {
  it('durées des effets', () => {
    for (const id of cardsOf('climats')) {
      const d = CARDS[id];
      if (d.coups !== undefined) expect(dureeEffet(d.coups), id).toBe(d.duration);
    }
    expect(dureeEffet(T.hourglass!.coups!)).toBe('6 coups (3 chacun)');
    expect(dureeEffet(T.truce!.coups!)).toBe('3 coups (vous, lui, vous)');
    expect(dureeEffet(6)).toBe('6 coups (3 chacun)');
    expect(dureeEffet(3)).toBe('3 coups (vous, lui, vous)');
    expect(dureeEffet(4)).toBe('4 coups (2 chacun)');
  });
  it('arrivée des Présages, selon le genre de la carte', () => {
    for (const id of cardsOf('climats')) {
      const d = CARDS[id];
      if (d.presage) expect(d.description.startsWith(`${arriveePresage(RULES_V1.presageDelay, d.genre)}. `), id).toBe(true);
    }
  });
  it('qui reprend le premier (parité de la durée)', () => {
    expect(premierApres(T.truce!.coups!)).toBe('adversaire');
    expect(CARDS.truce.description).toContain('L’adversaire reprend les captures le premier.');
    expect(premierApres(T.blood_moon!.coups!)).toBe('adversaire');
    expect(CARDS.blood_moon.description).toContain('L’adversaire retrouve le premier sa liberté.');
    expect(premierApres(4)).toBe('vous');
  });
  it('rangées du Mur, de la Faille et de la Grande Marée', () => {
    expect(rangees(T.ice_wall!.ranks!)).toBe('entre la 3e et la 6e rangée');
    expect(CARDS.ice_wall.description).toContain(rangees(CARDS.ice_wall.ranks!));
    expect(CARDS.ice_wall.prompts[0]).toBe(`Choisissez une case vide ${rangees(CARDS.ice_wall.ranks!)}`);
    expect(rangees(T.rift!.ranks!)).toBe('la 4e ou la 5e rangée');
    expect(CARDS.rift.description.startsWith(`Choisissez ${rangees(CARDS.rift.ranks!)}. `)).toBe(true);
    expect(CARDS.rift.prompts[0]).toBe(`Choisissez ${rangees(CARDS.rift.ranks!)} (une case de la rangée)`);
    expect(etendueRangees(T.tide!.ranks!)).toBe('2e à 5e rangées');
    expect(CARDS.tide.description).toContain(`sur leurs ${etendueRangees(CARDS.tide.ranks!)} avancent`);
    // lessons.ts:438 : « de la 3e à la 6e rangée »
    expect(rangees(T.ice_wall!.ranks!, 'de')).toBe('de la 3e à la 6e rangée');
  });
  it('vitesse du Sablier fou', () => {
    expect(vitesse(T.hourglass!.clockRate!)).toBe('deux fois plus vite');
    expect(CARDS.hourglass.description).toContain(`s’écoulent ${vitesse(CARDS.hourglass.clockRate!)}`);
  });
});

describe('autres réglages', () => {
  it('majuscule en tête de phrase', () => {
    expect(vosCartes(R, true)).toBe('Vos trois cartes');
  });
  it('N = 1', () => {
    const r = avec({ cardsPerPlayer: 1 });
    expect(cartesDePouvoir(r)).toBe('une carte de pouvoir');
    expect(cartesChacun(r, true)).toBe('Une carte chacun');
    expect(cartesVisibles(r)).toBe('Une carte, visible.');
    expect(vosCartes(r)).toBe('votre carte');
    expect(vosSorts(r, true)).toBe('Votre sort');
    expect(sortsEnMain(r, true)).toBe('Un sort');
    expect(constitutionMains(r, DEAL_V1)).toBe('vous choisissez votre carte ; sur l’accueil, elle est tirée au hasard');
    expect(constitutionMains(r, { draft: false })).toBe('votre carte est tirée au hasard');
  });
  it('N = 2', () => {
    const r = avec({ cardsPerPlayer: 2 });
    expect(cartesDePouvoir(r)).toBe('deux cartes de pouvoir');
    expect(cartesChacun(r, true)).toBe('Deux cartes chacun');
    expect(vosCartes(r)).toBe('vos deux cartes');
    expect(vosSorts(r, true)).toBe('Vos deux sorts');
    expect(sortsEnMain(r, true)).toBe('Deux sorts');
  });
  it('N = 5', () => {
    const r = avec({ cardsPerPlayer: 5 });
    expect(cartesDePouvoir(r)).toBe('cinq cartes de pouvoir');
    expect(cartesVisibles(r)).toBe('Cinq cartes, visibles.');
    expect(vosCartes(r)).toBe('vos cinq cartes');
    expect(constitutionMains(r, { draft: false })).toBe('vos cinq cartes sont tirées au hasard');
  });
  it('2 cartes par tour', () => {
    const r = avec({ cardsPerTurn: 2 });
    expect(sortParTour(r)).toBe('deux sorts par tour');
    expect(mainLabel(r)).toBe('Votre main · deux sorts par tour');
    expect(consigneTour(r)).toBe('Deux cartes au plus par tour, avant le coup.');
    expect(refusBudget(r)).toBe('Deux cartes par tour au plus.');
    expect(dejaLance(r)).toBe('Deux sorts par tour : vous les avez déjà lancés.');
    expect(sortAuPlus(r)).toBe('Deux sorts par tour au plus, toujours facultatifs.');
    expect(parTour(r)).toBe('deux au plus par tour');
    expect(apresLancement(r, false, 1)).toBe('Sort lancé. Un autre sort, ou jouez votre coup.');
    expect(apresLancement(r, false, 0)).toBe('Sort lancé. Jouez maintenant votre coup.');
  });
  it('carte à la place du coup', () => {
    const r = avec({ cardEndsTurn: true });
    expect(sortParTour(r)).toBe('un sort par tour, à la place du coup');
    expect(consigneTour(r)).toBe('Une seule carte par tour, à la place du coup.');
    expect(momentCarte(r)).toBe('à la place du coup');
    expect(apresLancement(r, false)).toBe('Sort lancé.');
  });
  it('choix en 30 s, Présage à 4, 75 coups, double répétition', () => {
    expect(dureeChoix({ draftMs: 30_000 })).toBe('30 secondes');
    expect(dureeChoix({ draftMs: 60_000 })).toBe('1 minute');
    expect(prochainTour(2)).toBe('votre prochain tour');
    expect(prochainTour(4)).toBe('votre deuxième tour à venir');
    expect(prochainTour(6)).toBe('votre troisième tour à venir');
    expect(apresLancement(avec({ presageDelay: 4 }), true)).toBe('Annoncé : arrive au début de votre deuxième tour à venir. Jouez maintenant votre coup.');
    expect(arriveePresage(4, 'f')).toBe('Annoncée, elle arrive au début de votre deuxième tour à venir');
    expect(regle50(avec({ fiftyHalfmoves: 150 }), true)).toBe('Règle des 75 coups');
    expect(repetition(avec({ repetitions: 2 }), true)).toBe('Double répétition');
  });
  it('catalogue et IA', () => {
    expect(pouvoirs(9, true)).toBe('Neuf pouvoirs');
    expect(pouvoirs(1)).toBe('un pouvoir');
    expect(cartesDuCatalogue(1)).toBe('une carte');
    expect(niveauxIA(4)).toBe('4 niveaux');
    expect(niveauxIA(1)).toBe('1 niveau');
    expect(vitesse(3)).toBe('trois fois plus vite');
    expect(vitesse(1.5)).toBe('une fois et demie plus vite');
  });
  it('contraintes du tirage', () => {
    const deuxLegendaires = [...POOL, { family: 'terrain' as const, rarity: 'légendaire' as const }, { family: 'evenement' as const, rarity: 'légendaire' as const }];
    expect(limitesMain(deuxLegendaires, DEAL_V1.handLimits)).toBe('au plus deux Climats et une Légendaire par main');
    expect(limitesMain(POOL, { maxPerFamily: { climat: 3 }, maxPerRarity: {} })).toBe('au plus trois Climats par main');
    expect(limitesMain(POOL, { maxPerFamily: {}, maxPerRarity: {} })).toBeNull();
    expect(limitesMain(POOL, DEAL_V1.handLimits)).toBe('au plus deux Climats par main');
  });
  it('rangées', () => {
    expect(rangees([3])).toBe('la 4e rangée');
    expect(rangees([0])).toBe('la 1re rangée');
    expect(rangees([1, 3, 5])).toBe('la 2e, la 4e ou la 6e rangée');
    expect(etendueRangees([1, 2])).toBe('2e et 3e rangées');
    expect(etendueRangees([1])).toBe('2e rangée');
    expect(dureeEffet(5)).toBe('5 coups (3 pour vous, 2 pour lui)');
    expect(dureeEffet(1)).toBe('1 coup (le vôtre)');
    expect(dureeEffet(2)).toBe('2 coups (1 chacun)');
    expect(cap(arriveePresage(2, 'm'))).toBe('Annoncé, il arrive au début de votre prochain tour');
  });
});
