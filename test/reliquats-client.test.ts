// Lot 9a : reliquats des lots 5 à 8 côté client (refus par leur code, crochets du sort, cabine en RULES_V1, niveaux).
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { handNotes } from '../src/client/odyssee/shell/cards';
import { cardsOf } from '../src/shared/cards';
import type { CardId } from '../src/shared/cards';
import { cardRefusalInfo, legalMovesOf, playMove } from '../src/shared/game';
import type { GameState } from '../src/shared/game';
import { setRulesOverride } from '../src/shared/rulesCore';
import { mulberry32 } from './helpers/rng';
// Parties, tirages et choix scriptés aux règles V1 (RULES_V1, DEAL_V1), quel que soit le réglage du jour (lot 9e) :
// test/helpers/v1.ts.
import { createGame } from './helpers/v1';

const src = (f: string) => readFileSync(f, 'utf8');

describe('handNotes : refus du moteur lus par leur code', () => {
  it('carte à cible sans case possible : la bulle le dit, quel que soit le texte du refus', () => {
    const s = createGame({ w: ['ice_wall', 'blast', 'tide'], b: ['truce', 'rift', 'blood_moon'] }, true, 'climats');
    // Le Mur demande une case : sans cible, le moteur refuse avec le code target-missing
    expect(cardRefusalInfo(s, 'w', 0)).toMatchObject({ code: 'target-missing' });
    expect(handNotes(s, 'w', true, [false, true, true])[0]).toBe('Aucune case possible pour cette carte en ce moment.');
  });

  it('tout refus de carte du moteur porte un code (parties au hasard, catalogue des Pouvoirs)', () => {
    const rng = mulberry32(9);
    const pool = cardsOf('climats');
    let checked = 0;
    for (let g = 0; g < 12; g++) {
      const pick = () => [...pool].sort(() => rng() - 0.5).slice(0, 3) as CardId[];
      let s: GameState = createGame({ w: pick(), b: pick() }, g % 2 === 0, 'climats');
      for (let ply = 0; ply < 30 && !s.result; ply++) {
        const c = s.pos.turn;
        for (let i = 0; i < s.hands[c].length; i++) {
          const ref = cardRefusalInfo(s, c, i);
          if (ref?.error) {
            expect(ref.code, ref.error).toBeTruthy();
            checked++;
          }
        }
        const moves = legalMovesOf(s);
        if (!moves.length) break;
        const m = moves[Math.floor(rng() * moves.length)];
        const r = playMove(s, m.from, m.to, m.promo);
        if (!r.ok) break;
        s = r.state;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('plus de repli sur le texte des refus dans shell/cards.ts', () => {
    const s = src('src/client/odyssee/shell/cards.ts');
    expect(s).not.toContain('TARGET_TEXTS');
    expect(s).not.toContain("'Cible manquante.'");
  });
});

describe('GamePage : crochets du sort lancé', () => {
  it('secret: !rulesOf(état).handsVisible, comme l’accueil et la démonstration', () => {
    const s = src('src/client/game/GamePage.tsx');
    expect(s).toMatch(/castSafely\(v, info, skinStyle\(info\.skin\), \{[^}]*secret: !rulesOf\(u\.view\.state\)\.handsVisible,/s);
  });
});

describe('cabine de la boutique : partie de démonstration aux règles historiques', () => {
  afterEach(() => setRulesOverride(null));
  it('freshGame : RULES_V1 quelles que soient les règles du jour (aucun champ rules)', async () => {
    const { freshGame } = await import('../src/client/pages/shop/CabinBoard');
    expect(freshGame('w')).not.toHaveProperty('rules');
    setRulesOverride({ cardEndsTurn: true });
    expect(freshGame('w')).not.toHaveProperty('rules');
    expect(freshGame('b')).not.toHaveProperty('rules');
    expect(freshGame('b').pos.turn).toBe('b');
  });
});

describe('niveaux de l’IA tirés de BOT_LEVELS et BOT_PROFILES (Jouer, accueil), jamais écrits à la main', () => {
  it('Play.tsx et odyssee/data.ts : niveauxIA et nomsNiveaux sur les niveaux de bot.ts', () => {
    expect(src('src/client/pages/Play.tsx')).toContain('badge: niveauxIA(BOT_LEVELS.length),');
    expect(src('src/client/pages/Play.tsx')).toContain('nomsNiveaux(BOT_LEVELS.map(l => BOT_PROFILES[l].name))');
    expect(src('src/client/odyssee/data.ts')).toContain('tag: niveauxIA(BOT_LEVELS.length),');
    expect(src('src/client/odyssee/data.ts')).toContain('nomsNiveaux(LEVELS.map(l => l.name))');
    for (const f of ['src/client/pages/Play.tsx', 'src/client/odyssee/data.ts']) expect(src(f), f).not.toMatch(/Apprenti, Sorcier|3 niveaux/);
  });
});

describe('Règles : la clause « sur l’accueil » suit les mains de l’accueil', () => {
  it('Rules.tsx passe les mains de l’accueil (RULES_BY_CONTEXT.accueil, sinon GAME_RULES) à constitutionMains', () => {
    const s = src('src/client/pages/Rules.tsx');
    expect(s).toContain('const ACCUEIL = { cardsPerPlayer: RULES_BY_CONTEXT.accueil?.cardsPerPlayer ?? R.cardsPerPlayer };');
    expect(s.match(/constitutionMains\(R, DEAL, ACCUEIL\)/g)).toHaveLength(2);
  });
});
