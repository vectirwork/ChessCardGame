// Grammaire française des textes (src/shared/text/fr.ts).
import { describe, expect, it } from 'vitest';
import {
  LOCALE, apostrophes, cap, compte, duree, enLettres, liste, mmss, nombre, ordinal, ordinalLettres, pluriel, possessif,
  prix, romain,
} from '../src/shared/text/fr';

/** De 0 à 99 au masculin, écrits à la main (orthographe traditionnelle). */
const MASCULIN = `zéro un deux trois quatre cinq six sept huit neuf
dix onze douze treize quatorze quinze seize dix-sept dix-huit dix-neuf
vingt|vingt et un|vingt-deux|vingt-trois|vingt-quatre|vingt-cinq|vingt-six|vingt-sept|vingt-huit|vingt-neuf
trente|trente et un|trente-deux|trente-trois|trente-quatre|trente-cinq|trente-six|trente-sept|trente-huit|trente-neuf
quarante|quarante et un|quarante-deux|quarante-trois|quarante-quatre|quarante-cinq|quarante-six|quarante-sept|quarante-huit|quarante-neuf
cinquante|cinquante et un|cinquante-deux|cinquante-trois|cinquante-quatre|cinquante-cinq|cinquante-six|cinquante-sept|cinquante-huit|cinquante-neuf
soixante|soixante et un|soixante-deux|soixante-trois|soixante-quatre|soixante-cinq|soixante-six|soixante-sept|soixante-huit|soixante-neuf
soixante-dix|soixante et onze|soixante-douze|soixante-treize|soixante-quatorze|soixante-quinze|soixante-seize|soixante-dix-sept|soixante-dix-huit|soixante-dix-neuf
quatre-vingts|quatre-vingt-un|quatre-vingt-deux|quatre-vingt-trois|quatre-vingt-quatre|quatre-vingt-cinq|quatre-vingt-six|quatre-vingt-sept|quatre-vingt-huit|quatre-vingt-neuf
quatre-vingt-dix|quatre-vingt-onze|quatre-vingt-douze|quatre-vingt-treize|quatre-vingt-quatorze|quatre-vingt-quinze|quatre-vingt-seize|quatre-vingt-dix-sept|quatre-vingt-dix-huit|quatre-vingt-dix-neuf`
  .split('\n')
  .flatMap((ligne, i) => (i < 2 ? ligne.split(' ') : ligne.split('|')));

describe('enLettres', () => {
  it('table de référence complète', () => expect(MASCULIN).toHaveLength(100));
  it('de 0 à 99 au masculin', () => {
    for (let n = 0; n < 100; n++) expect(enLettres(n), String(n)).toBe(MASCULIN[n]);
    expect(enLettres(3)).toBe('trois');
  });
  it('de 0 à 99 au féminin : seul « un » final s’accorde', () => {
    for (let n = 0; n < 100; n++) {
      const attendu = MASCULIN[n].replace(/(^|[ -])un$/, '$1une');
      expect(enLettres(n, 'f'), String(n)).toBe(attendu);
    }
  });
  it('cas notables', () => {
    expect(enLettres(1, 'f')).toBe('une');
    expect(enLettres(21, 'f')).toBe('vingt et une');
    expect(enLettres(71)).toBe('soixante et onze');
    expect(enLettres(71, 'f')).toBe('soixante et onze');
    expect(enLettres(80)).toBe('quatre-vingts');
    expect(enLettres(81)).toBe('quatre-vingt-un');
    expect(enLettres(81, 'f')).toBe('quatre-vingt-une');
    expect(enLettres(91)).toBe('quatre-vingt-onze');
  });
  it('hors de 0 à 99 : en chiffres', () => {
    expect(enLettres(100)).toBe('100');
    expect(enLettres(-1)).toBe('-1');
    expect(enLettres(2.5)).toBe('2.5');
  });
});

describe('accords', () => {
  it('cap', () => {
    expect(cap('trois cartes')).toBe('Trois cartes');
    expect(cap('été')).toBe('Été');
    expect(cap('')).toBe('');
  });
  it('pluriel : singulier pour 0 et 1', () => {
    expect(pluriel(0, 'carte')).toBe('carte');
    expect(pluriel(1, 'carte')).toBe('carte');
    expect(pluriel(2, 'carte')).toBe('cartes');
    expect(pluriel(2, ['niveau', 'niveaux'])).toBe('niveaux');
    expect(pluriel(1, ['niveau', 'niveaux'])).toBe('niveau');
  });
  it('compte', () => {
    expect(compte(0, 'coup')).toBe('0 coup');
    expect(compte(1, 'coup')).toBe('1 coup');
    expect(compte(2, 'étape')).toBe('2 étapes');
    expect(compte(1, 'carte', { lettres: true, genre: 'f' })).toBe('une carte');
    expect(compte(3, 'carte', { lettres: true, genre: 'f' })).toBe('trois cartes');
    expect(compte(1, 'sort', { lettres: true })).toBe('un sort');
  });
  it('possessifs', () => {
    expect(possessif(3, 'carte', { genre: 'f' })).toBe('vos trois cartes');
    expect(possessif(1, 'carte', { genre: 'f' })).toBe('votre carte');
    expect(possessif(2, 'sort')).toBe('vos deux sorts');
    expect(possessif(1, 'sort')).toBe('votre sort');
    expect(possessif(3, 'carte', { genre: 'f', personne: 'il' })).toBe('ses trois cartes');
    expect(possessif(1, 'carte', { genre: 'f', personne: 'il' })).toBe('sa carte');
    expect(possessif(1, 'arme', { genre: 'f', personne: 'il' })).toBe('son arme');
    expect(possessif(1, 'sort', { personne: 'il' })).toBe('son sort');
  });
});

