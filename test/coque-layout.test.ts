// Géométrie de la coque de partie (src/client/odyssee/shell/layout.ts) : l'échiquier ne bouge jamais avec le nombre de
// cartes, et les éventails rendent exactement les valeurs d'avant pour 3 cartes (témoin test/fixtures/v1/layout.json,
// relevé sur le code d'avant la polymorphie).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as L from '../src/client/odyssee/shell/layout';

interface Taille {
  vw: number;
  vh: number;
  mobile: boolean;
  gameLayout: { G: number; x: number; y: number; mobile: boolean };
  desktopHandRight: number;
  oppCardWidth: number;
}
const TEMOIN = JSON.parse(readFileSync(new URL('./fixtures/v1/layout.json', import.meta.url), 'utf8')) as {
  constantes: Record<string, unknown>;
  tailles: Taille[];
};

describe('coque : géométrie identique au témoin (code d’avant)', () => {
  it('constantes', () => {
    const c = TEMOIN.constantes;
    expect(L.MOBILE_MAX).toBe(c.MOBILE_MAX);
    expect(L.MOBILE_BOARD_TOP).toBe(c.MOBILE_BOARD_TOP);
    expect(L.MOBILE_BELOW).toBe(c.MOBILE_BELOW);
    expect(L.OPP_FAN_SPAN).toBe(c.OPP_FAN_SPAN);
    expect(L.DESKTOP_OPP_ROOM).toBe(c.DESKTOP_OPP_ROOM);
  });
  for (const t of TEMOIN.tailles) {
    it(`${t.vw} × ${t.vh} : gameLayout et desktopHandRight`, () => {
      expect(L.isMobile(t.vw)).toBe(t.mobile);
      expect(L.gameLayout(t.vw, t.vh)).toEqual(t.gameLayout);
      expect(L.desktopHandRight(t.vw)).toBe(t.desktopHandRight);
    });
  }
});