describe('durées', () => {
  it('duree', () => {
    expect(duree(45_000)).toBe('45 secondes');
    expect(duree(30_000)).toBe('30 secondes');
    expect(duree(1000)).toBe('1 seconde');
    expect(duree(60_000)).toBe('1 minute');
    expect(duree(90_000)).toBe('1 minute et 30 secondes');
    expect(duree(10 * 60_000)).toBe('10 minutes');
    expect(duree(3_600_000)).toBe('1 heure');
    expect(duree(3 * 86_400_000)).toBe('3 jours');
    expect(duree(0)).toBe('0 seconde');
  });
  it('duree courte et en lettres', () => {
    expect(duree(45_000, { court: true })).toBe('45 s');
    expect(duree(150_000, { court: true })).toBe('2 min 30 s');
    expect(duree(3_600_000, { court: true })).toBe('1 h');
    expect(duree(3_600_000, { lettres: true })).toBe('une heure');
    expect(duree(45_000, { lettres: true })).toBe('quarante-cinq secondes');
  });
  it('mmss, comme les quatre copies actuelles', () => {
    const copie = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    for (const s of [0, 9, 59, 60, 75, 599, 3599, 3600, 3725]) expect(mmss(s)).toBe(copie(s));
    expect(mmss(75)).toBe('1:15');
    expect(mmss(9.9)).toBe('0:09');
    expect(mmss(3725, { heures: true })).toBe('1:02:05');
    expect(mmss(125, { heures: true })).toBe('2:05');
  });
});

describe('ordinaux, romains, listes, prix', () => {
  it('ordinal (comme PageScene.ordinal au masculin)', () => {
    expect(ordinal(1)).toBe('1er');
    expect(ordinal(1, 'f')).toBe('1re');
    expect(ordinal(2)).toBe('2e');
    expect(ordinal(23)).toBe('23e');
  });
  it('ordinalLettres', () => {
    expect(ordinalLettres(1)).toBe('premier');
    expect(ordinalLettres(1, 'f')).toBe('première');
    expect(ordinalLettres(2)).toBe('deuxième');
    expect(ordinalLettres(3)).toBe('troisième');
    expect(ordinalLettres(4)).toBe('quatrième');
    expect(ordinalLettres(5)).toBe('cinquième');
    expect(ordinalLettres(9)).toBe('neuvième');
    expect(ordinalLettres(11)).toBe('onzième');
    expect(ordinalLettres(21)).toBe('vingt et unième');
    expect(ordinalLettres(80)).toBe('quatre-vingtième');
    expect(ordinalLettres(100)).toBe('100e');
  });
  it('romain', () => {
    expect([1, 2, 3, 4, 5, 6].map(romain)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI']);
    expect(romain(9)).toBe('IX');
    expect(romain(14)).toBe('XIV');
    expect(romain(1999)).toBe('MCMXCIX');
    expect(romain(0)).toBe('0');
  });
  it('liste', () => {
    expect(liste([])).toBe('');
    expect(liste(['a'])).toBe('a');
    expect(liste(['a', 'b'])).toBe('a et b');
    expect(liste(['Apprenti', 'Sorcier', 'Archimage'], 'ou')).toBe('Apprenti, Sorcier ou Archimage');
    expect(liste(['Apprenti', 'Sorcier', 'Archimage'], ',')).toBe('Apprenti, Sorcier, Archimage');
    expect(liste(['rois', 'échiquiers', 'sorts'])).toBe('rois, échiquiers et sorts');
  });
  it('prix : identique à formatPrice (catalog.ts)', () => {
    for (const c of [0, 199, 299, 599, 999, 1234]) {
      expect(prix(c)).toBe((c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }));
    }
    expect(LOCALE).toBe('fr-FR');
  });
  it('nombre et apostrophes', () => {
    expect(nombre(9120)).toBe((9120).toLocaleString('fr-FR'));
    expect(apostrophes('l’accueil, d’une', 'droite')).toBe("l'accueil, d'une");
    expect(apostrophes("l'accueil", 'courbe')).toBe('l’accueil');
  });
});
